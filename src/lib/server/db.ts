import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { BazaarProductSnapshot, AuctionItemStats } from '../market/aggregate';
import {
	RAW_SLICE,
	type ItemSeriesJson,
	type BazaarTuple,
	type AuctionTuple
} from '../market/series';
import { titleCase } from '../format';
import { AsyncCache } from './async-cache';
import {
	HOURLY_WINDOW,
	HOUR,
	auctionMedian,
	bazaarMedian,
	bucketMedian,
	type AuctionPoint,
	type BazaarPoint
} from '../market/bucket';
import {
	DAY_SHARDS,
	SNAPSHOT_SHARDS,
	parseJsonArray,
	parseJsonRecord,
	shardFor,
	utcDay,
	type MarketKind,
	type PackedAuctionPoint,
	type PackedBazaarPoint,
	type PackedPointByMarket
} from '../market/packed';
import { useDrizzle, type D1Client } from './orm';
import { auctionSnapshots, bazaarSnapshots, items as itemsTable, metadata } from './schema';

export interface ItemMeta {
	name: string;
	tier?: string;
	category?: string;
	npc?: number;
}

interface BazaarFile {
	lastUpdated: number;
	products: Record<string, BazaarProductSnapshot>;
}

interface AuctionsFile {
	lastUpdated: number;
	items: Record<string, AuctionItemStats>;
}

type BazaarHistoryPoint = { t: number; b: number; s: number };
type AuctionHistoryPoint = { t: number; l: number; m: number; c: number };

interface ExampleItem {
	slug: string;
	name: string;
}

const DAY = 86_400;
const TTL_MS = 60_000;

const bazaarPoint = ([t, b, s]: PackedBazaarPoint): BazaarHistoryPoint => ({ t, b, s });
const auctionPoint = ([t, l, m, c]: PackedAuctionPoint): AuctionHistoryPoint => ({ t, l, m, c });

function mergePoints<T extends { t: number }>(...groups: T[][]): T[] {
	const byTime = new Map<number, T>();
	for (const points of groups) for (const point of points) byTime.set(point.t, point);
	return [...byTime.values()].sort((a, b) => a.t - b.t);
}

type Db = D1Client;

export function requireDb(platform: App.Platform | undefined): Db {
	if (!platform?.env.DB) error(500, 'database unavailable');
	return platform.env.DB.withSession('first-unconstrained');
}

const cache = new AsyncCache(TTL_MS, 256);

export function clearDbCache(): void {
	cache.clear();
}

const cached = <T>(key: string, compute: () => Promise<T>): Promise<T> => cache.get(key, compute);

const itemJsonPath = (id: string): string => `$.${JSON.stringify(id)}`;

async function itemSnapshot<T>(db: Db, market: MarketKind, id: string) {
	return cached(
		`snapshot:${market}:${id}`,
		async (): Promise<{ lastUpdated: number; snapshot: T } | null> => {
			// Check the entire generation, but return JSON for only the requested item.
			// Incomplete/mixed generations must retain the bulk reader's legacy fallback.
			const { results } = await db
				.prepare(
					`SELECT updated, CASE WHEN shard = ? THEN json_extract(body, ?) END AS body
			 FROM market_snapshot_shards WHERE market = ? ORDER BY shard`
				)
				.bind(shardFor(id, SNAPSHOT_SHARDS[market]), itemJsonPath(id), market)
				.all<{ updated: number; body: string | null }>();
			if (
				results.length === SNAPSHOT_SHARDS[market] &&
				results.every((row) => row.updated === results[0].updated)
			) {
				const body = results.find((row) => row.body !== null)?.body;
				return body ? { lastUpdated: results[0].updated, snapshot: JSON.parse(body) as T } : null;
			}
			const table = market === 'bazaar' ? 'bazaar_snapshot' : 'auction_snapshot';
			const [row, lastUpdated] = await Promise.all([
				db.prepare(`SELECT body FROM ${table} WHERE item = ?`).bind(id).first<{ body: string }>(),
				metaMs(db, market === 'bazaar' ? 'bazaar_updated' : 'auctions_updated')
			]);
			return row ? { lastUpdated, snapshot: JSON.parse(row.body) as T } : null;
		}
	);
}

