import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import { writeBazaarRun, rollupAll, assertPopulated } from '../src/db';
import { bucketMedian, bazaarMedian, RAW_WINDOW } from '../../../src/lib/market/bucket';
import type { BazaarProductSnapshot } from '../../../src/lib/market/aggregate';

// DEVIATION from the brief: @cloudflare/vitest-pool-workers 0.21 (this
// project's installed version, needed for vitest 4) dropped per-test
// storage isolation in favor of per-file isolation - see
// https://github.com/cloudflare/workers-sdk/issues/12889. The brief's test
// bodies assume a clean DB at the start of each test (most visibly
// assertPopulated's "empty database" case, which would otherwise see rows
// left behind by earlier tests in this file). Restore that per-test
// isolation manually so every test body below is unchanged from the brief.
beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare('DELETE FROM bazaar_points'),
		env.DB.prepare('DELETE FROM bazaar_snapshot'),
		env.DB.prepare('DELETE FROM auction_points'),
		env.DB.prepare('DELETE FROM auction_snapshot'),
		env.DB.prepare('DELETE FROM items'),
		env.DB.prepare('DELETE FROM meta')
	]);
});

const HOUR = 3_600;

// Minimal snapshot: only qs.bp/qs.sp are read by the pipeline write path.
const snap = (bp: number, sp: number) => ({ qs: { bp, sp } }) as unknown as BazaarProductSnapshot;

const count = async (sql: string) =>
	(await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('writeBazaarRun', () => {
	test('inserts raw points and snapshot rows, skips zero-priced products', async () => {
		await writeBazaarRun(env.DB, 1_000_000_000_000, {
			WHEAT: snap(10.5, 9.5),
			DEAD: snap(0, 0)
		});
		expect(await count('SELECT COUNT(*) n FROM bazaar_points')).toBe(1);
		expect(await count('SELECT COUNT(*) n FROM bazaar_snapshot')).toBe(2);
		const meta = await env.DB.prepare("SELECT value FROM meta WHERE key='bazaar_updated'").first<{ value: string }>();
		expect(meta!.value).toBe('1000000000000');
	});

	test('re-running the same lastUpdated is idempotent (PK dedup)', async () => {
		await writeBazaarRun(env.DB, 1_000_000_000_000, { WHEAT: snap(10.5, 9.5) });
		await writeBazaarRun(env.DB, 1_000_000_000_000, { WHEAT: snap(99, 99) });
		expect(await count('SELECT COUNT(*) n FROM bazaar_points')).toBe(1);
		const p = await env.DB.prepare('SELECT buy FROM bazaar_points').first<{ buy: number }>();
		expect(p!.buy).toBe(10.5); // first write wins, like appendSnapshot's t<=last rejection
	});

	test('registers items rows with slugs', async () => {
		await writeBazaarRun(env.DB, 1_000_000_000_000, { ENCHANTED_BREAD: snap(1, 1) });
		const item = await env.DB.prepare("SELECT slug FROM items WHERE id='ENCHANTED_BREAD'").first<{ slug: string }>();
		expect(item!.slug).toBe('enchanted-bread');
	});
});

describe('rollupAll', () => {
	test('rolls aged raw points into hourly medians and deletes them; idempotent', async () => {
		const now = 2_000_000_000;
		const aged = now - RAW_WINDOW - 10 * HOUR; // safely past the cutoff
		const base = Math.floor(aged / HOUR) * HOUR;
		const pts = [0, 300, 600, 3_900].map((off, i) => ({ t: base + off, b: 10 + i, s: 5 + i }));
		await env.DB.batch(
			pts.map((p) =>
				env.DB
					.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)')
					.bind('WHEAT', p.t, p.b, p.s)
			)
		);
		await rollupAll(env.DB, now);
		const hourly = (await env.DB.prepare('SELECT t, buy, sell FROM bazaar_points WHERE tier=1 ORDER BY t').all())
			.results as { t: number; buy: number; sell: number }[];
		const expected = bucketMedian(pts.map((p) => ({ t: p.t, b: p.b, s: p.s })), HOUR, bazaarMedian);
		expect(hourly).toEqual(expected.map((p) => ({ t: p.t, buy: p.b, sell: p.s })));
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=0')).toBe(0);
		await rollupAll(env.DB, now); // second run: no change
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=1')).toBe(expected.length);
	});
});

describe('assertPopulated', () => {
	test('throws on an empty database', async () => {
		await expect(assertPopulated(env.DB)).rejects.toThrow(/empty/);
	});
});
