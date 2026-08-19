import { env } from 'cloudflare:test';
import { beforeEach, expect, test, vi } from 'vitest';
import {
	auctionHistory,
	auctionSparks,
	bazaarHistory,
	bazaarSeriesSince,
	bazaarSeriesSinceSql,
	bazaarSparks,
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
		env.DB.prepare(
			"INSERT INTO items (id, slug, name) VALUES ('WHEAT', 'wheat', 'Wheat'), ('OLD_ITEM', 'old-item', 'Old Item')"
		),
		env.DB.prepare("INSERT INTO bazaar_snapshot (item, body, updated) VALUES ('WHEAT', ?, ?)").bind(
			JSON.stringify({ qs: { bp: 10, sp: 9, bmw: 500000, smw: 400000 } }),
			now
		),
		env.DB.prepare("INSERT INTO meta (key, value) VALUES ('bazaar_updated', ?)").bind(
			String(now * 1000)
		),
		// Ages match what the rollup can actually produce: the hourly tier only
		// ever holds points that have aged out of the 90d raw window, so its
		// newest row here is 95d old (an `t >= now - 7d` hourly row is
		// impossible). daily 100d, hourly 95/99/101/103d, raw now-ish and 2d.
		env.DB.prepare(
			`INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES
			 ('WHEAT', 2, ${now - 100 * DAY}, 5, 4),
			 ('WHEAT', 1, ${now - 95 * DAY}, 7, 6),
			 ('WHEAT', 1, ${now - 99 * DAY}, 6.5, 5.5),
			 ('WHEAT', 1, ${now - 101 * DAY}, 6.2, 5.2),
			 ('WHEAT', 1, ${now - 103 * DAY}, 6, 5),
			 ('WHEAT', 0, ${now - 2 * DAY}, 8, 7),
			 ('WHEAT', 0, ${now - 600}, 10, 9),
			 ('WHEAT', 0, ${now - 300}, 11, 10)`
		)
	];
	await env.DB.batch(stmts);
});

test('bazaarHistory caps tiers: daily all, hourly 7d of its own tail, raw 24h', async () => {
	const h = await bazaarHistory(env.DB, 'WHEAT');
	// Exact ascending order, not a self-referential sort check. Excluded:
	// the 2d-old raw point (b = 8, past the 24h raw cap) and the 103d-old
	// hourly point (b = 6), which is older than the hourly tier's own newest
	// point (95d) minus 7 days.
	expect(h).toEqual([
		{ t: now - 101 * DAY, b: 6.2, s: 5.2 },
		{ t: now - 100 * DAY, b: 5, s: 4 },
		{ t: now - 99 * DAY, b: 6.5, s: 5.5 },
		{ t: now - 95 * DAY, b: 7, s: 6 },
		{ t: now - 600, b: 10, s: 9 },
		{ t: now - 300, b: 11, s: 10 }
	]);
});

test('bazaarSummaryHistory returns every tier and point, windows ignored', async () => {
	const all = await bazaarSummaryHistory(env.DB, 'WHEAT');
	// every seeded row, including the two bazaarHistory windows out
	expect(new Set(all.map((p) => p.b))).toEqual(new Set([5, 7, 6.5, 6.2, 6, 8, 10, 11]));
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
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)'
		).bind('HOURLY_TEST', aligned, 50, 40),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)'
		).bind('HOURLY_TEST', misaligned, 60, 50)
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
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('WHEAT', now - DAY, 20, 19),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('WHEAT', now - DAY - 1, 21, 20)
	]);
	// pin the clock: the function recomputes now at call time; on slow CI the
	// drift pushes the boundary seed past the cap
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date(now * 1000));
		const points = (await bazaarHistory(env.DB, 'WHEAT')).map((p) => [p.t, p.b]);
		expect(points).toContainEqual([now - DAY, 20]);
		expect(points).not.toContainEqual([now - DAY - 1, 21]);
	} finally {
		vi.useRealTimers();
	}
});

// The hourly cap is relative to the hourly tier's newest point, not to `now`:
// the seed's newest tier-1 row is 95d old, so the cap sits at 102d.
test('bazaarHistory includes hourly points exactly at the newest-minus-7d cap, excludes just past it', async () => {
	const cap = now - 102 * DAY; // (now - 95*DAY) - 7*DAY
	await env.DB.batch([
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)'
		).bind('WHEAT', cap, 30, 29),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?)'
		).bind('WHEAT', cap - 1, 31, 30)
	]);
	const points = (await bazaarHistory(env.DB, 'WHEAT')).map((p) => [p.t, p.b]);
	expect(points).toContainEqual([cap, 30]);
	expect(points).not.toContainEqual([cap - 1, 31]);
});

