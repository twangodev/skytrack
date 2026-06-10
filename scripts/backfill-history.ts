// One-time migration: fold the git-committed ndjson history into the
// deployment-carried state files. Safe to re-run (merges by timestamp).
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import {
	STATE_FILES,
	emptyState,
	encodeStateFile,
	decodeStateFile,
	type MarketState,
	type BazaarPoint,
	type AuctionPoint
} from '../src/lib/market/state';

const HISTORY_DIR = 'data/history';
const STATE_DIR = 'static/data/state';

type BazaarRow = { t: number; p: string; b: number; s: number };
type AuctionRow = { t: number; i: string; l: number; m: number; c: number };
type BazaarDailyRow = { d: string; p: string; b: number; s: number };
type AuctionDailyRow = { d: string; i: string; l: number; m: number; c: number };

const decodeNdjson = <T>(text: string): T[] =>
	text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as T);

const NOON_UTC = 12 * 3600;
const dateToT = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) + NOON_UTC;

function merge<P extends { t: number }>(into: Map<string, P[]>, id: string, point: P): void {
	const list = into.get(id) ?? [];
	list.push(point);
	into.set(id, list);
}

function dedupSort<P extends { t: number }>(map: Map<string, P[]>): void {
	for (const [id, list] of map) {
		const byT = new Map<number, P>(list.map((p) => [p.t, p]));
		map.set(
			id,
			[...byT.values()].sort((a, b) => a.t - b.t)
		);
	}
}

async function loadExistingState(): Promise<MarketState> {
	const state = emptyState();
	for (const { name, kind, tier } of STATE_FILES) {
		const path = `${STATE_DIR}/${name}.binpb`;
		if (!existsSync(path)) continue;
		const decoded = decodeStateFile(new Uint8Array(readFileSync(path)));
		const target = state[kind] as Record<string, Map<string, unknown[]>>;
		target[tier] = decoded.items;
	}
	return state;
}

async function main() {
	const state = await loadExistingState();
	let rows = 0;

	for (const name of await readdir(`${HISTORY_DIR}/bazaar`)) {
		const text = await readFile(`${HISTORY_DIR}/bazaar/${name}`, 'utf8');
		if (name === 'daily.ndjson') {
			for (const row of decodeNdjson<BazaarDailyRow>(text)) {
				merge<BazaarPoint>(state.bazaar.daily, row.p, { t: dateToT(row.d), b: row.b, s: row.s });
				rows++;
			}
		} else {
			for (const row of decodeNdjson<BazaarRow>(text)) {
				merge<BazaarPoint>(state.bazaar.raw, row.p, { t: row.t, b: row.b, s: row.s });
				rows++;
			}
		}
	}

	for (const name of await readdir(`${HISTORY_DIR}/auctions`)) {
		const text = await readFile(`${HISTORY_DIR}/auctions/${name}`, 'utf8');
		if (name === 'daily.ndjson') {
			for (const row of decodeNdjson<AuctionDailyRow>(text)) {
				merge<AuctionPoint>(state.auctions.daily, row.i, {
					t: dateToT(row.d),
					l: row.l,
					m: row.m,
					c: row.c
				});
				rows++;
			}
		} else {
			for (const row of decodeNdjson<AuctionRow>(text)) {
				merge<AuctionPoint>(state.auctions.raw, row.i, { t: row.t, l: row.l, m: row.m, c: row.c });
				rows++;
			}
		}
	}

	dedupSort(state.bazaar.raw);
	dedupSort(state.bazaar.daily);
	dedupSort(state.auctions.raw);
	dedupSort(state.auctions.daily);

	await mkdir(STATE_DIR, { recursive: true });
	for (const { name, kind, tier } of STATE_FILES) {
		const source = state[kind] as Record<string, Map<string, (BazaarPoint | AuctionPoint)[]>>;
		await writeFile(`${STATE_DIR}/${name}.binpb`, encodeStateFile(kind, tier, source[tier]));
	}
	console.log(`backfilled ${rows} ndjson rows into state`);
}

await main();
