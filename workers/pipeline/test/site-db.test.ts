import { env } from 'cloudflare:test';
import { beforeEach, expect, test, vi } from 'vitest';
import {
	auctionHistory,
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
	// exact ascending order, not a self-referential sort check: the 2d-old raw
	// point (t = now - 2*DAY, b = 8) is excluded by the 24h raw cap.
	expect(h).toEqual([
		{ t: now - 100 * DAY, b: 5, s: 4 },
		{ t: now - 3 * DAY, b: 7, s: 6 },
		{ t: now - 600, b: 10, s: 9 },
		{ t: now - 300, b: 11, s: 10 }
	]);
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

// FINDING 1: itemSeriesJson's hourly tier has no time-window filter, only the
// `t % 14400 = 0` alignment predicate (SQL translation of series.ts's
// thinHourly: (t/HOUR) % 4 === 0). A distinct, unregistered id keeps this
// deterministic - it can't collide with the shared beforeEach's WHEAT hourly
// row, whose alignment to a 4h boundary is not otherwise guaranteed.
test('itemSeriesJson hourly tier keeps only 4h-aligned points (t % 14400 = 0)', async () => {
	const aligned = 14_400 * 12_345; // multiple of 14400 -> included
	const misaligned = aligned + 3_600; // +1h -> not a multiple of 14400 -> excluded
	await env.DB.batch([
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)').bind('HOURLY_TEST', aligned, 50, 40),
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)').bind('HOURLY_TEST', misaligned, 60, 50)
	]);
	const json = await itemSeriesJson(env.DB, 'HOURLY_TEST');
	expect(json.bazaar!.hourly).toEqual([[aligned, 50, 40]]);
});

// FINDING 2: boundary-value coverage for the window caps. Each pair inserts a
// point exactly AT the cap (must be INCLUDED, since the SQL uses >=) and one
// second past it (must be EXCLUDED), so a >= -> > mistake or an off-by-one
// constant would fail these even though the original seed data (which sits
// comfortably inside/outside the windows) would not catch it.
test('bazaarHistory includes raw points exactly at the 24h cap, excludes just past it', async () => {
	await env.DB.batch([
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)').bind('WHEAT', now - DAY, 20, 19),
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)').bind('WHEAT', now - DAY - 1, 21, 20)
	]);
	const points = (await bazaarHistory(env.DB, 'WHEAT')).map((p) => [p.t, p.b]);
	expect(points).toContainEqual([now - DAY, 20]);
	expect(points).not.toContainEqual([now - DAY - 1, 21]);
});

test('bazaarHistory includes hourly points exactly at the 7d cap, excludes just past it', async () => {
	await env.DB.batch([
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)').bind('WHEAT', now - 7 * DAY, 30, 29),
		env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)').bind('WHEAT', now - 7 * DAY - 1, 31, 30)
	]);
	const points = (await bazaarHistory(env.DB, 'WHEAT')).map((p) => [p.t, p.b]);
	expect(points).toContainEqual([now - 7 * DAY, 30]);
	expect(points).not.toContainEqual([now - 7 * DAY - 1, 31]);
});

// auctionHistory had no coverage at all before this fix; this test both adds
// baseline coverage (daily unconditional, raw capped at 7d) and the same
// boundary rigor as the bazaarHistory cases above.
test('auctionHistory caps raw at 7d (daily unconditional): includes the boundary, excludes just past it', async () => {
	await env.DB.batch([
		env.DB
			.prepare('INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 2, ?, ?, ?, ?)')
			.bind('WHEAT', now - 100 * DAY, 100, 110, 3),
		env.DB
			.prepare('INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)')
			.bind('WHEAT', now - 7 * DAY, 200, 210, 5),
		env.DB
			.prepare('INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)')
			.bind('WHEAT', now - 7 * DAY - 1, 300, 310, 7)
	]);
	const h = await auctionHistory(env.DB, 'WHEAT');
	expect(h).toEqual([
		{ t: now - 100 * DAY, l: 100, m: 110, c: 3 },
		{ t: now - 7 * DAY, l: 200, m: 210, c: 5 }
	]);
});

// FINDING 3: prove the 60s TTL cache actually serves a cached value instead
// of merely happening to return correct data because every test reseeds
// identical rows (as the module-level cache comment above claims but never
// demonstrated). Mutate the underlying row directly - bypassing db.ts
// entirely - and confirm the cached (stale) value is still what's returned.
test('getBazaarSnapshot serves the cached value across a direct table mutation within the TTL', async () => {
	const before = await getBazaarSnapshot(env.DB); // warms/reuses the 'bazaar' cache entry
	await env.DB
		.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
		.bind(JSON.stringify({ qs: { bp: 999, sp: 998, bmw: 1, smw: 1 } }))
		.run();
	const after = await getBazaarSnapshot(env.DB);
	expect(after).toEqual(before);
	expect(after.products.WHEAT.qs.bp).toBe(10); // still the seeded value, not the mutated 999
});

// Expiry half of FINDING 3: vitest-pool-workers runs the whole test file
// (including db.ts's Date.now() calls) inside the same workerd isolate as
// the test runner, so vi.useFakeTimers/setSystemTime patch the same
// globalThis.Date that db.ts reads from - confirmed empirically below by
// this test passing. If that ever regresses (fake timers stop reaching the
// isolate), this test - not production code - is what should be revisited.
test('getBazaarSnapshot refetches once the TTL expires', async () => {
	await getBazaarSnapshot(env.DB); // warm the cache with the seeded (bp=10) value
	await env.DB
		.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
		.bind(JSON.stringify({ qs: { bp: 777, sp: 776, bmw: 1, smw: 1 } }))
		.run();
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date());
		vi.advanceTimersByTime(61_000); // past the 60s TTL
		const after = await getBazaarSnapshot(env.DB);
		expect(after.products.WHEAT.qs.bp).toBe(777);
	} finally {
		vi.useRealTimers();
	}
});