// auctionHistory had no coverage at all before this fix; this test both adds
// baseline coverage (daily unconditional, raw capped at 7d) and the same
// boundary rigor as the bazaarHistory cases above.
test('auctionHistory caps raw at 7d (daily unconditional): includes the boundary, excludes just past it', async () => {
	await env.DB.batch([
		env.DB.prepare(
			'INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 2, ?, ?, ?, ?)'
		).bind('WHEAT', now - 100 * DAY, 100, 110, 3),
		env.DB.prepare(
			'INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)'
		).bind('WHEAT', now - 7 * DAY, 200, 210, 5),
		env.DB.prepare(
			'INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)'
		).bind('WHEAT', now - 7 * DAY - 1, 300, 310, 7)
	]);
	// pin the clock: the function recomputes now at call time; on slow CI the
	// drift pushes the boundary seed past the cap
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date(now * 1000));
		const h = await auctionHistory(env.DB, 'WHEAT');
		expect(h).toEqual([
			{ t: now - 100 * DAY, l: 100, m: 110, c: 3 },
			{ t: now - 7 * DAY, l: 200, m: 210, c: 5 }
		]);
	} finally {
		vi.useRealTimers();
	}
});

// FINDING 3: prove the 60s TTL cache actually serves a cached value instead
// of merely happening to return correct data because every test reseeds
// identical rows (as the module-level cache comment above claims but never
// demonstrated). Mutate the underlying row directly - bypassing db.ts
// entirely - and confirm the cached (stale) value is still what's returned.
test('getBazaarSnapshot serves the cached value across a direct table mutation within the TTL', async () => {
	const before = await getBazaarSnapshot(env.DB); // warms/reuses the 'bazaar' cache entry
	await env.DB.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
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
	await env.DB.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
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

// bazaarSparks/auctionSparks are cached('bazaarSparks'/'auctionSparks', ...)
// under the same 60s TTL as the rest of db.ts, but the cache key ignores
// `now` (per the function's doc comment), so two calls to bazaarSparks
// within 60s of each other - even across separate test() bodies, since the
// module-level cache Map outlives beforeEach's table resets - serve the
// SAME stale Map regardless of what's reseeded in between. Seed every
// scenario once and assert them all from a single bazaarSparks(...) call
// (ditto for auctionSparks) so the cache never leaks stale expectations
// between tests.
test('bazaarSparks: 12 seeked tier-0 samples per snapshot-listed product, shape rules for every edge case', async () => {
	const HOUR4 = 4 * 3_600;
	const since = now - 7 * DAY;

	// SPARK_FULL: tier-0 points every 4h across the full 7d window, strictly
	// increasing buy, last point exactly at `now` (42 * 14400s = 604800s = 7d).
	// The last point's price is deliberately un-round: the 12th sample time is
	// exactly `now`, so 1234567.89 there has to come back as 1235000 (4
	// significant figures) rather than passing through unrounded.
	const fullValues = Array.from({ length: 42 }, (_, i) => (i === 41 ? 1_234_567.89 : i + 1));
	const fullRows = fullValues
		.map((v, i) => `('SPARK_FULL', 0, ${since + (i + 1) * HOUR4}, ${v}, ${v - 1})`)
		.join(', ');

	await env.DB.batch([
		env.DB.prepare(`INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES ${fullRows}`),
		// SPARK_SINGLE: exactly one tier-0 point in the window.
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_SINGLE', now - 1_000, 50, 49),
		// SPARK_OLD: only tier-0 points older than 7 days.
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_OLD', now - 8 * DAY, 60, 59),
		// SPARK_TIER_ONLY: tier 1 and tier 2 points inside the window, no tier 0 at all.
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?), (?, 2, ?, ?, ?)'
		).bind('SPARK_TIER_ONLY', now - 2 * DAY, 80, 79, 'SPARK_TIER_ONLY', now - DAY, 90, 89),
		// SPARK_NOT_LISTED: has tier-0 points but is absent from bazaar_snapshot.
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_NOT_LISTED', now - 500, 70, 69),
		// items + snapshot rows for every listed id (SPARK_EMPTY has no points at all).
		env.DB.prepare(
			`INSERT INTO items (id, slug, name) VALUES
			 ('SPARK_FULL', 'spark-full', 'Spark Full'),
			 ('SPARK_SINGLE', 'spark-single', 'Spark Single'),
			 ('SPARK_OLD', 'spark-old', 'Spark Old'),
			 ('SPARK_EMPTY', 'spark-empty', 'Spark Empty'),
			 ('SPARK_TIER_ONLY', 'spark-tier-only', 'Spark Tier Only')`
		),
		env.DB.prepare(
			`INSERT INTO bazaar_snapshot (item, body, updated) VALUES
			 ('SPARK_FULL', '{}', ${now}),
			 ('SPARK_SINGLE', '{}', ${now}),
			 ('SPARK_OLD', '{}', ${now}),
			 ('SPARK_EMPTY', '{}', ${now}),
			 ('SPARK_TIER_ONLY', '{}', ${now})`
		)
	]);

	const sparks = await bazaarSparks(env.DB, now);

	// 1. exactly 12 values, each rounded to 4 sig figs, last === the newest buy
	// rounded (1234567.89 -> 1235000), non-decreasing (seed buy is
	// monotonically increasing with t).
	const full = sparks.get('SPARK_FULL')!;
	expect(full).toHaveLength(12);
	expect(full[11]).toBe(1_235_000);
	expect(full[10]).toBe(38); // the 11th sample still seeks an un-rounded value
	expect(full.every((v) => v === Number(v.toPrecision(4)))).toBe(true);
	expect(full.every((v, i) => i === 0 || v >= full[i - 1])).toBe(true);

	// 2. a single in-window tier-0 point -> [].
	expect(sparks.get('SPARK_SINGLE')).toEqual([]);
	// 3. only points older than 7 days -> [].
	expect(sparks.get('SPARK_OLD')).toEqual([]);
	// 4. no points at all -> [] (key present).
	expect(sparks.has('SPARK_EMPTY')).toBe(true);
	expect(sparks.get('SPARK_EMPTY')).toEqual([]);
	// 5. points exist but the item isn't snapshot-listed -> absent from the map.
	expect(sparks.has('SPARK_NOT_LISTED')).toBe(false);
	// 6. tier 1/2 points inside the window are ignored; tier-0-only listed
	// product with no tier-0 points -> [].
	expect(sparks.get('SPARK_TIER_ONLY')).toEqual([]);
});

