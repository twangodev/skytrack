import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { BazaarProductSnapshot, AuctionItemStats } from '../../../src/lib/market/aggregate';
import {
	bucketMedian,
	bazaarMedian,
	auctionMedian,
	RAW_WINDOW,
	HOURLY_WINDOW,
	DAY,
	HOUR,
	type BazaarPoint,
	type AuctionPoint
} from '../../../src/lib/market/bucket';
import { slugFromId } from '../../../src/lib/slug';
import { titleCase } from '../../../src/lib/format';
import {
	DAY_SHARDS,
	SNAPSHOT_SHARDS,
	parseJsonRecord,
	partitionRecord,
	utcDay,
	type MarketKind,
	type PackedAuctionPoint,
	type PackedBazaarPoint,
	type PackedPointByMarket
} from '../../../src/lib/market/packed';

export interface ItemMeta {
	name: string;
	tier?: string;
	category?: string;
	npc?: number;
}

export async function batchChunked(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
	for (let i = 0; i < stmts.length; i += 1000) await db.batch(stmts.slice(i, i + 1000));
}

const metaStmt = (db: D1Database, key: string, value: string) =>
	db
		.prepare(
			'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		)
		.bind(key, value);

const itemStmt = (db: D1Database, id: string, name: string) =>
	db
		.prepare('INSERT INTO items (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
		.bind(id, slugFromId(id), name);

export async function readItemCatalog(db: D1Database): Promise<Record<string, ItemMeta>> {
	const { results } = await db.prepare('SELECT id, name, tier, category, npc FROM items').all<{
		id: string;
		name: string;
		tier: string | null;
		category: string | null;
		npc: number | null;
	}>();
	return Object.fromEntries(
		results.map((row) => [
			row.id,
			{
				name: row.name,
				...(row.tier !== null && { tier: row.tier }),
				...(row.category !== null && { category: row.category }),
				...(row.npc !== null && { npc: row.npc })
			}
		])
	);
}

export async function writeItemCatalog(
	db: D1Database,
	items: Record<string, ItemMeta>
): Promise<void> {
	const existingRows = await db
		.prepare('SELECT id, slug FROM items')
		.all<{ id: string; slug: string }>();
	const slugOwners = new Map(existingRows.results.map((row) => [row.slug, row.id]));
	const official = db.prepare(
		'INSERT INTO items (id, slug, name, tier, category, npc) VALUES (?, ?, ?, ?, ?, ?) ' +
			'ON CONFLICT(id) DO UPDATE SET name = excluded.name, tier = excluded.tier, category = excluded.category, npc = excluded.npc ' +
			'WHERE name IS NOT excluded.name OR tier IS NOT excluded.tier OR category IS NOT excluded.category OR npc IS NOT excluded.npc'
	);
	const statements: D1PreparedStatement[] = [];
	for (const [id, meta] of Object.entries(items)) {
		const slug = slugFromId(id);
		const owner = slugOwners.get(slug);
		if (owner !== undefined && owner !== id) {
			console.error(JSON.stringify({ event: 'catalogue-slug-collision', id, slug, owner }));
			continue;
		}
		slugOwners.set(slug, id);
		statements.push(
			official.bind(id, slug, meta.name, meta.tier ?? null, meta.category ?? null, meta.npc ?? null)
		);
	}
	await batchChunked(db, statements);
}

type PackedDayBody<M extends MarketKind> = Record<string, PackedPointByMarket[M][]>;
const MAX_PACKED_BODY_BYTES = 1_800_000;

function packedJson(value: unknown, label: string): string {
	const json = JSON.stringify(value);
	const bytes = new TextEncoder().encode(json).byteLength;
	if (bytes > MAX_PACKED_BODY_BYTES) {
		throw new Error(`${label} is ${bytes} bytes; increase its shard count before writing to D1`);
	}
	return json;
}

async function writeSnapshotShards<T>(
	db: D1Database,
	market: MarketKind,
	updated: number,
	values: Record<string, T>,
	metadata: [key: string, value: string][]
): Promise<void> {
	const upsert = db.prepare(
		'INSERT INTO market_snapshot_shards (market, shard, updated, body) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT(market, shard) DO UPDATE SET updated = excluded.updated, body = excluded.body'
	);
	const shards = partitionRecord(values, SNAPSHOT_SHARDS[market]);
	await db.batch([
		...shards.map((body, shard) =>
			upsert.bind(market, shard, updated, packedJson(body, `${market} snapshot shard ${shard}`))
		),
		...metadata.map(([key, value]) => metaStmt(db, key, value))
	]);
}

function appendPoint<M extends MarketKind>(
	body: PackedDayBody<M>,
	item: string,
	point: PackedPointByMarket[M]
): boolean {
	const points = body[item] ?? [];
	if (points.some(([t]) => t === point[0])) return false;
	points.push(point);
	if (points.length > 1 && points[points.length - 2][0] > point[0]) {
		points.sort(([a], [b]) => a - b);
	}
	body[item] = points;
	return true;
}

async function retryDayShard<M extends MarketKind>(
	db: D1Database,
	market: M,
	day: number,
	shard: number,
	updated: number,
	points: Record<string, PackedPointByMarket[M]>
): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const row = await db
			.prepare(
				'SELECT body, version FROM market_day_shards WHERE market = ? AND day = ? AND shard = ?'
			)
			.bind(market, day, shard)
			.first<{ body: string; version: number }>();
		const body = row ? parseJsonRecord<PackedPointByMarket[M][]>(row.body) : {};
		let changed = false;
		for (const [item, point] of Object.entries(points)) {
			changed = appendPoint(body, item, point) || changed;
		}
		if (!changed) return;

		const result = row
			? await db
					.prepare(
						'UPDATE market_day_shards SET updated = ?, version = version + 1, body = ? ' +
							'WHERE market = ? AND day = ? AND shard = ? AND version = ?'
					)
					.bind(
						updated,
						packedJson(body, `${market} day shard ${day}/${shard}`),
						market,
						day,
						shard,
						row.version
					)
					.run()
			: await db
					.prepare(
						'INSERT INTO market_day_shards (market, day, shard, updated, body) VALUES (?, ?, ?, ?, ?) ' +
							'ON CONFLICT(market, day, shard) DO NOTHING'
					)
					.bind(
						market,
						day,
						shard,
						updated,
						packedJson(body, `${market} day shard ${day}/${shard}`)
					)
					.run();
		if ((result.meta.changes ?? 0) === 1) return;
	}
	throw new Error(`failed to update ${market} day shard ${day}/${shard} after concurrent writes`);
}

