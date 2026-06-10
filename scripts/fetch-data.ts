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
	type KindName,
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

/**
 * A first deploy is the only situation where starting from empty state is
 * legitimate. Auto-detect it: the site must be alive (so a 404 means "never
 * published", not "unreachable") and no backups may exist. BOOTSTRAP=1
 * remains as a manual override for recovery scenarios.
 */
async function assertFirstDeploy(): Promise<void> {
	if (bootstrap) return;
	const probe = await fetch(`${SITE_DATA}/`).catch(() => null);
	if (!probe?.ok) {
		throw new Error(
			`site unreachable (${SITE_DATA}); cannot tell a first deploy from an outage — refusing to reset the chain`
		);
	}
	const token = process.env.GH_TOKEN;
	if (token) {
		const repo = process.env.GITHUB_REPOSITORY ?? 'twangodev/skytrack';
		const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/data-backup`, {
			headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
		});
		if (res.ok) {
			const release = (await res.json()) as { assets?: unknown[] };
			if (release.assets?.length) {
				throw new Error(
					'state routes 404 but data-backup release has assets — history existed; restore it into static/data/state/ instead of bootstrapping'
				);
			}
		}
	} else {
		console.warn('no GH_TOKEN; skipping backup-release check before bootstrap');
	}
	console.warn('auto-bootstrap: site is live but has never published state — starting empty');
}

/** Previous deploy's state: local files win (repeat local runs), else the live site. */
async function restoreState(): Promise<MarketState> {
	const found: { name: string; kind: KindName; tier: string; bytes: Uint8Array }[] = [];
	const missing: string[] = [];
	for (const { name, kind, tier } of STATE_FILES) {
		const localPath = `${STATE_DIR}/${name}.binpb`;
		if (existsSync(localPath)) {
			found.push({ name, kind, tier, bytes: new Uint8Array(readFileSync(localPath)) });
			continue;
		}
		// cache-buster: the CDN may serve a minutes-stale copy, which would
		// silently drop the previous run's snapshot from the chain
		const url = `${SITE_DATA}/data/state/${name}.binpb?v=${Date.now()}`;
		const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } }).catch((error) => {
			throw new Error(`state unreachable: ${url} (${error}) — refusing to reset the chain`);
		});
		if (res.ok) {
			found.push({ name, kind, tier, bytes: new Uint8Array(await res.arrayBuffer()) });
		} else if (res.status === 404) {
			missing.push(name);
		} else {
			throw new Error(
				`state fetch failed: ${url} -> HTTP ${res.status} — refusing to reset the chain`
			);
		}
	}

	if (missing.length === STATE_FILES.length) {
		await assertFirstDeploy();
	} else if (missing.length > 0 && !bootstrap) {
		throw new Error(
			`partial state: missing ${missing.join(', ')} while others exist — refusing to proceed (set BOOTSTRAP=1 to override)`
		);
	}

	const state = emptyState();
	for (const { name, kind, tier, bytes } of found) {
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

/**
 * When the AH crawl is skipped, the page-data snapshot comes from the
 * previous deploy. Returns false when no snapshot can be found anywhere —
 * the caller falls back to a full crawl.
 */
async function restoreAuctionsSnapshot(): Promise<boolean> {
	const local = `${DATA_DIR}/auctions.json`;
	const carried = `${STATE_DIR}/auctions-snapshot.json`;
	if (existsSync(carried)) {
		await Bun.write(local, Bun.file(carried));
		return true;
	}
	if (existsSync(local)) return true; // previous local run's copy
	const res = await fetch(`${SITE_DATA}/data/state/auctions-snapshot.json?v=${Date.now()}`, {
		headers: { 'Cache-Control': 'no-cache' }
	}).catch(() => null);
	if (!res?.ok) return false;
	await writeFile(local, new Uint8Array(await res.arrayBuffer()));
	return true;
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

	// the auctions snapshot is carried between deploys too, so runs that skip
	// the AH crawl still have names/tiers for the prerendered pages
	await Bun.write(`${STATE_DIR}/auctions-snapshot.json`, Bun.file(`${DATA_DIR}/auctions.json`));

	const ids = new Set<string>([
		...state.bazaar.raw.keys(),
		...state.bazaar.hourly.keys(),
		...state.bazaar.daily.keys(),
		...state.auctions.raw.keys(),
		...state.auctions.daily.keys()
	]);
	// per-kind slug maps may both be collision-free while two DIFFERENT ids
	// still share one slug across kinds — that would silently overwrite a
	// shared items/{slug}.json, so check the union here
	const slugOwners = new Map<string, string>();
	for (const id of ids) {
		const slug = slugFromId(id);
		const owner = slugOwners.get(slug);
		if (owner !== undefined && owner !== id) {
			throw new Error(`cross-kind slug collision: ${owner} and ${id} both map to ${slug}`);
		}
		slugOwners.set(slug, id);
		await writeFile(`${ITEMS_DIR}/${slug}.json`, JSON.stringify(itemSeries(state, id)));
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
	if (auctionsAreStale(state, now) || !(await restoreAuctionsSnapshot())) {
		auctionIds = await fetchAuctions(state, items);
	} else {
		console.log('auctions fresh enough; carrying snapshot forward');
	}

	// fails loudly if two ids would collide on one slug; validated per kind
	// because routes are namespaced (/bazaar/x and /auctions/x can coexist)
	buildSlugMap(bazaarIds);
	buildSlugMap([...auctionIds, ...state.auctions.raw.keys(), ...state.auctions.daily.keys()]);

	// validate BEFORE rollup: append can only grow the state, so any shrink
	// here means a bad restore. Rollup legitimately shrinks point counts
	// (N raw points fold into one bucket), so it must stay outside the gate.
	validateGrowth(prev, state);
	rollup(state, now);

	await emit(state);
	console.log(
		`state: ${totalPoints(state)} points, latest ${new Date(latestTimestamp(state) * 1000).toISOString()}`
	);
	console.log('done');
}

await main();