export const getBazaarProduct = (db: Db, id: string) =>
	itemSnapshot<BazaarProductSnapshot>(db, 'bazaar', id);
export const getAuctionItem = (db: Db, id: string) =>
	itemSnapshot<AuctionItemStats>(db, 'auctions', id);

async function packedSnapshot<T>(
	db: Db,
	market: MarketKind
): Promise<{ lastUpdated: number; values: Record<string, T> } | null> {
	const { results } = await db
		.prepare('SELECT updated, body FROM market_snapshot_shards WHERE market = ? ORDER BY shard')
		.bind(market)
		.all<{ updated: number; body: string }>();
	if (results.length !== SNAPSHOT_SHARDS[market]) return null;
	const lastUpdated = results[0].updated;
	if (results.some((row) => row.updated !== lastUpdated)) return null;
	const values: Record<string, T> = {};
	for (const row of results) Object.assign(values, parseJsonRecord<T>(row.body));
	return { lastUpdated, values };
}

async function snapshotIds(db: Db, market: MarketKind): Promise<Set<string>> {
	const packed = await packedSnapshot<unknown>(db, market);
	if (packed) return new Set(Object.keys(packed.values));
	const table = market === 'bazaar' ? 'bazaar_snapshot' : 'auction_snapshot';
	const { results } = await db.prepare(`SELECT item FROM ${table}`).all<{ item: string }>();
	return new Set(results.map((row) => row.item));
}

async function packedSeries<M extends MarketKind>(
	db: Db,
	market: M,
	ids: string[],
	since = 0
): Promise<Map<string, PackedPointByMarket[M][]>> {
	const out = new Map<string, PackedPointByMarket[M][]>();
	if (ids.length === 0) return out;
	const wanted = new Set(ids);
	const fromDay = utcDay(since);

	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90);
		const placeholders = chunk.map(() => '?').join(',');
		const { results } = await db
			.prepare(
				`SELECT item, body FROM market_item_days
				 WHERE market = ? AND item IN (${placeholders}) AND day >= ?
				 ORDER BY item, day`
			)
			.bind(market, ...chunk, fromDay)
			.all<{ item: string; body: string }>();
		for (const row of results) {
			const points = out.get(row.item) ?? [];
			points.push(...parseJsonArray<PackedPointByMarket[M]>(row.body).filter(([t]) => t >= since));
			out.set(row.item, points);
		}
	}

	const shards = [...new Set(ids.map((id) => shardFor(id, DAY_SHARDS[market])))];
	const placeholders = shards.map(() => '?').join(',');
	const single = ids.length === 1;
	const { results: active } = await db
		.prepare(
			`SELECT ${single ? 'json_extract(body, ?) AS body' : 'body'} FROM market_day_shards
			 WHERE market = ? AND day >= ? AND shard IN (${placeholders})
			 ORDER BY day, shard`
		)
		.bind(...(single ? [itemJsonPath(ids[0])] : []), market, fromDay, ...shards)
		.all<{ body: string | null }>();
	for (const row of active) {
		if (single) {
			if (row.body === null) continue;
			const points = out.get(ids[0]) ?? [];
			points.push(...parseJsonArray<PackedPointByMarket[M]>(row.body).filter(([t]) => t >= since));
			out.set(ids[0], points);
			continue;
		}
		const body = parseJsonRecord<PackedPointByMarket[M][]>(row.body);
		for (const [item, stored] of Object.entries(body)) {
			if (!wanted.has(item)) continue;
			const points = out.get(item) ?? [];
			points.push(...stored.filter(([t]) => t >= since));
			out.set(item, points);
		}
	}

	for (const [item, points] of out) {
		const deduped = new Map(points.map((point) => [point[0], point]));
		out.set(
			item,
			[...deduped.values()].sort(([a], [b]) => a - b)
		);
	}
	return out;
}

