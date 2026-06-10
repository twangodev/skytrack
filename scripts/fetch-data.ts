// Fetches official Hypixel API data into gitignored build inputs
// (src/lib/data/*.json) and appends committed history (data/history/**).
// Orchestration only — the logic lives in src/lib and is tested there.
import { mkdir, readdir, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { ZodType } from 'zod';
import { bazaarResponse, auctionsPage, itemsResponse, type RawAuction } from '../src/lib/hypixel/types';
import { BAZAAR_URL, AUCTIONS_URL, ITEMS_URL } from '../src/lib/hypixel/endpoints';
import { aggregateBins, toSnapshot, type DecodedBin } from '../src/lib/market/aggregate';
import { itemIdFromBytes } from '../src/lib/hypixel/nbt';
import {
	encodeNdjson,
	decodeNdjson,
	dayKey,
	compactBazaarDay,
	compactAuctionDay,
	selectStale,
	type BazaarRow,
	type AuctionRow
} from '../src/lib/market/history';
import { buildSlugMap } from '../src/lib/slug';

const DATA_DIR = 'src/lib/data';
const HISTORY_DIR = 'data/history';
const FRESH_MS = 10 * 60 * 1000;
const force = process.argv.includes('--force');

const round1 = (n: number) => Math.round(n * 10) / 10;

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
	const path = `${DATA_DIR}/bazaar.json`;
	if (!existsSync(path)) return false;
	try {
		const { lastUpdated } = JSON.parse(require('node:fs').readFileSync(path, 'utf8'));
		return Date.now() - lastUpdated < FRESH_MS;
	} catch {
		return false;
	}
}

async function appendHistory(kind: 'bazaar' | 'auctions', day: string, rows: object[]) {
	const dir = `${HISTORY_DIR}/${kind}`;
	await mkdir(dir, { recursive: true });
	await appendFile(`${dir}/${day}.ndjson`, encodeNdjson(rows));
}

async function compactHistory(kind: 'bazaar' | 'auctions', today: string) {
	const dir = `${HISTORY_DIR}/${kind}`;
	if (!existsSync(dir)) return;
	const stale = selectStale(await readdir(dir), today);
	for (const name of stale) {
		const date = name.slice(0, 10);
		const dailyPath = `${dir}/daily.ndjson`;
		const existingDaily = existsSync(dailyPath) ? await readFile(dailyPath, 'utf8') : '';
		const alreadyCompacted = existingDaily.includes(`"d":"${date}"`);
		if (!alreadyCompacted) {
			const rows = decodeNdjson<never>(await readFile(`${dir}/${name}`, 'utf8'));
			const compacted =
				kind === 'bazaar'
					? compactBazaarDay(date, rows as BazaarRow[])
					: compactAuctionDay(date, rows as AuctionRow[]);
			await appendFile(dailyPath, encodeNdjson(compacted));
		}
		await rm(`${dir}/${name}`);
		console.log(`compacted ${kind}/${name}`);
	}
}

async function fetchItems(): Promise<Record<string, { name: string }>> {
	const data = await fetchJson(ITEMS_URL, itemsResponse);
	const items: Record<
		string,
		{ name: string; tier?: string; category?: string; npc?: number }
	> = {};
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

async function fetchBazaar(): Promise<string[]> {
	const data = await fetchJson(BAZAAR_URL, bazaarResponse);
	const products = Object.fromEntries(
		Object.entries(data.products).map(([id, p]) => [id, toSnapshot(p)])
	);
	await writeFile(
		`${DATA_DIR}/bazaar.json`,
		JSON.stringify({ lastUpdated: data.lastUpdated, products })
	);

	const t = Math.floor(data.lastUpdated / 1000);
	const rows: BazaarRow[] = Object.entries(products)
		.filter(([, snap]) => snap.qs.bp !== 0 || snap.qs.sp !== 0)
		.map(([p, snap]) => ({ t, p, b: round1(snap.qs.bp), s: round1(snap.qs.sp) }));
	await appendHistory('bazaar', dayKey(t), rows);
	console.log(`bazaar: ${rows.length} products`);
	return Object.keys(products);
}

async function fetchAuctions(items: Record<string, { name: string }>): Promise<string[]> {
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
	const auctions = pages.flatMap((p) => p.auctions);
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
	const rows: AuctionRow[] = Object.entries(aggregated).map(([i, s]) => ({
		t,
		i,
		l: s.lowestBin,
		m: s.medianBin,
		c: s.count
	}));
	await appendHistory('auctions', dayKey(t), rows);
	console.log(
		`auctions: ${auctions.length} total, ${bins.length} bins, ${failed} undecodable, ${rows.length} unique items`
	);
	return Object.keys(aggregated);
}

function cleanName(auction: RawAuction, id: string): string {
	if (id.startsWith('PET_')) {
		return auction.item_name.replace(/^\[Lvl \d+\] /, '') + ' Pet';
	}
	return auction.item_name;
}

async function main() {
	if (!force && isFresh()) {
		console.log('market data is fresh; skipping (use --force to refetch)');
		return;
	}
	await mkdir(DATA_DIR, { recursive: true });

	const items = await fetchItems();
	const bazaarIds = await fetchBazaar();
	const auctionIds = await fetchAuctions(items);

	// fails loudly if two ids would collide on one slug
	buildSlugMap([...bazaarIds, ...auctionIds]);

	const today = dayKey(Math.floor(Date.now() / 1000));
	await compactHistory('bazaar', today);
	await compactHistory('auctions', today);
	console.log('done');
}

await main();
