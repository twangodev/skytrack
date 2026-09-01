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
			'ON CONFLICT(id) DO UPDATE SET name = excluded.name, tier = excluded.tier, category = excluded.category, npc = excluded.npc'
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

export async function writeBazaarRun(
	db: D1Database,
	lastUpdatedMs: number,
	products: Record<string, BazaarProductSnapshot>
): Promise<void> {
	const t = Math.floor(lastUpdatedMs / 1000);
	const snap = db.prepare(
		'INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?) ON CONFLICT(item) DO UPDATE SET body = excluded.body, updated = excluded.updated'
	);
	const point = db.prepare(
		'INSERT OR IGNORE INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)'
	);
	const stmts: D1PreparedStatement[] = [];
	for (const [id, s] of Object.entries(products)) {
		stmts.push(itemStmt(db, id, titleCase(id)));
		stmts.push(snap.bind(id, JSON.stringify(s), t));
		if (s.qs.bp !== 0 || s.qs.sp !== 0) stmts.push(point.bind(id, t, s.qs.bp, s.qs.sp));
	}
	stmts.push(metaStmt(db, 'bazaar_updated', String(lastUpdatedMs)));
	await batchChunked(db, stmts);
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
	const snap = db.prepare(
		'INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?) ON CONFLICT(item) DO UPDATE SET body = excluded.body, updated = excluded.updated'
	);
	const point = db.prepare(
		'INSERT OR IGNORE INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)'
	);
	for (const [id, stats] of Object.entries(items)) {
		stmts.push(itemStmt(db, id, stats.name));
		stmts.push(snap.bind(id, JSON.stringify(stats), t));
		if (recordHistory) stmts.push(point.bind(id, t, stats.lowestBin, stats.medianBin, stats.count));
	}
	stmts.push(metaStmt(db, 'auctions_updated', String(lastUpdatedMs)));
	if (recordHistory) stmts.push(metaStmt(db, 'auctions_history_updated', String(lastUpdatedMs)));
	await batchChunked(db, stmts);
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
		.prepare('SELECT EXISTS(SELECT 1 FROM bazaar_points) AS populated')
		.first<{ populated: number }>();
	if (!row?.populated) {
		throw new Error(
			'bazaar_points is empty - run the history import first (or set BOOTSTRAP=1 to start a fresh chain)'
		);
	}
}
