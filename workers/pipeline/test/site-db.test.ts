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
	expect(new Set(all.map((p) => p.b))).toEqual(new Set([5, 7, 6.5, 6.2, 6, 8, 10, 11]));
});

test('slug resolution is kind-scoped by snapshot presence', async () => {
	expect(await getItemIdBySlug(env.DB, 'old-item')).toBe('OLD_ITEM');
	expect(await resolveBazaarId(env.DB, 'wheat')).toBe('WHEAT');
	expect(await resolveBazaarId(env.DB, 'old-item')).toBeUndefined();
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
	expect(json.bazaar!.raw.map(([, b]) => b)).toEqual([8, 10, 11]);
	expect(json.bazaar!.daily.length).toBe(1);
	expect(json.auctions).toBeUndefined();
});

test('itemSeriesJson hourly tier keeps only 4h-aligned points (t % 14400 = 0)', async () => {
	const aligned = 14_400 * 12_345;
	const misaligned = aligned + 3_600;
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

test('bazaarHistory includes raw points exactly at the 24h cap, excludes just past it', async () => {
	await env.DB.batch([
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('WHEAT', now - DAY, 20, 19),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('WHEAT', now - DAY - 1, 21, 20)
	]);
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

test('bazaarHistory includes hourly points exactly at the newest-minus-7d cap, excludes just past it', async () => {
	const cap = now - 102 * DAY;
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

test('getBazaarSnapshot serves the cached value across a direct table mutation within the TTL', async () => {
	const before = await getBazaarSnapshot(env.DB);
	await env.DB.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
		.bind(JSON.stringify({ qs: { bp: 999, sp: 998, bmw: 1, smw: 1 } }))
		.run();
	const after = await getBazaarSnapshot(env.DB);
	expect(after).toEqual(before);
	expect(after.products.WHEAT.qs.bp).toBe(10);
});

test('getBazaarSnapshot refetches once the TTL expires', async () => {
	await getBazaarSnapshot(env.DB);
	await env.DB.prepare("UPDATE bazaar_snapshot SET body = ? WHERE item = 'WHEAT'")
		.bind(JSON.stringify({ qs: { bp: 777, sp: 776, bmw: 1, smw: 1 } }))
		.run();
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date());
		vi.advanceTimersByTime(61_000);
		const after = await getBazaarSnapshot(env.DB);
		expect(after.products.WHEAT.qs.bp).toBe(777);
	} finally {
		vi.useRealTimers();
	}
});

test('bazaarSparks: 12 seeked tier-0 samples per visible snapshot product, shape rules for every edge case', async () => {
	const HOUR4 = 4 * 3_600;
	const since = now - 7 * DAY;

	const fullValues = Array.from({ length: 42 }, (_, i) => (i === 41 ? 1_234_567.89 : i + 1));
	const fullRows = fullValues
		.map((v, i) => `('SPARK_FULL', 0, ${since + (i + 1) * HOUR4}, ${v}, ${v - 1})`)
		.join(', ');

	await env.DB.batch([
		env.DB.prepare(`INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES ${fullRows}`),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_SINGLE', now - 1_000, 50, 49),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_OLD', now - 8 * DAY, 60, 59),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 1, ?, ?, ?), (?, 2, ?, ?, ?)'
		).bind('SPARK_TIER_ONLY', now - 2 * DAY, 80, 79, 'SPARK_TIER_ONLY', now - DAY, 90, 89),
		env.DB.prepare(
			'INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
		).bind('SPARK_NOT_LISTED', now - 500, 70, 69),
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

	const sparks = await bazaarSparks(
		env.DB,
		[
			'SPARK_FULL',
			'SPARK_SINGLE',
			'SPARK_OLD',
			'SPARK_EMPTY',
			'SPARK_TIER_ONLY',
			'SPARK_NOT_LISTED'
		],
		now
	);

	const full = sparks.get('SPARK_FULL')!;
	expect(full).toHaveLength(12);
	expect(full[11]).toBe(1_235_000);
	expect(full[10]).toBe(38);
	expect(full.every((v) => v === Number(v.toPrecision(4)))).toBe(true);
	expect(full.every((v, i) => i === 0 || v >= full[i - 1])).toBe(true);

	expect(sparks.get('SPARK_SINGLE')).toEqual([]);
	expect(sparks.get('SPARK_OLD')).toEqual([]);
	expect(sparks.has('SPARK_EMPTY')).toBe(true);
	expect(sparks.get('SPARK_EMPTY')).toEqual([]);
	expect(sparks.has('SPARK_NOT_LISTED')).toBe(false);
	expect(sparks.get('SPARK_TIER_ONLY')).toEqual([]);
	expect(sparks.has('WHEAT')).toBe(false);
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

	const sparks = await auctionSparks(env.DB, ['SPARK_AUCTION'], now);
	const values = sparks.get('SPARK_AUCTION')!;

	expect(values).toEqual([200, 250]);
	expect(values).not.toContain(100);
	expect(values).not.toContain(150);
});

const newRawPoint = () =>
	env.DB.prepare('INSERT INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)')
		.bind('WHEAT', now - 100, 12, 11)
		.run();

test('bazaarWindowChanges serves the cached value across a direct table mutation within the TTL', async () => {
	const since = now - DAY;
	const before = await bazaarWindowChanges(env.DB, since);
	expect(before).toEqual([{ id: 'WHEAT', first: 10, last: 11 }]);
	await newRawPoint();
	expect(await bazaarWindowChanges(env.DB, since)).toEqual([{ id: 'WHEAT', first: 10, last: 11 }]);
});

test('bazaarWindowChanges refetches once the TTL expires', async () => {
	const since = now - DAY;
	await bazaarWindowChanges(env.DB, since);
	await newRawPoint();
	vi.useFakeTimers();
	try {
		vi.setSystemTime(new Date());
		vi.advanceTimersByTime(61_000);
		expect(await bazaarWindowChanges(env.DB, since)).toEqual([
			{ id: 'WHEAT', first: 10, last: 12 }
		]);
	} finally {
		vi.useRealTimers();
	}
});

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

test('read layer works through a D1 session (read replication path)', async () => {
	const session = env.DB.withSession('first-unconstrained');

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