async function packedBazaarWindowChanges(
	db: Db,
	since: number
): Promise<Map<string, { first: number; last: number }>> {
	const fromDay = utcDay(since);
	const { results: finalized } = await db
		.prepare(
			`SELECT item, day, first_t, last_t, first_value, last_value,
			 CASE WHEN day = ? THEN body ELSE NULL END AS body
			 FROM market_item_days
			 WHERE market = 'bazaar' AND day >= ?
			 ORDER BY day, item`
		)
		.bind(fromDay, fromDay)
		.all<{
			item: string;
			day: number;
			first_t: number;
			last_t: number;
			first_value: number;
			last_value: number;
			body: string | null;
		}>();
	const values = new Map<string, { firstT: number; first: number; lastT: number; last: number }>();
	const add = (item: string, firstT: number, first: number, lastT: number, last: number) => {
		const current = values.get(item);
		values.set(item, {
			firstT: current && current.firstT < firstT ? current.firstT : firstT,
			first: current && current.firstT < firstT ? current.first : first,
			lastT: current && current.lastT > lastT ? current.lastT : lastT,
			last: current && current.lastT > lastT ? current.last : last
		});
	};
	for (const row of finalized) {
		if (row.body === null) {
			add(row.item, row.first_t, row.first_value, row.last_t, row.last_value);
			continue;
		}
		const points = parseJsonArray<PackedBazaarPoint>(row.body).filter(([t]) => t >= since);
		if (points.length > 0) {
			add(row.item, points[0][0], points[0][1], points.at(-1)![0], points.at(-1)![1]);
		}
	}
	const { results: active } = await db
		.prepare("SELECT body FROM market_day_shards WHERE market = 'bazaar' AND day >= ?")
		.bind(fromDay)
		.all<{ body: string }>();
	for (const row of active) {
		for (const [item, stored] of Object.entries(parseJsonRecord<PackedBazaarPoint[]>(row.body))) {
			const points = stored.filter(([t]) => t >= since);
			if (points.length > 0) {
				add(item, points[0][0], points[0][1], points.at(-1)![0], points.at(-1)![1]);
			}
		}
	}
	return new Map(
		[...values].map(([item, value]) => [item, { first: value.first, last: value.last }])
	);
}

interface ItemsIndex {
	byId: Record<string, ItemMeta>;
	slugToId: Map<string, string>;
	idToSlug: Map<string, string>;
}

async function itemsIndex(db: Db): Promise<ItemsIndex> {
	return cached('items', async () => {
		const results = await useDrizzle(db).select().from(itemsTable);
		const byId: Record<string, ItemMeta> = {};
		const slugToId = new Map<string, string>();
		const idToSlug = new Map<string, string>();
		for (const r of results) {
			byId[r.id] = {
				name: r.name,
				...(r.tier != null && { tier: r.tier }),
				...(r.category != null && { category: r.category }),
				...(r.npc != null && { npc: r.npc })
			};
			slugToId.set(r.slug, r.id);
			idToSlug.set(r.id, r.slug);
		}
		return { byId, slugToId, idToSlug };
	});
}

export const getItems = async (db: Db): Promise<Record<string, ItemMeta>> =>
	(await itemsIndex(db)).byId;

export function getItemBySlug(
	db: Db,
	slug: string
): Promise<(ItemMeta & { id: string }) | undefined> {
	return cached(`item:${slug}`, async () => {
		const row = await useDrizzle(db)
			.select()
			.from(itemsTable)
			.where(eq(itemsTable.slug, slug))
			.get();
		if (!row) return undefined;
		return {
			id: row.id,
			name: row.name,
			...(row.tier != null && { tier: row.tier }),
			...(row.category != null && { category: row.category }),
			...(row.npc != null && { npc: row.npc })
		};
	});
}