async function appendDayPoints<M extends MarketKind>(
	db: D1Database,
	market: M,
	updated: number,
	points: Record<string, PackedPointByMarket[M]>
): Promise<void> {
	if (Object.keys(points).length === 0) return;
	const day = utcDay(updated);
	const count = DAY_SHARDS[market];
	const incoming = partitionRecord(points, count);
	const { results: existing } = await db
		.prepare('SELECT shard, body, version FROM market_day_shards WHERE market = ? AND day = ?')
		.bind(market, day)
		.all<{ shard: number; body: string; version: number }>();
	const byShard = new Map(existing.map((row) => [row.shard, row]));
	const statements: D1PreparedStatement[] = [];
	const statementShards: number[] = [];

	for (let shard = 0; shard < count; shard++) {
		if (Object.keys(incoming[shard]).length === 0) continue;
		const row = byShard.get(shard);
		const body = row ? parseJsonRecord<PackedPointByMarket[M][]>(row.body) : {};
		let changed = false;
		for (const [item, point] of Object.entries(incoming[shard])) {
			changed = appendPoint(body, item, point) || changed;
		}
		if (!changed) continue;

		statementShards.push(shard);
		statements.push(
			row
				? db
						.prepare(
							'UPDATE market_day_shards SET updated = ?, version = version + 1, body = ? ' +
								'WHERE market = ? AND day = ? AND shard = ? AND version = ?'
						)
						.bind(
							updated,
							packedJson(body, `${market} day shard ${day}/${shard}`),
							market,
							day,
							shard,
							row.version
						)
				: db
						.prepare(
							'INSERT INTO market_day_shards (market, day, shard, updated, body) VALUES (?, ?, ?, ?, ?) ' +
								'ON CONFLICT(market, day, shard) DO NOTHING'
						)
						.bind(
							market,
							day,
							shard,
							updated,
							packedJson(body, `${market} day shard ${day}/${shard}`)
						)
		);
	}
	if (statements.length === 0) return;
	const results = await db.batch(statements);
	for (let i = 0; i < results.length; i++) {
		if ((results[i].meta.changes ?? 0) !== 1) {
			const shard = statementShards[i];
			await retryDayShard(db, market, day, shard, updated, incoming[shard]);
		}
	}
}

