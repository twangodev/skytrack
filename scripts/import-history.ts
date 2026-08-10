// One-time migration: download the live deployment-carried state and emit
// chunked SQL files for `wrangler d1 execute`. Deleted after cutover.
// Usage: bun scripts/import-history.ts   then run the printed commands.
import { mkdir, writeFile } from 'node:fs/promises';
import { STATE_FILES, decodeStateFile, type BazaarPoint, type AuctionPoint } from '../src/lib/market/state';

const SITE = process.env.SITE_URL ?? 'https://skytrack.twango.dev';
const OUT = 'import-sql';
const ROWS_PER_INSERT = 500; // 5-6 values per row, far under statement limits
const INSERTS_PER_FILE = 200; // ~100k rows / file

const TIER_NUM = { raw: 0, hourly: 1, daily: 2 } as const;
const esc = (s: string) => s.replace(/'/g, "''");

await mkdir(OUT, { recursive: true });
const commands: string[] = [];
let total = 0;

for (const { name, kind, tier } of STATE_FILES) {
	const res = await fetch(`${SITE}/data/state/${name}.binpb?v=${Date.now()}`, {
		headers: { 'Cache-Control': 'no-cache' }
	});
	if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
	const { items } = decodeStateFile(new Uint8Array(await res.arrayBuffer()));

	const rows: string[] = [];
	for (const [id, points] of items) {
		for (const p of points) {
			rows.push(
				kind === 'bazaar'
					? `('${esc(id)}', ${TIER_NUM[tier]}, ${p.t}, ${(p as BazaarPoint).b}, ${(p as BazaarPoint).s})`
					: `('${esc(id)}', ${TIER_NUM[tier]}, ${p.t}, ${(p as AuctionPoint).l}, ${(p as AuctionPoint).m}, ${(p as AuctionPoint).c})`
			);
		}
	}
	total += rows.length;

	const head =
		kind === 'bazaar'
			? 'INSERT OR IGNORE INTO bazaar_points (item, tier, t, buy, sell) VALUES\n'
			: 'INSERT OR IGNORE INTO auction_points (item, tier, t, lowest, median, count) VALUES\n';
	let file = 0;
	for (let i = 0; i < rows.length; i += ROWS_PER_INSERT * INSERTS_PER_FILE) {
		const slab = rows.slice(i, i + ROWS_PER_INSERT * INSERTS_PER_FILE);
		const stmts: string[] = [];
		for (let j = 0; j < slab.length; j += ROWS_PER_INSERT) {
			stmts.push(head + slab.slice(j, j + ROWS_PER_INSERT).join(',\n') + ';');
		}
		const path = `${OUT}/${name}-${String(file++).padStart(3, '0')}.sql`;
		await writeFile(path, stmts.join('\n'));
		commands.push(`bunx wrangler d1 execute skytrack --remote --file=${path} -c workers/pipeline/wrangler.jsonc -y`);
	}
	console.log(`${name}: ${rows.length} points`);
}

console.log(`\ntotal: ${total} points. Now run, from the repo root:\n`);
for (const cmd of commands) console.log(cmd);
console.log(`\nverify: bunx wrangler d1 execute skytrack --remote -c workers/pipeline/wrangler.jsonc --command "SELECT (SELECT COUNT(*) FROM bazaar_points) + (SELECT COUNT(*) FROM auction_points) AS n"`);