export const getItemIdBySlug = async (db: Db, slug: string): Promise<string | undefined> =>
	(await getItemBySlug(db, slug))?.id;

async function metaMs(db: Db, key: string): Promise<number> {
	const row = await useDrizzle(db)
		.select({ value: metadata.value })
		.from(metadata)
		.where(eq(metadata.key, key))
		.get();
	return row ? Number(row.value) : 0;
}

export async function getBazaarSnapshot(db: Db): Promise<BazaarFile> {
	return cached('bazaar', async () => {
		const packed = await packedSnapshot<BazaarProductSnapshot>(db, 'bazaar');
		if (packed) return { lastUpdated: packed.lastUpdated, products: packed.values };
		const [rows, lastUpdated] = await Promise.all([
			useDrizzle(db)
				.select({ item: bazaarSnapshots.item, body: bazaarSnapshots.body })
				.from(bazaarSnapshots),
			metaMs(db, 'bazaar_updated')
		]);
		const products: Record<string, BazaarProductSnapshot> = {};
		for (const row of rows) products[row.item] = row.body;
		return { lastUpdated, products };
	});
}

export async function getAuctionSnapshot(db: Db): Promise<AuctionsFile> {
	return cached('auctions', async () => {
		const packed = await packedSnapshot<AuctionItemStats>(db, 'auctions');
		if (packed) return { lastUpdated: packed.lastUpdated, items: packed.values };
		const [rows, lastUpdated] = await Promise.all([
			useDrizzle(db)
				.select({ item: auctionSnapshots.item, body: auctionSnapshots.body })
				.from(auctionSnapshots),
			metaMs(db, 'auctions_updated')
		]);
		const items: Record<string, AuctionItemStats> = {};
		for (const row of rows) items[row.item] = row.body;
		return { lastUpdated, items };
	});
}

export async function resolveBazaarId(db: Db, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getBazaarProduct(db, id)) ? id : undefined;
}

export async function resolveAuctionId(db: Db, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getAuctionItem(db, id)) ? id : undefined;
}

export async function bazaarHistory(db: Db, id: string): Promise<BazaarHistoryPoint[]> {
	const now = Math.floor(Date.now() / 1000);
	const [legacy, packed] = await Promise.all([
		db
			.prepare(
				`SELECT t, buy AS b, sell AS s FROM bazaar_points
			 WHERE item = ?1 AND (
			   tier = 2
			   OR (tier = 1 AND t >= (SELECT MAX(t) FROM bazaar_points WHERE item = ?1 AND tier = 1) - ?2)
			   OR (tier = 0 AND t >= ?3))
			 ORDER BY t`
			)
			.bind(id, 7 * DAY, now - DAY)
			.all<BazaarHistoryPoint>(),
		packedSeries(db, 'bazaar', [id], now - DAY)
	]);
	return mergePoints(legacy.results, (packed.get(id) ?? []).map(bazaarPoint));
}

export async function bazaarSummaryHistory(db: Db, id: string): Promise<BazaarHistoryPoint[]> {
	const [legacy, packed] = await Promise.all([
		db
			.prepare('SELECT t, buy AS b, sell AS s FROM bazaar_points WHERE item = ?')
			.bind(id)
			.all<BazaarHistoryPoint>(),
		packedSeries(db, 'bazaar', [id])
	]);
	return mergePoints(legacy.results, (packed.get(id) ?? []).map(bazaarPoint));
}

export async function auctionHistory(db: Db, id: string): Promise<AuctionHistoryPoint[]> {
	const now = Math.floor(Date.now() / 1000);
	const [legacy, packed] = await Promise.all([
		db
			.prepare(
				`SELECT t, lowest AS l, median AS m, count AS c FROM auction_points
			 WHERE item = ?1 AND (tier = 2 OR (tier = 0 AND t >= ?2))
			 ORDER BY t`
			)
			.bind(id, now - 7 * DAY)
			.all<AuctionHistoryPoint>(),
		packedSeries(db, 'auctions', [id], now - 7 * DAY)
	]);
	return mergePoints(legacy.results, (packed.get(id) ?? []).map(auctionPoint));
}

