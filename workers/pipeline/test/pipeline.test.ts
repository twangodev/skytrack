import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, test } from 'vitest';
import {
	writeBazaarRun,
	writeAuctionRun,
	rollupAll,
	pruneStaleSnapshots,
	assertPopulated
} from '../src/db';
import {
	bucketMedian,
	bazaarMedian,
	auctionMedian,
	RAW_WINDOW,
	HOURLY_WINDOW,
	DAY
} from '../../../src/lib/market/bucket';
import type { BazaarProductSnapshot, AuctionItemStats } from '../../../src/lib/market/aggregate';

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

const count = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe('writeBazaarRun', () => {
	test('inserts raw points and snapshot rows, skips zero-priced products', async () => {
		await writeBazaarRun(env.DB, 1_000_000_000_000, {
			WHEAT: snap(10.5, 9.5),
			DEAD: snap(0, 0)
		});
		expect(await count('SELECT COUNT(*) n FROM bazaar_points')).toBe(1);
		expect(await count('SELECT COUNT(*) n FROM bazaar_snapshot')).toBe(2);
		const meta = await env.DB.prepare("SELECT value FROM meta WHERE key='bazaar_updated'").first<{
			value: string;
		}>();
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
		const item = await env.DB.prepare("SELECT slug FROM items WHERE id='ENCHANTED_BREAD'").first<{
			slug: string;
		}>();
		expect(item!.slug).toBe('enchanted-bread');
	});
});

describe('writeAuctionRun', () => {
	test('writes snapshot, points, meta, and upserts official item metadata', async () => {
		const stats: AuctionItemStats = {
			name: 'Hyperion',
			tier: 'LEGENDARY',
			lowestBin: 90_000_000,
			medianBin: 95_000_000,
			count: 12
		};
		await writeAuctionRun(
			env.DB,
			1_000_000_000_000,
			{ HYPERION: stats },
			{
				HYPERION: { name: 'Hyperion', tier: 'LEGENDARY', category: 'SWORD', npc: 1_000_000 }
			}
		);

		const item = await env.DB.prepare(
			"SELECT slug, name, tier, category, npc FROM items WHERE id='HYPERION'"
		).first<{ slug: string; name: string; tier: string; category: string; npc: number }>();
		expect(item).toEqual({
			slug: 'hyperion',
			name: 'Hyperion',
			tier: 'LEGENDARY',
			category: 'SWORD',
			npc: 1_000_000
		});

		const snapRow = await env.DB.prepare(
			"SELECT body, updated FROM auction_snapshot WHERE item='HYPERION'"
		).first<{ body: string; updated: number }>();
		expect(JSON.parse(snapRow!.body)).toEqual(stats);
		expect(snapRow!.updated).toBe(1_000_000_000);

		const point = await env.DB.prepare(
			"SELECT tier, lowest, median, count FROM auction_points WHERE item='HYPERION'"
		).first<{ tier: number; lowest: number; median: number; count: number }>();
		expect(point).toEqual({ tier: 0, lowest: 90_000_000, median: 95_000_000, count: 12 });

		const meta = await env.DB.prepare("SELECT value FROM meta WHERE key='auctions_updated'").first<{
			value: string;
		}>();
		expect(meta!.value).toBe('1000000000000');

		// upsert semantics: re-running with different official metadata updates
		// the existing row rather than erroring or leaving it stale.
		await writeAuctionRun(
			env.DB,
			1_000_000_001_000,
			{ HYPERION: stats },
			{
				HYPERION: { name: 'Hyperion', tier: 'LEGENDARY', category: 'SWORD', npc: 2_000_000 }
			}
		);
		const updated = await env.DB.prepare("SELECT npc FROM items WHERE id='HYPERION'").first<{
			npc: number;
		}>();
		expect(updated!.npc).toBe(2_000_000);
	});

	test('a new never-tracked official id colliding with an existing slug is skipped, run completes', async () => {
		await env.DB.prepare('INSERT INTO items (id, slug, name) VALUES (?, ?, ?)')
			.bind('FOO_BAR', 'foo-bar', 'Foo Bar')
			.run();

		const stats: AuctionItemStats = {
			name: 'Other Item',
			tier: 'COMMON',
			lowestBin: 100,
			medianBin: 120,
			count: 3
		};
		await writeAuctionRun(
			env.DB,
			1_000_000_000_000,
			{ OTHER_ITEM: stats },
			{
				'FOO-BAR': { name: 'Colliding Catalogue Entry' }, // slugs to 'foo-bar', already owned by FOO_BAR
				GOOD_ITEM: { name: 'Good Item', category: 'MISC' }
			}
		);

		// the colliding new catalogue id never landed...
		const colliding = await env.DB.prepare("SELECT id FROM items WHERE id='FOO-BAR'").first();
		expect(colliding).toBeNull();
		// ...the pre-existing owner is untouched...
		const owner = await env.DB.prepare("SELECT name FROM items WHERE id='FOO_BAR'").first<{
			name: string;
		}>();
		expect(owner!.name).toBe('Foo Bar');
		// ...and every other write in the same run still landed.
		const good = await env.DB.prepare("SELECT category FROM items WHERE id='GOOD_ITEM'").first<{
			category: string;
		}>();
		expect(good!.category).toBe('MISC');
		const other = await env.DB.prepare("SELECT id FROM items WHERE id='OTHER_ITEM'").first();
		expect(other).not.toBeNull();
		const meta = await env.DB.prepare("SELECT value FROM meta WHERE key='auctions_updated'").first<{
			value: string;
		}>();
		expect(meta!.value).toBe('1000000000000');
	});

	test('an aggregated auction id colliding with an existing slug still rejects loudly', async () => {
		await env.DB.prepare('INSERT INTO items (id, slug, name) VALUES (?, ?, ?)')
			.bind('BAZ_QUX', 'baz-qux', 'Baz Qux')
			.run();

		const stats: AuctionItemStats = {
			name: 'Colliding Data Item',
			tier: 'RARE',
			lowestBin: 500,
			medianBin: 550,
			count: 2
		};
		await expect(
			writeAuctionRun(env.DB, 1_000_000_000_000, { 'BAZ-QUX': stats }, {})
		).rejects.toThrow();
	});
});

