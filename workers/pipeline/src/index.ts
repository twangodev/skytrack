// Data pipeline: the port of scripts/fetch-data.ts orchestration.
// Three crons, dispatched on controller.cron (see crons.ts):
//   */5 * * * *   bazaar refresh (light JSON)
//   10 */3 * * *  official items + full auction crawl (NBT-heavy)
//   30 4 * * *    rollup + snapshot pruning
// wrangler.jsonc's limits.cpu_ms is 300 000 (5 min) for every invocation - the
// crawl must fit that; sub-hourly crons would otherwise default to 30 s.
import type { ZodType } from 'zod';
import {
	bazaarResponse,
	auctionsPage,
	itemsResponse,
	type RawAuction
} from '../../../src/lib/hypixel/types';
import { BAZAAR_URL, AUCTIONS_URL, ITEMS_URL } from '../../../src/lib/hypixel/endpoints';
import { aggregateBins, toSnapshot, type DecodedBin } from '../../../src/lib/market/aggregate';
import { itemIdFromBytes } from '../../../src/lib/hypixel/nbt';
import {
	writeBazaarRun,
	writeAuctionRun,
	rollupAll,
	pruneStaleSnapshots,
	assertPopulated,
	type ItemMeta
} from './db';
import { CRONS } from './crons';

interface Env {
	DB: D1Database;
	BOOTSTRAP?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string, schema: ZodType<T>, retries = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) await sleep(attempt * attempt * 1000);
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

async function refreshBazaar(env: Env): Promise<void> {
	const data = await fetchJson(BAZAAR_URL, bazaarResponse);
	const products = Object.fromEntries(
		Object.entries(data.products).map(([id, p]) => [id, toSnapshot(p)])
	);
	await writeBazaarRun(env.DB, data.lastUpdated, products);
	console.log(JSON.stringify({ event: 'bazaar', products: Object.keys(products).length }));
}

function cleanName(auction: RawAuction, id: string): string {
	if (id.startsWith('PET_')) return auction.item_name.replace(/^\[Lvl \d+\] /, '') + ' Pet';
	if (id.startsWith('RUNE_')) return auction.item_name.replace(/^◆ /, '').replace(/ [IVXLC]+$/, '');
	return auction.item_name;
}

async function refreshAuctions(env: Env): Promise<void> {
	const itemsData = await fetchJson(ITEMS_URL, itemsResponse);
	const items: Record<string, ItemMeta> = {};
	for (const item of itemsData.items) {
		items[item.id] = {
			name: item.name,
			...(item.tier && { tier: item.tier }),
			...(item.category && { category: item.category }),
			...(item.npc_sell_price !== undefined && { npc: item.npc_sell_price })
		};
	}

	const first = await fetchJson(`${AUCTIONS_URL}?page=0`, auctionsPage);
	// Dedupe into the map as each concurrency chunk resolves rather than
	// retaining every parsed page: the crawl is tens of thousands of listings
	// spread over ~1k-listing pages, and keeping the page objects alive
	// alongside the deduped set holds a second copy of all of them for no
	// benefit. Behaviour is unchanged - later pages still win a uuid collision
	// (as in the old `new Map(pages.flatMap(...))`) and first-insertion order
	// is preserved.
	const byUuid = new Map<string, RawAuction>();
	const collect = (page: { auctions: RawAuction[] }) => {
		for (const a of page.auctions) byUuid.set(a.uuid, a);
	};
	collect(first);
	const remaining = Array.from({ length: first.totalPages - 1 }, (_, i) => i + 1);
	const concurrency = 6;
	for (let i = 0; i < remaining.length; i += concurrency) {
		const chunk = remaining.slice(i, i + concurrency);
		const fetched = await Promise.all(
			chunk.map((page) => fetchJson(`${AUCTIONS_URL}?page=${page}`, auctionsPage))
		);
		for (const page of fetched) collect(page);
	}
	const auctions = [...byUuid.values()];
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
	await writeAuctionRun(env.DB, first.lastUpdated, aggregated, items);
	console.log(
		JSON.stringify({
			event: 'auctions',
			total: auctions.length,
			bins: bins.length,
			failed,
			items: Object.keys(aggregated).length
		})
	);
}

async function maintain(env: Env): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	await rollupAll(env.DB, now);
	await pruneStaleSnapshots(env.DB, now);
	console.log(JSON.stringify({ event: 'maintenance' }));
}

export default {
	async scheduled(controller, env): Promise<void> {
		if (env.BOOTSTRAP !== '1') await assertPopulated(env.DB);
		// a thrown error marks the invocation failed in the CF dashboard
		switch (controller.cron) {
			case CRONS.bazaar:
				return refreshBazaar(env);
			case CRONS.auctions:
				return refreshAuctions(env);
			case CRONS.maintenance:
				return maintain(env);
			default:
				throw new Error(`unknown cron: ${controller.cron}`);
		}
	}
} satisfies ExportedHandler<Env>;
