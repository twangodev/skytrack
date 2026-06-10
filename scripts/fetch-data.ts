// Deployment-carried state pipeline: restore the previous deploy's packed
// history, append fresh official-API data, re-tier, and emit state +
// per-item JSON endpoints into static/data/. Orchestration only — the
// logic lives in src/lib and is tested there.
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import type { ZodType } from 'zod';
import {
	bazaarResponse,
	auctionsPage,
	itemsResponse,
	type RawAuction
} from '../src/lib/hypixel/types';
import { BAZAAR_URL, AUCTIONS_URL, ITEMS_URL } from '../src/lib/hypixel/endpoints';
import { aggregateBins, toSnapshot, type DecodedBin } from '../src/lib/market/aggregate';
import { itemIdFromBytes } from '../src/lib/hypixel/nbt';
import {
	STATE_FILES,
	emptyState,
	encodeStateFile,
	decodeStateFile,
	appendSnapshot,
	rollup,
	stateStats,
	validateGrowth,
	totalPoints,
	latestTimestamp,
	type MarketState,
	type BazaarPoint,
	type AuctionPoint
} from '../src/lib/market/state';
import { itemSeries } from '../src/lib/market/series';
import { buildSlugMap, slugFromId } from '../src/lib/slug';

const DATA_DIR = 'src/lib/data';
const STATE_DIR = 'static/data/state';
const ITEMS_DIR = 'static/data/items';
const SITE_DATA = process.env.SITE_URL ?? 'https://skytrack.twango.dev';
const FRESH_MS = 5 * 60 * 1000;
const AUCTIONS_STALE_S = 2.5 * 3600;
const force = process.argv.includes('--force');
const bootstrap = process.env.BOOTSTRAP === '1';

async function fetchJson<T>(url: string, schema: ZodType<T>, retries = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) await Bun.sleep(attempt * attempt * 1000);
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'skytrack.twango.dev' } });
			if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
			return schema.parse(await res.json());
		} catch (error) {
			lastError = error;
			console.warn(`attempt ${attempt + 1} failed: ${error}`);
		}
	}
	throw lastError;
}

function isFresh(): boolean {
	for (const name of ['items.json', 'auctions.json', 'bazaar.json']) {
		if (!existsSync(`${DATA_DIR}/${name}`)) return false;
	}
	try {
		const { lastUpdated } = JSON.parse(readFileSync(`${DATA_DIR}/bazaar.json`, 'utf8'));
		return Date.now() - lastUpdated < FRESH_MS;
	} catch {
		return false;
	}
}

/** Previous deploy's state: local files win (repeat local runs), else the live site. */
async function restoreState(): Promise<MarketState> {
	const state = emptyState();
	for (const { name, kind, tier } of STATE_FILES) {
		const localPath = `${STATE_DIR}/${name}.binpb`;
		let bytes: Uint8Array | null = null;
		if (existsSync(localPath)) {
			bytes = new Uint8Array(readFileSync(localPath));
		} else {
			const res = await fetch(`${SITE_DATA}/data/state/${name}.binpb`);
			if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
		}
		if (bytes === null) {
			if (bootstrap) {
				console.warn(`no previous state for ${name}; bootstrapping empty`);
				continue;
			}
			throw new Error(
				`previous state missing: ${name}.binpb — refusing to reset the chain (set BOOTSTRAP=1 to start empty)`
			);
		}
		const decoded = decodeStateFile(bytes);
		if (decoded.kind !== kind || decoded.tier !== tier) {
			throw new Error(
				`state file ${name} has unexpected kind/tier ${decoded.kind}/${decoded.tier}`
			);
		}
		const target = state[kind] as Record<string, Map<string, unknown[]>>;
		target[tier] = decoded.items;
	}
	return state;
}

async function fetchItems(): Promise<Record<string, { name: string }>> {
	const data = await fetchJson(ITEMS_URL, itemsResponse);
	const items: Record<string, { name: string; tier?: string; category?: string; npc?: number }> =
		{};
	for (const item of data.items) {
		items[item.id] = {
			name: item.name,
			...(item.tier && { tier: item.tier }),
			...(item.category && { category: item.category }),
			...(item.npc_sell_price !== undefined && { npc: item.npc_sell_price })
		};
	}
	await writeFile(`${DATA_DIR}/items.json`, JSON.stringify(items));
	console.log(`items: ${data.items.length}`);
	return items;
}

async function fetchBazaar(state: MarketState): Promise<string[]> {
	const data = await fetchJson(BAZAAR_URL, bazaarResponse);
	const products = Object.fromEntries(
		Object.entries(data.products).map(([id, p]) => [id, toSnapshot(p)])
	);
	await writeFile(
		`${DATA_DIR}/bazaar.json`,
		JSON.stringify({ lastUpdated: data.lastUpdated, products })
	);

	const t = Math.floor(data.lastUpdated / 1000);
	const points = new Map<string, BazaarPoint>();
	for (const [id, snap] of Object.entries(products)) {
		if (snap.qs.bp === 0 && snap.qs.sp === 0) continue;
		points.set(id, { t, b: snap.qs.bp, s: snap.qs.sp });
	}
	appendSnapshot(state, 'bazaar', points);
	console.log(`bazaar: ${points.size} products`);
	return Object.keys(products);
}