describe('rollupAll', () => {
	test('bazaar raw->hourly: rolls aged raw points into hourly medians and deletes them; idempotent', async () => {
		const now = 2_000_000_000;
		const aged = now - RAW_WINDOW - 10 * HOUR; // safely past the cutoff
		const base = Math.floor(aged / HOUR) * HOUR;
		const pts = [0, 300, 600, 3_900].map((off, i) => ({ t: base + off, b: 10 + i, s: 5 + i }));
		const insertRaw = () =>
			env.DB.batch(
				pts.map((p) =>
					env.DB.prepare(
						'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
					).bind('WHEAT', p.t, p.b, p.s)
				)
			);

		await insertRaw();
		await rollupAll(env.DB, now);
		const hourly = (
			await env.DB.prepare('SELECT t, buy, sell FROM bazaar_points WHERE tier=1 ORDER BY t').all()
		).results as { t: number; buy: number; sell: number }[];
		const expected = bucketMedian(
			pts.map((p) => ({ t: p.t, b: p.b, s: p.s })),
			HOUR,
			bazaarMedian
		);
		expect(hourly).toEqual(expected.map((p) => ({ t: p.t, buy: p.b, sell: p.s })));
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=0')).toBe(0);

		// Crash-recovery: re-insert the SAME source rows (as if a crash left
		// tier-0 rows undeleted and the run resumed) and roll again -
		// INSERT OR REPLACE must reproduce byte-identical bucket VALUES, not
		// just an unchanged row count.
		await insertRaw();
		await rollupAll(env.DB, now);
		const hourlyAgain = (
			await env.DB.prepare('SELECT t, buy, sell FROM bazaar_points WHERE tier=1 ORDER BY t').all()
		).results as { t: number; buy: number; sell: number }[];
		expect(hourlyAgain).toEqual(hourly);
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=0')).toBe(0);
	});

	test('bazaar hourly->daily: rolls aged hourly points into daily medians and deletes them', async () => {
		const now = 2_000_000_000;
		const aged = now - HOURLY_WINDOW - 10 * DAY; // safely past the cutoff
		const base = Math.floor(aged / DAY) * DAY;
		// spans two DAY buckets: offsets 0/3h/20h land in the first day, 26h
		// (2h past the 24h boundary) lands in the second.
		const pts = [0, 3 * HOUR, 20 * HOUR, 26 * HOUR].map((off, i) => ({
			t: base + off,
			b: 10 + i,
			s: 5 + i
		}));
		await env.DB.batch(
			pts.map((p) =>
				env.DB.prepare(
					'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)'
				).bind('WHEAT', p.t, p.b, p.s)
			)
		);

		await rollupAll(env.DB, now);
		const daily = (
			await env.DB.prepare('SELECT t, buy, sell FROM bazaar_points WHERE tier=2 ORDER BY t').all()
		).results as { t: number; buy: number; sell: number }[];
		const expected = bucketMedian(
			pts.map((p) => ({ t: p.t, b: p.b, s: p.s })),
			DAY,
			bazaarMedian
		);
		expect(daily).toEqual(expected.map((p) => ({ t: p.t, buy: p.b, sell: p.s })));
		expect(daily.length).toBeGreaterThan(1); // confirms both day buckets landed
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=1')).toBe(0);
	});

	test('auctions raw->daily: rolls aged raw points straight into daily medians, skipping an hourly tier', async () => {
		const now = 2_000_000_000;
		const aged = now - RAW_WINDOW - 10 * DAY; // safely past the cutoff
		const base = Math.floor(aged / DAY) * DAY;
		// spans two DAY buckets: offsets 0/5h land in the first day, 30h lands
		// in the second.
		const pts = [0, 5 * HOUR, 30 * HOUR].map((off, i) => ({
			t: base + off,
			l: 100 + i * 10,
			m: 150 + i * 10,
			c: 5 + i
		}));
		await env.DB.batch(
			pts.map((p) =>
				env.DB.prepare(
					'INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)'
				).bind('HYPERION', p.t, p.l, p.m, p.c)
			)
		);

		await rollupAll(env.DB, now);
		const daily = (
			await env.DB.prepare(
				'SELECT t, lowest, median, count FROM auction_points WHERE tier=2 ORDER BY t'
			).all()
		).results as { t: number; lowest: number; median: number; count: number }[];
		const expected = bucketMedian(
			pts.map((p) => ({ t: p.t, l: p.l, m: p.m, c: p.c })),
			DAY,
			auctionMedian
		);
		expect(daily).toEqual(expected.map((p) => ({ t: p.t, lowest: p.l, median: p.m, count: p.c })));
		expect(await count('SELECT COUNT(*) n FROM auction_points WHERE tier=0')).toBe(0);
		// auctions never pass through an intermediate tier=1 (fromTier 0 ->
		// intoTier 2 directly).
		expect(await count('SELECT COUNT(*) n FROM auction_points WHERE tier=1')).toBe(0);
	});

	test('bazaar raw->hourly: correctly aggregates points spanning multiple 6h slices', async () => {
		const now = 2_000_000_000;
		const aged = now - RAW_WINDOW - 20 * HOUR; // 20h of headroom before the cutoff
		const base = Math.floor(aged / HOUR) * HOUR;
		// 0h/7h/14h apart: wider than one 6h slice (sliceSeconds), so the
		// paging loop in rollupTier must run more than once to see all of
		// them, and each lands in its own hourly bucket.
		const pts = [0, 7 * HOUR, 14 * HOUR].map((off, i) => ({ t: base + off, b: 10 + i, s: 5 + i }));
		await env.DB.batch(
			pts.map((p) =>
				env.DB.prepare(
					'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
				).bind('WHEAT', p.t, p.b, p.s)
			)
		);

		await rollupAll(env.DB, now);
		const hourly = (
			await env.DB.prepare('SELECT t, buy, sell FROM bazaar_points WHERE tier=1 ORDER BY t').all()
		).results as { t: number; buy: number; sell: number }[];
		const expected = bucketMedian(
			pts.map((p) => ({ t: p.t, b: p.b, s: p.s })),
			HOUR,
			bazaarMedian
		);
		expect(expected.length).toBe(3); // sanity: each point really is its own bucket
		expect(hourly).toEqual(expected.map((p) => ({ t: p.t, buy: p.b, sell: p.s })));
		expect(await count('SELECT COUNT(*) n FROM bazaar_points WHERE tier=0')).toBe(0);
	});
});