test('auctionSparks samples the median column (not lowest) for snapshot-listed auction items', async () => {
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO items (id, slug, name) VALUES ('SPARK_AUCTION', 'spark-auction', 'Spark Auction')"
		),
		env.DB.prepare(
			"INSERT INTO auction_snapshot (item, body, updated) VALUES ('SPARK_AUCTION', '{}', ?)"
		).bind(now),
		env.DB.prepare(
			'INSERT INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?), (?, 0, ?, ?, ?, ?)'
		).bind('SPARK_AUCTION', now - DAY, 100, 200, 5, 'SPARK_AUCTION', now, 150, 250, 6)
	]);

	const sparks = await auctionSparks(env.DB, now);
	const values = sparks.get('SPARK_AUCTION')!;

	expect(values).toEqual([200, 250]); // medians, in time order
	expect(values).not.toContain(100); // lowest values must not leak in
	expect(values).not.toContain(150);
});

// bazaarWindowChanges and bazaarSeriesSince are cached under minute-bucketed
// keys, so the repeat renders a single page does inside the TTL cost one
// query, not one per render. Those keys change over time, so every miss also
// sweeps expired entries out of the Map (otherwise it would grow for the life
// of the isolate). The sweep isn't observable from outside the module, so what
// is asserted here is the visible half: a hit inside the TTL, a refetch past
// it. Same direct-mutation trick as the getBazaarSnapshot pair above.
const newRawPoint = () =>
	env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)')
		.bind('WHEAT', now - 100, 12, 11)
		.run();

test('bazaarWindowChanges serves the cached value across a direct table mutation within the TTL', async () => {
	const since = now - DAY;
	const before = await bazaarWindowChanges(env.DB, since);
	expect(before).toEqual([{ id: 'WHEAT', first: 10, last: 11 }]);
	await newRawPoint(); // a newer raw point would move `last` to 12 on a refetch
	expect(await bazaarWindowChanges(env.DB, since)).toEqual([{ id: 'WHEAT', first: 10, last: 11 }]);
});

test('bazaarWindowChanges refetches once the TTL expires', async () => {
	const since = now - DAY;
	await bazaarWindowChanges(env.DB, since); // warm (or reuse) the minute-bucketed key
	await newRawPoint();
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date());
		vi.advanceTimersByTime(61_000); // past the 60s TTL
		expect(await bazaarWindowChanges(env.DB, since)).toEqual([
			{ id: 'WHEAT', first: 10, last: 12 }
		]);
	} finally {
		vi.useRealTimers();
	}
});