export async function auctionSummaryHistory(db: Db, id: string): Promise<AuctionHistoryPoint[]> {
	const [legacy, packed] = await Promise.all([
		db
			.prepare('SELECT t, lowest AS l, median AS m, count AS c FROM auction_points WHERE item = ?')
			.bind(id)
			.all<AuctionHistoryPoint>(),
		packedSeries(db, 'auctions', [id])
	]);
	return mergePoints(legacy.results, (packed.get(id) ?? []).map(auctionPoint));
}

export function bazaarWindowChanges(
	db: Db,
	since: number
): Promise<{ id: string; first: number; last: number }[]> {
	return cached(`windowChanges:${since - (since % 60)}`, async () => {
		const { results } = await db
			.prepare(
				`SELECT s.item AS id,
				(SELECT buy FROM bazaar_points p WHERE p.item = s.item AND p.tier = 0 AND p.t >= ?1 ORDER BY p.t LIMIT 1) AS first,
				(SELECT buy FROM bazaar_points p WHERE p.item = s.item AND p.tier = 0 ORDER BY p.t DESC LIMIT 1) AS last
			 FROM bazaar_snapshot s`
			)
			.bind(since)
			.all<{ id: string; first: number | null; last: number | null }>();
		const packed = await packedBazaarWindowChanges(db, since);
		const changes = new Map<string, { id: string; first: number; last: number }>();
		for (const row of results) {
			if (row.first != null && row.last != null) {
				changes.set(row.id, { id: row.id, first: row.first, last: row.last });
			}
		}
		for (const [id, packedChange] of packed) {
			const current = changes.get(id);
			changes.set(id, {
				id,
				first: current?.first ?? packedChange.first,
				last: packedChange.last
			});
		}
		return [...changes.values()];
	});
}

export const bazaarSeriesSinceSql = (placeholders: string): string =>
	`SELECT item, t, buy AS b, sell AS s FROM bazaar_points
	 WHERE item IN (${placeholders}) AND tier = 0 AND t >= ? ORDER BY item, t`;

export function bazaarSeriesSince(
	db: Db,
	ids: string[],
	since: number
): Promise<Map<string, BazaarHistoryPoint[]>> {
	return cached(`series:${since - (since % 60)}:${ids.join(',')}`, async () => {
		const out = new Map<string, BazaarHistoryPoint[]>();
		for (let i = 0; i < ids.length; i += 90) {
			const chunk = ids.slice(i, i + 90);
			const placeholders = chunk.map(() => '?').join(',');
			const { results } = await db
				.prepare(bazaarSeriesSinceSql(placeholders))
				.bind(...chunk, since)
				.all<BazaarHistoryPoint & { item: string }>();
			for (const { item, ...point } of results) {
				const list = out.get(item) ?? [];
				list.push(point);
				out.set(item, list);
			}
		}
		const packed = await packedSeries(db, 'bazaar', ids, since);
		for (const [item, points] of packed) {
			out.set(item, mergePoints(out.get(item) ?? [], points.map(bazaarPoint)));
		}
		return out;
	});
}

async function auctionSeriesSince(
	db: Db,
	ids: string[],
	since: number
): Promise<Map<string, AuctionHistoryPoint[]>> {
	const out = new Map<string, AuctionHistoryPoint[]>();
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90);
		const placeholders = chunk.map(() => '?').join(',');
		const { results } = await db
			.prepare(
				`SELECT item, t, lowest AS l, median AS m, count AS c FROM auction_points
				 WHERE item IN (${placeholders}) AND tier = 0 AND t >= ? ORDER BY item, t`
			)
			.bind(...chunk, since)
			.all<AuctionHistoryPoint & { item: string }>();
		for (const { item, ...point } of results) {
			const points = out.get(item) ?? [];
			points.push(point);
			out.set(item, points);
		}
	}
	const packed = await packedSeries(db, 'auctions', ids, since);
	for (const [item, points] of packed) {
		out.set(item, mergePoints(out.get(item) ?? [], points.map(auctionPoint)));
	}
	return out;
}