describe('pruneStaleSnapshots', () => {
	test('deletes snapshots older than a day, keeps fresh ones', async () => {
		const now = 2_000_000_000;
		await env.DB.batch([
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'STALE',
				'{}',
				now - DAY - 1
			),
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'FRESH',
				'{}',
				now - 10
			),
			env.DB.prepare('INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'STALE',
				'{}',
				now - DAY - 1
			),
			env.DB.prepare('INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'FRESH',
				'{}',
				now - 10
			)
		]);

		await pruneStaleSnapshots(env.DB, now);

		const bazaarLeft = await env.DB.prepare('SELECT item FROM bazaar_snapshot').all<{
			item: string;
		}>();
		expect(bazaarLeft.results.map((r) => r.item)).toEqual(['FRESH']);
		const auctionLeft = await env.DB.prepare('SELECT item FROM auction_snapshot').all<{
			item: string;
		}>();
		expect(auctionLeft.results.map((r) => r.item)).toEqual(['FRESH']);
	});

	// Safety floor: if a whole kind failed to crawl, every one of its snapshot
	// rows is stale and an unguarded DELETE would empty the table (wiping the
	// catalogue the site reads). The MAX(updated) >= cutoff guard turns that
	// case into a no-op.
	test('keeps every row when the entire table is stale (the kind has not run)', async () => {
		const now = 2_000_000_000;
		await env.DB.batch([
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'OLD_A',
				'{}',
				now - DAY - 1
			),
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'OLD_B',
				'{}',
				now - 3 * DAY
			),
			env.DB.prepare('INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'OLD_A',
				'{}',
				now - DAY - 1
			),
			env.DB.prepare('INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'OLD_B',
				'{}',
				now - 3 * DAY
			)
		]);

		await pruneStaleSnapshots(env.DB, now);

		const bazaarLeft = await env.DB.prepare('SELECT item FROM bazaar_snapshot ORDER BY item').all<{
			item: string;
		}>();
		expect(bazaarLeft.results.map((r) => r.item)).toEqual(['OLD_A', 'OLD_B']);
		const auctionLeft = await env.DB.prepare(
			'SELECT item FROM auction_snapshot ORDER BY item'
		).all<{ item: string }>();
		expect(auctionLeft.results.map((r) => r.item)).toEqual(['OLD_A', 'OLD_B']);
	});

	// The guard is per-table: a stale auction crawl must not stop the bazaar
	// table (which did run) from being pruned.
	test('prunes one table while the other is entirely stale', async () => {
		const now = 2_000_000_000;
		await env.DB.batch([
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'STALE',
				'{}',
				now - DAY - 1
			),
			env.DB.prepare('INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'FRESH',
				'{}',
				now - 10
			),
			env.DB.prepare('INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?)').bind(
				'OLD_ONLY',
				'{}',
				now - DAY - 1
			)
		]);

		await pruneStaleSnapshots(env.DB, now);

		const bazaarLeft = await env.DB.prepare('SELECT item FROM bazaar_snapshot').all<{
			item: string;
		}>();
		expect(bazaarLeft.results.map((r) => r.item)).toEqual(['FRESH']);
		const auctionLeft = await env.DB.prepare('SELECT item FROM auction_snapshot').all<{
			item: string;
		}>();
		expect(auctionLeft.results.map((r) => r.item)).toEqual(['OLD_ONLY']);
	});
});

describe('assertPopulated', () => {
	test('throws on an empty database', async () => {
		await expect(assertPopulated(env.DB)).rejects.toThrow(/empty/);
	});
});