export async function finalizePackedDays(db: D1Database, now: number): Promise<number> {
	const today = utcDay(now);
	const { results: pending } = await db
		.prepare(
			'SELECT DISTINCT market, day FROM market_day_shards WHERE day < ? ORDER BY day, market'
		)
		.bind(today)
		.all<{ market: MarketKind; day: number }>();
	let finalized = 0;
	const insert = db.prepare(
		'INSERT INTO market_item_days (market, item, day, first_t, last_t, first_value, last_value, body) ' +
			'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' +
			'ON CONFLICT(market, item, day) DO UPDATE SET ' +
			'first_t = excluded.first_t, last_t = excluded.last_t, ' +
			'first_value = excluded.first_value, last_value = excluded.last_value, body = excluded.body ' +
			'WHERE first_t IS NOT excluded.first_t OR last_t IS NOT excluded.last_t OR body IS NOT excluded.body'
	);

	for (const { market, day } of pending) {
		const { results: rows } = await db
			.prepare(
				'SELECT shard, version, body FROM market_day_shards WHERE market = ? AND day = ? ORDER BY shard'
			)
			.bind(market, day)
			.all<{ shard: number; version: number; body: string }>();
		const byItem: Record<string, PackedPointByMarket[typeof market][]> = {};
		for (const row of rows) {
			const shard = parseJsonRecord<PackedPointByMarket[typeof market][]>(row.body);
			for (const [item, points] of Object.entries(shard)) {
				const combined = byItem[item] ?? [];
				combined.push(...points);
				byItem[item] = combined;
			}
		}
		const statements = Object.entries(byItem).map(([item, points]) => {
			points.sort(([a], [b]) => a - b);
			const first = points[0];
			const last = points[points.length - 1];
			return insert.bind(
				market,
				item,
				day,
				first[0],
				last[0],
				first[1],
				last[1],
				packedJson(points, `${market} item day ${item}/${day}`)
			);
		});
		await batchChunked(db, statements);
		// Delete only the exact shard versions that were transposed. If a delayed
		// refresh changes or recreates one concurrently, it survives for the next
		// maintenance pass and the item/day upsert above safely replaces its data.
		await batchChunked(
			db,
			rows.map((row) =>
				db
					.prepare(
						'DELETE FROM market_day_shards WHERE market = ? AND day = ? AND shard = ? AND version = ?'
					)
					.bind(market, day, row.shard, row.version)
			)
		);
		finalized++;
	}
	return finalized;
}

export async function writeBazaarRun(
	db: D1Database,
	lastUpdatedMs: number,
	products: Record<string, BazaarProductSnapshot>
): Promise<void> {
	const t = Math.floor(lastUpdatedMs / 1000);
	const stmts: D1PreparedStatement[] = [];
	const points: Record<string, PackedBazaarPoint> = {};
	for (const [id, s] of Object.entries(products)) {
		stmts.push(itemStmt(db, id, titleCase(id)));
		if (s.qs.bp !== 0 || s.qs.sp !== 0) points[id] = [t, s.qs.bp, s.qs.sp];
	}
	await batchChunked(db, stmts);
	await appendDayPoints(db, 'bazaar', t, points);
	await writeSnapshotShards(db, 'bazaar', lastUpdatedMs, products, [
		['bazaar_updated', String(lastUpdatedMs)]
	]);
}

export async function writeAuctionRun(
	db: D1Database,
	lastUpdatedMs: number,
	items: Record<string, AuctionItemStats>
): Promise<void> {
	const t = Math.floor(lastUpdatedMs / 1000);
	const stmts: D1PreparedStatement[] = [];
	const previousHistory = await db
		.prepare("SELECT value FROM meta WHERE key = 'auctions_history_updated'")
		.first<{ value: string }>();
	const historyIntervalMs = 3 * 60 * 60 * 1000;
	const recordHistory =
		!previousHistory || lastUpdatedMs - Number(previousHistory.value) >= historyIntervalMs;
	const points: Record<string, PackedAuctionPoint> = {};
	for (const [id, stats] of Object.entries(items)) {
		stmts.push(itemStmt(db, id, stats.name));
		if (recordHistory) {
			points[id] = [t, stats.lowestBin, stats.medianBin, stats.count];
		}
	}
	await batchChunked(db, stmts);
	if (recordHistory) await appendDayPoints(db, 'auctions', t, points);
	await writeSnapshotShards(db, 'auctions', lastUpdatedMs, items, [
		['auctions_updated', String(lastUpdatedMs)],
		...(recordHistory
			? ([['auctions_history_updated', String(lastUpdatedMs)]] as [string, string][])
			: [])
	]);
}

interface RollupSpec {
	table: 'bazaar_points' | 'auction_points';
	fromTier: 0 | 1;
	intoTier: 1 | 2;
	windowSeconds: number;
	bucketSeconds: number;
	sliceSeconds: number;
}