export async function itemSeriesJson(db: Db, id: string): Promise<ItemSeriesJson> {
	const now = Math.floor(Date.now() / 1000);
	const [legacy, packedBazaar, packedAuctions] = await Promise.all([
		db.batch([
			db
				.prepare('SELECT t, buy, sell FROM bazaar_points WHERE item = ?1 AND tier = 0 ORDER BY t')
				.bind(id),
			db
				.prepare(
					'SELECT t, buy, sell FROM bazaar_points WHERE item = ?1 AND tier = 1 AND t % 14400 = 0 ORDER BY t'
				)
				.bind(id),
			db
				.prepare('SELECT t, buy, sell FROM bazaar_points WHERE item = ?1 AND tier = 2 ORDER BY t')
				.bind(id),
			db
				.prepare(
					'SELECT t, lowest, median, count FROM auction_points WHERE item = ?1 AND tier = 0 ORDER BY t'
				)
				.bind(id),
			db
				.prepare(
					'SELECT t, lowest, median, count FROM auction_points WHERE item = ?1 AND tier = 2 ORDER BY t'
				)
				.bind(id)
		]),
		packedSeries(db, 'bazaar', [id]),
		packedSeries(db, 'auctions', [id])
	]);
	const [bRaw, bHourly, bDaily, aRaw, aDaily] = legacy;
	const b = (rows: unknown): BazaarTuple[] =>
		(rows as { t: number; buy: number; sell: number }[]).map((r) => [r.t, r.buy, r.sell]);
	const a = (rows: unknown): AuctionTuple[] =>
		(rows as { t: number; lowest: number; median: number; count: number }[]).map((r) => [
			r.t,
			r.lowest,
			r.median,
			r.count
		]);

	const exactBazaar = mergePoints(
		(bRaw.results as { t: number; buy: number; sell: number }[]).map((row): BazaarPoint => ({
			t: row.t,
			b: row.buy,
			s: row.sell
		})),
		(packedBazaar.get(id) ?? []).map(([t, b, s]): BazaarPoint => ({ t, b, s }))
	);
	const rawCutoff = now - RAW_SLICE;
	const dailyCutoff = now - HOURLY_WINDOW;
	const generatedHourly = bucketMedian(
		exactBazaar.filter((point) => point.t < rawCutoff && point.t >= dailyCutoff),
		HOUR,
		bazaarMedian
	).filter((point) => point.t % (4 * HOUR) === 0);
	const generatedDaily = bucketMedian(
		exactBazaar.filter((point) => point.t < dailyCutoff),
		DAY,
		bazaarMedian
	);

	const exactAuctions = mergePoints(
		(aRaw.results as { t: number; lowest: number; median: number; count: number }[]).map(
			(row): AuctionPoint => ({
				t: row.t,
				l: row.lowest,
				m: row.median,
				c: row.count
			})
		),
		(packedAuctions.get(id) ?? []).map(([t, l, m, c]): AuctionPoint => ({ t, l, m, c }))
	);
	const generatedAuctionDaily = bucketMedian(
		exactAuctions.filter((point) => point.t < rawCutoff),
		DAY,
		auctionMedian
	);

	const out: ItemSeriesJson = {};
	const bazaar = {
		raw: exactBazaar
			.filter((point) => point.t >= rawCutoff)
			.map((point): BazaarTuple => [point.t, point.b, point.s]),
		hourly: mergePoints(
			b(bHourly.results).map(([t, buy, sell]) => ({ t, buy, sell })),
			generatedHourly.map((point) => ({ t: point.t, buy: point.b, sell: point.s }))
		).map((point): BazaarTuple => [point.t, point.buy, point.sell]),
		daily: mergePoints(
			b(bDaily.results).map(([t, buy, sell]) => ({ t, buy, sell })),
			generatedDaily.map((point) => ({ t: point.t, buy: point.b, sell: point.s }))
		).map((point): BazaarTuple => [point.t, point.buy, point.sell])
	};
	if (bazaar.raw.length || bazaar.hourly.length || bazaar.daily.length) out.bazaar = bazaar;
	const auctions = {
		raw: exactAuctions
			.filter((point) => point.t >= rawCutoff)
			.map((point): AuctionTuple => [point.t, point.l, point.m, point.c]),
		daily: mergePoints(
			a(aDaily.results).map(([t, lowest, median, count]) => ({ t, lowest, median, count })),
			generatedAuctionDaily.map((point) => ({
				t: point.t,
				lowest: point.l,
				median: point.m,
				count: point.c
			}))
		).map((point): AuctionTuple => [point.t, point.lowest, point.median, point.count])
	};
	if (auctions.raw.length || auctions.daily.length) out.auctions = auctions;
	return out;
}