// Regression pin for the production incident: a global `ORDER BY t` makes
// SQLite pick bazaar_points_tier_t (tier=? AND t>?) because that index
// already yields t-order for free, which scans every item's rows in the
// window (~4.3M rows at production 7d size) instead of seeking per item.
// `WHERE item IN (...) AND tier = 0 AND t >= ?` with `ORDER BY item, t`
// keeps the planner on PRIMARY KEY (item=? AND tier=? AND t>?) - bounded
// per-item seeks. This asserts the plan on bazaarSeriesSinceSql, the exact
// builder bazaarSeriesSince prepares from (not a hand-copied literal), so a
// future edit that reintroduces the global ordering fails here structurally
// instead of only in production.
test('bazaarSeriesSince query plan stays on the primary key (regression pin for the D1 CPU-limit reset)', async () => {
	const chunk = ['WHEAT', 'A', 'B'];
	const placeholders = chunk.map(() => '?').join(',');
	const sql = bazaarSeriesSinceSql(placeholders);
	const { results } = await env.DB.prepare('EXPLAIN QUERY PLAN ' + sql)
		.bind(...chunk, now - DAY)
		.all<{ detail: string }>();
	const details = results.map((r) => r.detail);
	expect(details.some((d) => d.includes('USING PRIMARY KEY'))).toBe(true);
	expect(details.some((d) => d.includes('bazaar_points_tier_t'))).toBe(false);
});

// bazaarSeriesSince groups rows into a per-item Map; every call site (movers
// downsample, index-page sparks/bucketing, the bazaar markdown route) only
// needs per-item ascending t, so this asserts that ordering directly - not
// just lengths - across two items with interleaved timestamps.
test('bazaarSeriesSince returns each item ascending by t, unaffected by interleaving', async () => {
	const since = now - 3 * DAY;
	await env.DB.batch([
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SERIES_A', since + 100, 1, 1),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SERIES_B', since + 150, 2, 2),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SERIES_A', since + 200, 3, 3),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SERIES_B', since + 250, 4, 4),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SERIES_A', since + 300, 5, 5)
	]);

	const series = await bazaarSeriesSince(env.DB, ['SERIES_A', 'SERIES_B'], since);

	expect(series.get('SERIES_A')).toEqual([
		{ t: since + 100, b: 1, s: 1 },
		{ t: since + 200, b: 3, s: 3 },
		{ t: since + 300, b: 5, s: 5 }
	]);
	expect(series.get('SERIES_B')).toEqual([
		{ t: since + 150, b: 2, s: 2 },
		{ t: since + 250, b: 4, s: 4 }
	]);
});

// Read replication: requireDb() hands query functions a D1Database Session
// (env.DB.withSession(...)) instead of the plain binding. Prove the read
// layer actually works when called through that session object, not just
// through env.DB directly - same seeds, same real values as the
// direct-binding tests above (snapshot round-trip and bazaarHistory tier
// capping), just routed through the session's prepare/batch.
test('read layer works through a D1 session (read replication path)', async () => {
	const session = env.DB.withSession('first-unconstrained');

	// The earlier 'getBazaarSnapshot refetches once the TTL expires' test
	// leaves the module-level 'bazaar' cache entry timestamped via an
	// advanced fake clock (now + 61s), which sits ahead of real time - a
	// same-size 61s jump here lands right back inside that entry's TTL
	// window and would still read its stale (bp=777) value instead of a
	// fresh compute. Jump forward by an hour, comfortably past that, so this
	// assertion exercises the session actually querying the DB (with the
	// current, beforeEach-seeded bp=10 row) rather than any leftover cache.
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date());
		vi.advanceTimersByTime(60 * 60 * 1000);
		const snap = await getBazaarSnapshot(session);
		expect(snap.lastUpdated).toBe(now * 1000);
		expect(snap.products.WHEAT.qs.bp).toBe(10);
	} finally {
		vi.useRealTimers();
	}

	// bazaarHistory isn't cached, but it derives its 24h raw-tier window from
	// Date.now() at call time, so it must run under the real clock - the
	// seeded raw points are only real-time-recent, not fake-clock-recent.
	const h = await bazaarHistory(session, 'WHEAT');
	expect(h).toEqual([
		{ t: now - 101 * DAY, b: 6.2, s: 5.2 },
		{ t: now - 100 * DAY, b: 5, s: 4 },
		{ t: now - 99 * DAY, b: 6.5, s: 5.5 },
		{ t: now - 95 * DAY, b: 7, s: 6 },
		{ t: now - 600, b: 10, s: 9 },
		{ t: now - 300, b: 11, s: 10 }
	]);
});