const ROLLUPS: RollupSpec[] = [
	{
		table: 'bazaar_points',
		fromTier: 0,
		intoTier: 1,
		windowSeconds: RAW_WINDOW,
		bucketSeconds: HOUR,
		sliceSeconds: 6 * HOUR
	},
	{
		table: 'bazaar_points',
		fromTier: 1,
		intoTier: 2,
		windowSeconds: HOURLY_WINDOW,
		bucketSeconds: DAY,
		sliceSeconds: DAY
	},
	{
		table: 'auction_points',
		fromTier: 0,
		intoTier: 2,
		windowSeconds: RAW_WINDOW,
		bucketSeconds: DAY,
		sliceSeconds: DAY
	}
];

export async function rollupAll(db: D1Database, now: number): Promise<void> {
	for (const spec of ROLLUPS) await rollupTier(db, spec, now);
}

async function rollupTier(db: D1Database, spec: RollupSpec, now: number): Promise<void> {
	const { table, fromTier, intoTier, windowSeconds, bucketSeconds, sliceSeconds } = spec;
	const cutoff = Math.floor((now - windowSeconds) / bucketSeconds) * bucketSeconds;
	const oldest = await db
		.prepare(`SELECT MIN(t) AS t FROM ${table} WHERE tier = ? AND t < ?`)
		.bind(fromTier, cutoff)
		.first<{ t: number | null }>();
	if (oldest?.t == null) return;

	const isBazaar = table === 'bazaar_points';
	const columns = isBazaar ? 'item, t, buy, sell' : 'item, t, lowest, median, count';
	for (
		let start = Math.floor(oldest.t / sliceSeconds) * sliceSeconds;
		start < cutoff;
		start += sliceSeconds
	) {
		const end = Math.min(start + sliceSeconds, cutoff);
		const { results } = await db
			.prepare(
				`SELECT ${columns} FROM ${table} WHERE tier = ? AND t >= ? AND t < ? ORDER BY item, t`
			)
			.bind(fromTier, start, end)
			.all<Record<string, number | string>>();
		if (results.length === 0) continue;

		const byItem = new Map<string, (BazaarPoint | AuctionPoint)[]>();
		for (const row of results) {
			const point = isBazaar
				? { t: row.t as number, b: row.buy as number, s: row.sell as number }
				: {
						t: row.t as number,
						l: row.lowest as number,
						m: row.median as number,
						c: row.count as number
					};
			const list = byItem.get(row.item as string) ?? [];
			list.push(point);
			byItem.set(row.item as string, list);
		}

		const insert = isBazaar
			? db.prepare(
					'INSERT OR REPLACE INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, ?, ?, ?, ?)'
				)
			: db.prepare(
					'INSERT OR REPLACE INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, ?, ?, ?, ?, ?)'
				);
		const stmts: D1PreparedStatement[] = [];
		for (const [item, points] of byItem) {
			const rolled = isBazaar
				? bucketMedian(points as BazaarPoint[], bucketSeconds, bazaarMedian)
				: bucketMedian(points as AuctionPoint[], bucketSeconds, auctionMedian);
			for (const p of rolled) {
				stmts.push(
					isBazaar
						? insert.bind(item, intoTier, p.t, (p as BazaarPoint).b, (p as BazaarPoint).s)
						: insert.bind(
								item,
								intoTier,
								p.t,
								(p as AuctionPoint).l,
								(p as AuctionPoint).m,
								(p as AuctionPoint).c
							)
				);
			}
		}
		stmts.push(
			db
				.prepare(`DELETE FROM ${table} WHERE tier = ? AND t >= ? AND t < ?`)
				.bind(fromTier, start, end)
		);
		await batchChunked(db, stmts);
	}
}

export async function pruneStaleSnapshots(db: D1Database, now: number): Promise<void> {
	await db.batch([
		db
			.prepare(
				'DELETE FROM bazaar_snapshot WHERE updated < ?1 AND (SELECT MAX(updated) FROM bazaar_snapshot) >= ?1'
			)
			.bind(now - DAY),
		db
			.prepare(
				'DELETE FROM auction_snapshot WHERE updated < ?1 AND (SELECT MAX(updated) FROM auction_snapshot) >= ?1'
			)
			.bind(now - DAY)
	]);
}

export async function assertPopulated(db: D1Database): Promise<void> {
	const row = await db
		.prepare(
			`SELECT EXISTS(
				SELECT 1 FROM bazaar_points
				UNION ALL SELECT 1 FROM market_day_shards WHERE market = 'bazaar'
				UNION ALL SELECT 1 FROM market_item_days WHERE market = 'bazaar'
			) AS populated`
		)
		.first<{ populated: number }>();
	if (!row?.populated) {
		throw new Error(
			'bazaar_points is empty - run the history import first (or set BOOTSTRAP=1 to start a fresh chain)'
		);
	}
}
