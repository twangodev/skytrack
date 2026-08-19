// D1-backed data layer - replaces the file-reading src/lib/server/data.ts.
// Per-isolate TTL cache: snapshots/items are shared across every request an
// isolate serves; 60s staleness is invisible next to the 5-min data cadence.
import { error } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
// Relative imports, not the $lib alias: workers/pipeline/test/site-db.test.ts
// imports this module directly and runs under a plain vitest/config +
// @cloudflare/vitest-pool-workers setup with no SvelteKit vite plugin, so
// $lib isn't resolvable there (same reason workers/pipeline/src/db.ts uses
// relative imports). Relative paths resolve identically in both contexts.
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

export interface BazaarFile {
	lastUpdated: number;
	products: Record<string, BazaarProductSnapshot>;
}

export interface AuctionsFile {
	lastUpdated: number;
	items: Record<string, AuctionItemStats>;
}

export type BazaarHistoryPoint = { t: number; b: number; s: number };
export type AuctionHistoryPoint = { t: number; l: number; m: number; c: number };

export interface ExampleItem {
	slug: string;
	name: string;
}

const DAY = 86_400;
const TTL_MS = 60_000;

export function requireDb(platform: App.Platform | undefined): D1Database {
	if (!platform?.env.DB) error(500, 'database unavailable');
	return platform.env.DB;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
	const value = await compute();
	// Sweep expired entries on every miss. The snapshot/items keys are fixed,
	// but bazaarWindowChanges/bazaarSeriesSince mint a new minute-bucketed key
	// every 60s, so without this the Map would grow for the life of the
	// isolate. A miss is already the slow path, and the Map holds at most a
	// TTL's worth of keys.
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

async function itemsIndex(db: D1Database): Promise<ItemsIndex> {
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

export const getItems = async (db: D1Database): Promise<Record<string, ItemMeta>> =>
	(await itemsIndex(db)).byId;

export const getItemIdBySlug = async (db: D1Database, slug: string): Promise<string | undefined> =>
	(await itemsIndex(db)).slugToId.get(slug);

async function metaMs(db: D1Database, key: string): Promise<number> {
	const row = await db
		.prepare('SELECT value FROM meta WHERE key = ?')
		.bind(key)
		.first<{ value: string }>();
	return row ? Number(row.value) : 0;
}

export async function getBazaarSnapshot(db: D1Database): Promise<BazaarFile> {
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

export async function getAuctionSnapshot(db: D1Database): Promise<AuctionsFile> {
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

// Kind-scoped resolution: today's slug maps were built from the current
// snapshot's keys, so a slug only resolves on /bazaar/* while the product is
// actually listed (and likewise for auctions). Preserve that.
export async function resolveBazaarId(db: D1Database, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getBazaarSnapshot(db)).products[id] ? id : undefined;
}

export async function resolveAuctionId(db: D1Database, slug: string): Promise<string | undefined> {
	const id = await getItemIdBySlug(db, slug);
	if (!id) return undefined;
	return (await getAuctionSnapshot(db)).items[id] ? id : undefined;
}

// Three windows, one per tier, matching the legacy file layout:
//   tier 2 (daily)  - every point, unbounded.
//   tier 1 (hourly) - the trailing 7 days OF THAT TIER, i.e. measured from the
//                     hourly tier's own newest point, not from `now`. Rollup
//                     only spills points that have aged past the 90d raw
//                     window, so the newest hourly row is ~90d old and an
//                     absolute `t >= now - 7d` cutoff could never match one.
//   tier 0 (raw)    - the trailing 24 hours, absolute.
export async function bazaarHistory(db: D1Database, id: string): Promise<BazaarHistoryPoint[]> {
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

export async function bazaarSummaryHistory(
	db: D1Database,
	id: string
): Promise<BazaarHistoryPoint[]> {
	const { results } = await db
		.prepare('SELECT t, buy AS b, sell AS s FROM bazaar_points WHERE item = ?')
		.bind(id)
		.all<BazaarHistoryPoint>();
	return results;
}

export async function auctionHistory(db: D1Database, id: string): Promise<AuctionHistoryPoint[]> {
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

export async function auctionSummaryHistory(
	db: D1Database,
	id: string
): Promise<AuctionHistoryPoint[]> {
	const { results } = await db
		.prepare('SELECT t, lowest AS l, median AS m, count AS c FROM auction_points WHERE item = ?')
		.bind(id)
		.all<AuctionHistoryPoint>();
	return results;
}

// First and latest raw price per currently-listed product; both subqueries
// seek on the (item, tier, t) PK, so this reads ~2 index rows per product
// instead of the whole window. Cached under a minute-bucketed key so the
// several renders a single page triggers inside the TTL share one query -
// callers derive `since` from Date.now(), which would otherwise miss every
// time.
export function bazaarWindowChanges(
	db: D1Database,
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

// Same minute-bucketed caching as bazaarWindowChanges, keyed additionally by
// the id list in the caller's order (never sorted - that array belongs to the
// caller and its order is meaningful to it). Results are grouped per item, so
// only per-item ascending t matters (every call site treats it that way) -
// hence ORDER BY item, t rather than a global ORDER BY t. That shape also
// keeps the query fast: a global ORDER BY t lets SQLite satisfy it for free
// off the (tier, t) index, which then scans every item's rows in the window
// (millions of rows at production 7d size and a D1 CPU-limit reset);
// ORDER BY item, t instead keeps the planner on the (item, tier, t) primary
// key, doing a bounded seek per item.
export function bazaarSeriesSince(
	db: D1Database,
	ids: string[],
	since: number
): Promise<Map<string, BazaarHistoryPoint[]>> {
	return cached(`series:${since - (since % 60)}:${ids.join(',')}`, async () => {
		const out = new Map<string, BazaarHistoryPoint[]>();
		for (let i = 0; i < ids.length; i += 90) {
			const chunk = ids.slice(i, i + 90); // 90 + 1 binds, under D1's 100-param cap
			const placeholders = chunk.map(() => '?').join(',');
			const { results } = await db
				.prepare(
					`SELECT item, t, buy AS b, sell AS s FROM bazaar_points
				 WHERE item IN (${placeholders}) AND tier = 0 AND t >= ? ORDER BY item, t`
				)
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

export async function itemSeriesJson(db: D1Database, id: string): Promise<ItemSeriesJson> {
	const now = Math.floor(Date.now() / 1000);
	const [bRaw, bHourly, bDaily, aRaw, aDaily] = await db.batch([
		db
			.prepare(
				'SELECT t, buy, sell FROM bazaar_points WHERE item = ?1 AND tier = 0 AND t >= ?2 ORDER BY t'
			)
			.bind(id, now - RAW_SLICE),
		// thinHourly keeps points where (t/3600) % 4 === 0, i.e. t % 14400 === 0
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

// Sampled sparklines for every currently-listed product: instead of reading
// the full 7d raw window per item (bazaarSeriesSince over ~2-4k ids would be
// millions of rows), seek 12 evenly spaced sample times per item with a
// correlated subquery each - the same PK-seek trick bazaarWindowChanges
// uses, just repeated per sample instead of per first/last. ~12 index rows
// per product regardless of how dense the raw tier is.
const WEEK = 7 * DAY;
const SPARK_SAMPLES = 12;

async function sparkSamples(
	db: D1Database,
	snapshotTable: 'bazaar_snapshot' | 'auction_snapshot',
	pointsTable: 'bazaar_points' | 'auction_points',
	column: 'buy' | 'median',
	now: number
): Promise<Map<string, number[]>> {
	const since = now - WEEK;
	const step = WEEK / SPARK_SAMPLES;
	// sample times end exactly at `now`; ?1 is `since`, ?2..?13 are the sample times
	const times = Array.from({ length: SPARK_SAMPLES }, (_, k) => Math.floor(since + (k + 1) * step));
	const cols = times
		.map(
			(_, k) =>
				`(SELECT ${column} FROM ${pointsTable} p WHERE p.item = s.item AND p.tier = 0 AND p.t >= ?1 AND p.t <= ?${k + 2} ORDER BY p.t DESC LIMIT 1) AS v${k}`
		)
		.join(', ');
	const { results } = await db
		.prepare(`SELECT s.item AS id, ${cols} FROM ${snapshotTable} s`)
		.bind(since, ...times)
		.all<{ id: string } & Record<string, number | null>>();
	const out = new Map<string, number[]>();
	for (const row of results) {
		const values = times
			.map((_, k) => row[`v${k}`])
			.filter((v): v is number => v != null)
			.map((v) => Number(v.toPrecision(4)));
		out.set(row.id, values.length < 2 ? [] : values);
	}
	return out;
}

/** Trailing-7d sparkline values for every currently-listed bazaar product: 12 evenly spaced samples ending at `now`, each the latest raw (tier 0) `buy` in [now-7d, t_k]. One PK seek per sample; ~12 index rows per product. Fewer than 2 samples -> []. Values rounded to 4 significant figures (matches the old file-based spark helper). Cached under the 60s TTL (key ignores `now`). */
export const bazaarSparks = (db: D1Database, now: number) =>
	cached('bazaarSparks', () => sparkSamples(db, 'bazaar_snapshot', 'bazaar_points', 'buy', now));
/** Same for currently-listed auction items, sampling `median` from auction_points tier 0. */
export const auctionSparks = (db: D1Database, now: number) =>
	cached('auctionSparks', () =>
		sparkSamples(db, 'auction_snapshot', 'auction_points', 'median', now)
	);

export async function popularAuctionItems(db: D1Database, limit: number): Promise<ExampleItem[]> {
	const [{ items }, index] = await Promise.all([getAuctionSnapshot(db), itemsIndex(db)]);
	return Object.entries(items)
		.sort(([, a], [, b]) => b.count - a.count)
		.slice(0, limit)
		.map(([id, stats]) => ({ slug: index.idToSlug.get(id) ?? id.toLowerCase(), name: stats.name }));
}

export async function popularBazaarItems(db: D1Database, limit: number): Promise<ExampleItem[]> {
	const [{ products }, index] = await Promise.all([getBazaarSnapshot(db), itemsIndex(db)]);
	return Object.entries(products)
		.sort(([, a], [, b]) => b.qs.bmw + b.qs.smw - (a.qs.bmw + a.qs.smw))
		.slice(0, limit)
		.map(([id]) => ({
			slug: index.idToSlug.get(id) ?? id.toLowerCase(),
			name: index.byId[id]?.name ?? titleCase(id)
		}));
}
