import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { BazaarProductSnapshot, AuctionItemStats } from '../market/aggregate';
import {
	RAW_SLICE,
	type ItemSeriesJson,
	type BazaarTuple,
	type AuctionTuple
} from '../market/series';
import { titleCase } from '../format';

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

type Db = Pick<D1Database, 'prepare' | 'batch'>;

export function requireDb(platform: App.Platform | undefined): Db {
	if (!platform?.env.DB) error(500, 'database unavailable');
	return platform.env.DB.withSession('first-unconstrained');
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
	const value = await compute();
	const at = Date.now();
	for (const [k, entry] of cache) if (at - entry.at >= TTL_MS) cache.delete(k);
	cache.set(key, { at, value });
	return value;
}

interface ItemsIndex {
	byId: Record<string, ItemMeta>;
	slugToId: Map<string, string>;
	idToSlug: Map<string, string>;
}

async function itemsIndex(db: Db): Promise<ItemsIndex> {
	return cached('items', async () => {
		const { results } = await db
			.prepare('SELECT id, slug, name, tier, category, npc FROM items')
			.all<{
				id: string;
				slug: string;
				name: string;
				tier: string | null;
				category: string | null;
				npc: number | null;
			}>();
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

export const getItemIdBySlug = async (db: Db, slug: string): Promise<string | undefined> =>
	(await itemsIndex(db)).slugToId.get(slug);

async function metaMs(db: Db, key: string): Promise<number> {
	const row = await db
		.prepare('SELECT value FROM meta WHERE key = ?')
		.bind(key)
		.first<{ value: string }>();
	return row ? Number(row.value) : 0;
}

export async function getBazaarSnapshot(db: Db): Promise<BazaarFile> {
	return cached('bazaar', async () => {
		const [{ results }, lastUpdated] = await Promise.all([
			db.prepare('SELECT item, body FROM bazaar_snapshot').all<{ item: string; body: string }>(),
			metaMs(db, 'bazaar_updated')
		]);
		const products: Record<string, BazaarProductSnapshot> = {};
		for (const r of results) products[r.item] = JSON.parse(r.body);
		return { lastUpdated, products };
	});
}

export async function getAuctionSnapshot(db: Db): Promise<AuctionsFile> {
	return cached('auctions', async () => {
		const [{ results }, lastUpdated] = await Promise.all([
			db.prepare('SELECT item, body FROM auction_snapshot').all<{ item: string; body: string }>(),
			metaMs(db, 'auctions_updated')
		]);
		const items: Record<string, AuctionItemStats> = {};
		for (const r of results) items[r.item] = JSON.parse(r.body);
		return { lastUpdated, items };
	});
}

export async function resolveBazaarId(db: Db, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getBazaarSnapshot(db)).products[id] ? id : undefined;
}

export async function resolveAuctionId(db: Db, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getAuctionSnapshot(db)).items[id] ? id : undefined;
}

export async function bazaarHistory(db: Db, id: string): Promise<BazaarHistoryPoint[]> {
	const now = Math.floor(Date.now() / 1000);
	const { results } = await db
		.prepare(
			`SELECT t, buy AS b, sell AS s FROM bazaar_points
			 WHERE item = ?1 AND (
			   tier = 2
			   OR (tier = 1 AND t >= (SELECT MAX(t) FROM bazaar_points WHERE item = ?1 AND tier = 1) - ?2)
			   OR (tier = 0 AND t >= ?3))
			 ORDER BY t`
		)
		.bind(id, 7 * DAY, now - DAY)
		.all<BazaarHistoryPoint>();
	return results;
}

export async function bazaarSummaryHistory(db: Db, id: string): Promise<BazaarHistoryPoint[]> {
	const { results } = await db
		.prepare('SELECT t, buy AS b, sell AS s FROM bazaar_points WHERE item = ?')
		.bind(id)
		.all<BazaarHistoryPoint>();
	return results;
}

export async function auctionHistory(db: Db, id: string): Promise<AuctionHistoryPoint[]> {
	const now = Math.floor(Date.now() / 1000);
	const { results } = await db
		.prepare(
			`SELECT t, lowest AS l, median AS m, count AS c FROM auction_points
			 WHERE item = ?1 AND (tier = 2 OR (tier = 0 AND t >= ?2))
			 ORDER BY t`
		)
		.bind(id, now - 7 * DAY)
		.all<AuctionHistoryPoint>();
	return results;
}

export async function auctionSummaryHistory(db: Db, id: string): Promise<AuctionHistoryPoint[]> {
	const { results } = await db
		.prepare('SELECT t, lowest AS l, median AS m, count AS c FROM auction_points WHERE item = ?')
		.bind(id)
		.all<AuctionHistoryPoint>();
	return results;
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
		return results.filter(
			(r): r is { id: string; first: number; last: number } => r.first != null && r.last != null
		);
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
		return out;
	});
}