const WEEK = 7 * DAY;
const SPARK_SAMPLES = 12;

async function sparkSamples(
	db: Db,
	market: MarketKind,
	ids: string[],
	now: number
): Promise<Map<string, number[]>> {
	if (ids.length === 0) return new Map();
	const since = now - WEEK;
	const step = WEEK / SPARK_SAMPLES;
	const times = Array.from({ length: SPARK_SAMPLES }, (_, k) => Math.floor(since + (k + 1) * step));
	const [listed, series] = await Promise.all([
		snapshotIds(db, market),
		market === 'bazaar' ? bazaarSeriesSince(db, ids, since) : auctionSeriesSince(db, ids, since)
	]);
	const out = new Map<string, number[]>();
	for (const id of ids) {
		if (!listed.has(id)) continue;
		const points = series.get(id) ?? [];
		let cursor = 0;
		let latest: BazaarHistoryPoint | AuctionHistoryPoint | undefined;
		const values: number[] = [];
		for (const target of times) {
			while (cursor < points.length && points[cursor].t <= target) latest = points[cursor++];
			if (!latest) continue;
			const value =
				market === 'bazaar' ? (latest as BazaarHistoryPoint).b : (latest as AuctionHistoryPoint).m;
			values.push(Number(value.toPrecision(4)));
		}
		out.set(id, values.length < 2 ? [] : values);
	}
	return out;
}

export const bazaarSparks = (db: Db, ids: string[], now: number) =>
	cached(`bazaarSparks:${ids.join(',')}`, () => sparkSamples(db, 'bazaar', ids, now));
export const auctionSparks = (db: Db, ids: string[], now: number) =>
	cached(`auctionSparks:${ids.join(',')}`, () => sparkSamples(db, 'auctions', ids, now));

export async function popularAuctionItems(db: Db, limit: number): Promise<ExampleItem[]> {
	const [{ items }, index] = await Promise.all([getAuctionSnapshot(db), itemsIndex(db)]);
	return Object.entries(items)
		.sort(([, a], [, b]) => b.count - a.count)
		.slice(0, limit)
		.map(([id, stats]) => ({ slug: index.idToSlug.get(id) ?? id.toLowerCase(), name: stats.name }));
}

export async function popularBazaarItems(db: Db, limit: number): Promise<ExampleItem[]> {
	const [{ products }, index] = await Promise.all([getBazaarSnapshot(db), itemsIndex(db)]);
	return Object.entries(products)
		.sort(([, a], [, b]) => b.qs.bmw + b.qs.smw - (a.qs.bmw + a.qs.smw))
		.slice(0, limit)
		.map(([id]) => ({
			slug: index.idToSlug.get(id) ?? id.toLowerCase(),
			name: index.byId[id]?.name ?? titleCase(id)
		}));
}
