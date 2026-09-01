import { toSnapshot, type BazaarProductSnapshot } from '$lib/market/aggregate';
import { BAZAAR_URL } from '$lib/hypixel/endpoints';
import { bazaarResponse } from '$lib/hypixel/types';

const LIVE_BAZAAR_TTL_MS = 60_000;

type BazaarMarket = ReturnType<typeof bazaarResponse.parse>;

let cached: { expiresAt: number; value: BazaarMarket } | null = null;
let pending: Promise<BazaarMarket> | null = null;

async function fetchBazaar(fetcher: typeof fetch): Promise<BazaarMarket> {
	const response = await fetcher(BAZAAR_URL, {
		headers: { 'User-Agent': 'skytrack.twango.dev' }
	});
	if (!response.ok) throw new Error(`Hypixel Bazaar request failed: ${response.status}`);
	return bazaarResponse.parse(await response.json());
}

export async function getLiveBazaar(
	fetcher: typeof fetch,
	now = Date.now()
): Promise<BazaarMarket> {
	if (cached && cached.expiresAt > now) return cached.value;
	if (!pending) {
		pending = fetchBazaar(fetcher)
			.then((value) => {
				cached = { expiresAt: Date.now() + LIVE_BAZAAR_TTL_MS, value };
				return value;
			})
			.finally(() => {
				pending = null;
			});
	}
	return pending;
}

export async function getLiveBazaarProduct(
	fetcher: typeof fetch,
	productId: string
): Promise<{ updatedAt: number; snapshot: BazaarProductSnapshot } | null> {
	const market = await getLiveBazaar(fetcher);
	const product = market.products[productId];
	return product ? { updatedAt: market.lastUpdated, snapshot: toSnapshot(product) } : null;
}

export function resetLiveBazaarCache(): void {
	cached = null;
	pending = null;
}