export async function itemSeriesJson(db: Db, id: string): Promise<ItemSeriesJson> {
	const now = Math.floor(Date.now() / 1000);
	const [bRaw, bHourly, bDaily, aRaw, aDaily] = await db.batch([
		db
			.prepare(
				'SELECT t, buy, sell FROM bazaar_points WHERE item = ?1 AND tier = 0 AND t >= ?2 ORDER BY t'
			)
			.bind(id, now - RAW_SLICE),
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
				'SELECT t, lowest, median, count FROM auction_points WHERE item = ?1 AND tier = 0 AND t >= ?2 ORDER BY t'
			)
			.bind(id, now - RAW_SLICE),
		db
			.prepare(
				'SELECT t, lowest, median, count FROM auction_points WHERE item = ?1 AND tier = 2 ORDER BY t'
			)
			.bind(id)
	]);
	const b = (rows: unknown): BazaarTuple[] =>
		(rows as { t: number; buy: number; sell: number }[]).map((r) => [r.t, r.buy, r.sell]);
	const a = (rows: unknown): AuctionTuple[] =>
		(rows as { t: number; lowest: number; median: number; count: number }[]).map((r) => [
			r.t,
			r.lowest,
			r.median,
			r.count
		]);

	const out: ItemSeriesJson = {};
	const bazaar = { raw: b(bRaw.results), hourly: b(bHourly.results), daily: b(bDaily.results) };
	if (bazaar.raw.length || bazaar.hourly.length || bazaar.daily.length) out.bazaar = bazaar;
	const auctions = { raw: a(aRaw.results), daily: a(aDaily.results) };
	if (auctions.raw.length || auctions.daily.length) out.auctions = auctions;
	return out;
}

const WEEK = 7 * DAY;
const SPARK_SAMPLES = 12;
const SPARK_ITEM_CHUNK = 80;

async function sparkSamples(
	db: Db,
	snapshotTable: 'bazaar_snapshot' | 'auction_snapshot',
	pointsTable: 'bazaar_points' | 'auction_points',
	column: 'buy' | 'median',
	ids: string[],
	now: number
): Promise<Map<string, number[]>> {
	if (ids.length === 0) return new Map();
	const since = now - WEEK;
	const step = WEEK / SPARK_SAMPLES;
	const times = Array.from({ length: SPARK_SAMPLES }, (_, k) => Math.floor(since + (k + 1) * step));
	const cols = times
		.map(
			(_, k) =>
				`(SELECT ${column} FROM ${pointsTable} p WHERE p.item = s.item AND p.tier = 0 AND p.t >= ?1 AND p.t <= ?${k + 2} ORDER BY p.t DESC LIMIT 1) AS v${k}`
		)
		.join(', ');
	const out = new Map<string, number[]>();
	for (let i = 0; i < ids.length; i += SPARK_ITEM_CHUNK) {
		const chunk = ids.slice(i, i + SPARK_ITEM_CHUNK);
		const itemPlaceholders = chunk.map((_, k) => `?${times.length + k + 2}`).join(', ');
		const { results } = await db
			.prepare(
				`SELECT s.item AS id, ${cols} FROM ${snapshotTable} s WHERE s.item IN (${itemPlaceholders})`
			)
			.bind(since, ...times, ...chunk)
			.all<{ id: string } & Record<string, number | null>>();
		for (const row of results) {
			const values = times
				.map((_, k) => row[`v${k}`])
				.filter((v): v is number => v != null)
				.map((v) => Number(v.toPrecision(4)));
			out.set(row.id, values.length < 2 ? [] : values);
		}
	}
	return out;
}

export const bazaarSparks = (db: Db, ids: string[], now: number) =>
	cached(`bazaarSparks:${ids.join(',')}`, () =>
		sparkSamples(db, 'bazaar_snapshot', 'bazaar_points', 'buy', ids, now)
	);
export const auctionSparks = (db: Db, ids: string[], now: number) =>
	cached(`auctionSparks:${ids.join(',')}`, () =>
		sparkSamples(db, 'auction_snapshot', 'auction_points', 'median', ids, now)
	);

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