async function fetchAuctions(
	state: MarketState,
	items: Record<string, { name: string }>
): Promise<string[]> {
	const first = await fetchJson(`${AUCTIONS_URL}?page=0`, auctionsPage);
	const pages = [first];
	const remaining = Array.from({ length: first.totalPages - 1 }, (_, i) => i + 1);
	const concurrency = 6;
	for (let i = 0; i < remaining.length; i += concurrency) {
		const chunk = remaining.slice(i, i + concurrency);
		pages.push(
			...(await Promise.all(
				chunk.map((page) => fetchJson(`${AUCTIONS_URL}?page=${page}`, auctionsPage))
			))
		);
	}
	// listings shift pages while we crawl — dedup by uuid so none count twice
	const auctions = [...new Map(pages.flatMap((p) => p.auctions).map((a) => [a.uuid, a])).values()];
	const bins = auctions.filter((a) => a.bin === true && a.claimed !== true);

	const decoded: DecodedBin[] = [];
	let failed = 0;
	const chunkSize = 500;
	for (let i = 0; i < bins.length; i += chunkSize) {
		const chunk = bins.slice(i, i + chunkSize);
		const ids = await Promise.all(chunk.map((a) => itemIdFromBytes(a.item_bytes)));
		for (let j = 0; j < chunk.length; j++) {
			const id = ids[j];
			if (id === null) {
				failed++;
				continue;
			}
			decoded.push({
				id,
				price: chunk[j].starting_bid,
				tier: chunk[j].tier,
				name: items[id]?.name ?? cleanName(chunk[j], id)
			});
		}
	}

	const aggregated = aggregateBins(decoded);
	await writeFile(
		`${DATA_DIR}/auctions.json`,
		JSON.stringify({ lastUpdated: first.lastUpdated, items: aggregated })
	);

	const t = Math.floor(first.lastUpdated / 1000);
	const points = new Map<string, AuctionPoint>();
	for (const [id, s] of Object.entries(aggregated)) {
		points.set(id, { t, l: s.lowestBin, m: s.medianBin, c: s.count });
	}
	appendSnapshot(state, 'auctions', points);
	console.log(
		`auctions: ${auctions.length} total, ${bins.length} bins, ${failed} undecodable, ${points.size} unique items`
	);
	return Object.keys(aggregated);
}

function cleanName(auction: RawAuction, id: string): string {
	if (id.startsWith('PET_')) {
		return auction.item_name.replace(/^\[Lvl \d+\] /, '') + ' Pet';
	}
	if (id.startsWith('RUNE_')) {
		// "◆ Music Rune III" -> "Music Rune"
		return auction.item_name.replace(/^◆ /, '').replace(/ [IVXLC]+$/, '');
	}
	return auction.item_name;
}

function auctionsAreStale(state: MarketState, now: number): boolean {
	let newest = 0;
	for (const points of state.auctions.raw.values()) {
		const last = points[points.length - 1];
		if (last) newest = Math.max(newest, last.t);
	}
	return now - newest > AUCTIONS_STALE_S;
}

async function emit(state: MarketState): Promise<void> {
	await mkdir(STATE_DIR, { recursive: true });
	await mkdir(ITEMS_DIR, { recursive: true });

	for (const { name, kind, tier } of STATE_FILES) {
		const source = state[kind] as Record<string, Map<string, (BazaarPoint | AuctionPoint)[]>>;
		await writeFile(`${STATE_DIR}/${name}.binpb`, encodeStateFile(kind, tier, source[tier]));
	}

	const ids = new Set<string>([
		...state.bazaar.raw.keys(),
		...state.bazaar.hourly.keys(),
		...state.bazaar.daily.keys(),
		...state.auctions.raw.keys(),
		...state.auctions.daily.keys()
	]);
	for (const id of ids) {
		await writeFile(`${ITEMS_DIR}/${slugFromId(id)}.json`, JSON.stringify(itemSeries(state, id)));
	}
	console.log(`emitted ${STATE_FILES.length} state files, ${ids.size} item series`);
}

async function main() {
	if (!force && isFresh()) {
		console.log('market data is fresh; skipping (use --force to refetch)');
		return;
	}
	await mkdir(DATA_DIR, { recursive: true });

	const state = await restoreState();
	const prev = stateStats(state);
	const now = Math.floor(Date.now() / 1000);

	const items = await fetchItems();
	const bazaarIds = await fetchBazaar(state);

	let auctionIds: string[] = [];
	if (auctionsAreStale(state, now) || !existsSync(`${DATA_DIR}/auctions.json`)) {
		auctionIds = await fetchAuctions(state, items);
	} else {
		console.log('auctions fresh enough; carrying forward');
	}

	// fails loudly if two ids would collide on one slug; validated per kind
	// because routes are namespaced (/bazaar/x and /auctions/x can coexist)
	buildSlugMap(bazaarIds);
	buildSlugMap([...auctionIds, ...state.auctions.raw.keys(), ...state.auctions.daily.keys()]);

	rollup(state, now);
	validateGrowth(prev, state);

	await emit(state);
	console.log(
		`state: ${totalPoints(state)} points, latest ${new Date(latestTimestamp(state) * 1000).toISOString()}`
	);
	console.log('done');
}

await main();
