// All D1 writes for the pipeline. Single-row prepared statements batched in
// chunks - D1 caps bound params per statement at 100 and batches at 10k
// statements; db.batch() is atomic per chunk.
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { BazaarProductSnapshot, AuctionItemStats } from '../../../src/lib/market/aggregate';
import { bucketMedian, bazaarMedian, auctionMedian, RAW_WINDOW, HOURLY_WINDOW, DAY, HOUR } from '../../../src/lib/market/bucket';
import type { BazaarPoint, AuctionPoint } from '../../../src/lib/market/state';
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
		.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
		.bind(key, value);

// name only set on first sight; the official items refresh corrects it later.
// A UNIQUE(slug) violation from a DIFFERENT id must fail the run loudly -
// that is the old cross-kind slug-collision guard.
const itemStmt = (db: D1Database, id: string, name: string) =>
	db
		.prepare('INSERT INTO items (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
		.bind(id, slugFromId(id), name);

export async function writeBazaarRun(
	db: D1Database,
	lastUpdatedMs: number,
	products: Record<string, BazaarProductSnapshot>
): Promise<void> {
	const t = Math.floor(lastUpdatedMs / 1000);
	const snap = db.prepare(
		'INSERT INTO bazaar_snapshot (item, body, updated) VALUES (?, ?, ?) ON CONFLICT(item) DO UPDATE SET body = excluded.body, updated = excluded.updated'
	);
	const point = db.prepare('INSERT OR IGNORE INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, 0, ?, ?, ?)');
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
	items: Record<string, AuctionItemStats>,
	officialItems: Record<string, ItemMeta>
): Promise<void> {
	const t = Math.floor(lastUpdatedMs / 1000);
	const stmts: D1PreparedStatement[] = [];
	const official = db.prepare(
		'INSERT INTO items (id, slug, name, tier, category, npc) VALUES (?, ?, ?, ?, ?, ?) ' +
			'ON CONFLICT(id) DO UPDATE SET name = excluded.name, tier = excluded.tier, category = excluded.category, npc = excluded.npc'
	);
	for (const [id, meta] of Object.entries(officialItems)) {
		stmts.push(official.bind(id, slugFromId(id), meta.name, meta.tier ?? null, meta.category ?? null, meta.npc ?? null));
	}
	const snap = db.prepare(
		'INSERT INTO auction_snapshot (item, body, updated) VALUES (?, ?, ?) ON CONFLICT(item) DO UPDATE SET body = excluded.body, updated = excluded.updated'
	);
	const point = db.prepare('INSERT OR IGNORE INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, 0, ?, ?, ?, ?)');
	for (const [id, stats] of Object.entries(items)) {
		stmts.push(itemStmt(db, id, stats.name));
		stmts.push(snap.bind(id, JSON.stringify(stats), t));
		stmts.push(point.bind(id, t, stats.lowestBin, stats.medianBin, stats.count));
	}
	stmts.push(metaStmt(db, 'auctions_updated', String(lastUpdatedMs)));
	await batchChunked(db, stmts);
}

interface RollupSpec {
	table: 'bazaar_points' | 'auction_points';
	fromTier: 0 | 1;
	intoTier: 1 | 2;
	windowSeconds: number;
	bucketSeconds: number;
}

// Same tiering as state.ts rollup(): bazaar raw->hourly (90d, 1h buckets),
// bazaar hourly->daily (730d, 1d), auctions raw->daily (90d, 1d).
const ROLLUPS: RollupSpec[] = [
	{ table: 'bazaar_points', fromTier: 0, intoTier: 1, windowSeconds: RAW_WINDOW, bucketSeconds: HOUR },
	{ table: 'bazaar_points', fromTier: 1, intoTier: 2, windowSeconds: HOURLY_WINDOW, bucketSeconds: DAY },
	{ table: 'auction_points', fromTier: 0, intoTier: 2, windowSeconds: RAW_WINDOW, bucketSeconds: DAY }
];

export async function rollupAll(db: D1Database, now: number): Promise<void> {
	for (const spec of ROLLUPS) await rollupTier(db, spec, now);
}

async function rollupTier(db: D1Database, spec: RollupSpec, now: number): Promise<void> {
	const { table, fromTier, intoTier, windowSeconds, bucketSeconds } = spec;
	// Bucket-aligned cutoff: a bucket only spills once it is complete (same
	// invariant as spill() in state.ts).
	const cutoff = Math.floor((now - windowSeconds) / bucketSeconds) * bucketSeconds;
	const oldest = await db
		.prepare(`SELECT MIN(t) AS t FROM ${table} WHERE tier = ? AND t < ?`)
		.bind(fromTier, cutoff)
		.first<{ t: number | null }>();
	if (oldest?.t == null) return;

	const isBazaar = table === 'bazaar_points';
	// Process one day per slice: bounds memory (~400k rows worst case) and
	// keeps each query far under D1's 30s limit. Crash-safe: rows are only
	// deleted after their buckets are written, and rewriting a bucket from
	// the same rows is a no-op (INSERT OR REPLACE of identical values).
	for (let start = Math.floor(oldest.t / DAY) * DAY; start < cutoff; start += DAY) {
		const end = Math.min(start + DAY, cutoff);
		const { results } = await db
			.prepare(`SELECT * FROM ${table} WHERE tier = ? AND t >= ? AND t < ? ORDER BY item, t`)
			.bind(fromTier, start, end)
			.all<Record<string, number | string>>();
		if (results.length === 0) continue;

		const byItem = new Map<string, (BazaarPoint | AuctionPoint)[]>();
		for (const row of results) {
			const point = isBazaar
				? { t: row.t as number, b: row.buy as number, s: row.sell as number }
				: { t: row.t as number, l: row.lowest as number, m: row.median as number, c: row.count as number };
			const list = byItem.get(row.item as string) ?? [];
			list.push(point);
			byItem.set(row.item as string, list);
		}

		const insert = isBazaar
			? db.prepare('INSERT OR REPLACE INTO bazaar_points (item, tier, t, buy, sell) VALUES (?, ?, ?, ?, ?)')
			: db.prepare('INSERT OR REPLACE INTO auction_points (item, tier, t, lowest, median, count) VALUES (?, ?, ?, ?, ?, ?)');
		const stmts: D1PreparedStatement[] = [];
		for (const [item, points] of byItem) {
			const rolled = isBazaar
				? bucketMedian(points as BazaarPoint[], bucketSeconds, bazaarMedian)
				: bucketMedian(points as AuctionPoint[], bucketSeconds, auctionMedian);
			for (const p of rolled) {
				stmts.push(
					isBazaar
						? insert.bind(item, intoTier, p.t, (p as BazaarPoint).b, (p as BazaarPoint).s)
						: insert.bind(item, intoTier, p.t, (p as AuctionPoint).l, (p as AuctionPoint).m, (p as AuctionPoint).c)
				);
			}
		}
		stmts.push(db.prepare(`DELETE FROM ${table} WHERE tier = ? AND t >= ? AND t < ?`).bind(fromTier, start, end));
		await batchChunked(db, stmts);
	}
}

export async function pruneStaleSnapshots(db: D1Database, now: number): Promise<void> {
	await db.batch([
		db.prepare('DELETE FROM bazaar_snapshot WHERE updated < ?').bind(now - DAY),
		db.prepare('DELETE FROM auction_snapshot WHERE updated < ?').bind(now - DAY)
	]);
}

// Replaces the BOOTSTRAP/first-deploy machinery: after the one-time history
// import the DB is never legitimately empty, so empty means misconfiguration.
export async function assertPopulated(db: D1Database): Promise<void> {
	const row = await db.prepare('SELECT EXISTS(SELECT 1 FROM bazaar_points) AS populated').first<{ populated: number }>();
	if (!row?.populated) {
		throw new Error('bazaar_points is empty - run the history import first (or set BOOTSTRAP=1 to start a fresh chain)');
	}
}
