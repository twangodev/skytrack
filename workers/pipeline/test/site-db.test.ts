import { env } from 'cloudflare:test';
import { beforeEach, expect, test } from 'vitest';
import {
	bazaarHistory,
	bazaarSummaryHistory,
	bazaarWindowChanges,
	getBazaarSnapshot,
	getItemIdBySlug,
	itemSeriesJson,
	resolveBazaarId
} from '../../../src/lib/server/db';

const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

// beforeEach, not beforeAll: @cloudflare/vitest-pool-workers 0.21 (this
// project's installed version) dropped per-test storage isolation in favor
// of per-file isolation - see https://github.com/cloudflare/workers-sdk/issues/12889.
// Mirror pipeline.test.ts's manual reset so every test body starts from a
// clean DB and seeds are re-applied per test. The db.ts 60s TTL cache
// re-serves identical values across tests, which is harmless because every
// test seeds the same rows.
beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM bazaar_points'),
		env.DB.prepare('DELETE FROM bazaar_snapshot'),
		env.DB.prepare('DELETE FROM auction_points'),
		env.DB.prepare('DELETE FROM auction_snapshot'),
		env.DB.prepare('DELETE FROM items'),
		env.DB.prepare('DELETE FROM meta')
	]);

	const stmts = [
		env.DB.prepare("INSERT INTO items (id, slug, name) VALUES ('WHEAT', 'wheat', 'Wheat'), ('OLD_ITEM', 'old-item', 'Old Item')"),
		env.DB.prepare("INSERT INTO bazaar_snapshot (item, body, updated) VALUES ('WHEAT', ?, ?)").bind(
			JSON.stringify({ qs: { bp: 10, sp: 9, bmw: 500000, smw: 400000 } }),
			now
		),
		env.DB.prepare("INSERT INTO meta (key, value) VALUES ('bazaar_updated', ?)").bind(String(now * 1000)),
		// daily point (old), hourly point (3d ago), raw points (now-ish and 2d ago)
		env.DB.prepare(
			`INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES
			 ('WHEAT', 2, ${now - 100 * DAY}, 5, 4),
			 ('WHEAT', 1, ${now - 3 * DAY}, 7, 6),
			 ('WHEAT', 0, ${now - 2 * DAY}, 8, 7),
			 ('WHEAT', 0, ${now - 600}, 10, 9),
			 ('WHEAT', 0, ${now - 300}, 11, 10)`
		)
	];
	await env.DB.batch(stmts);
});

test('bazaarHistory caps tiers: daily all, hourly 7d, raw 24h', async () => {
	const h = await bazaarHistory(env.DB, 'WHEAT');
	expect(h.map((p) => p.b)).toEqual([5, 7, 10, 11]); // 2d-old raw point excluded
	expect(h).toEqual([...h].sort((a, b) => a.t - b.t));
});

test('bazaarSummaryHistory returns every tier and point', async () => {
	expect((await bazaarSummaryHistory(env.DB, 'WHEAT')).length).toBe(5);
});

test('slug resolution is kind-scoped by snapshot presence', async () => {
	expect(await getItemIdBySlug(env.DB, 'old-item')).toBe('OLD_ITEM'); // known id (data route)
	expect(await resolveBazaarId(env.DB, 'wheat')).toBe('WHEAT');
	expect(await resolveBazaarId(env.DB, 'old-item')).toBeUndefined(); // not in current snapshot -> page 404s
});

test('snapshot round-trips shape and lastUpdated', async () => {
	const snap = await getBazaarSnapshot(env.DB);
	expect(snap.lastUpdated).toBe(now * 1000);
	expect(snap.products.WHEAT.qs.bp).toBe(10);
});

test('windowChanges yields first/last raw price in window', async () => {
	const changes = await bazaarWindowChanges(env.DB, now - DAY);
	expect(changes).toEqual([{ id: 'WHEAT', first: 10, last: 11 }]);
});

test('itemSeriesJson trims and shapes tiers like series.ts', async () => {
	const json = await itemSeriesJson(env.DB, 'WHEAT');
	expect(json.bazaar!.raw.map(([, b]) => b)).toEqual([8, 10, 11]); // all within 35d RAW_SLICE
	expect(json.bazaar!.daily.length).toBe(1);
	expect(json.auctions).toBeUndefined();
});
