export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

const DAY = 86_400;

export const RAW_SLICE = 35 * DAY;

export interface ItemSeriesJson {
	bazaar?: { raw: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

export function mergedSeries(
	json: ItemSeriesJson,
	kind: 'bazaar' | 'auctions'
): [number, number, number][] {
	if (kind === 'bazaar') {
		const tiers = json.bazaar;
		if (!tiers) return [];
		return [...tiers.daily, ...tiers.hourly, ...tiers.raw]
			.map(([t, b, s]) => [t, b, s] as [number, number, number])
			.sort((a, b) => a[0] - b[0]);
	}
	const tiers = json.auctions;
	if (!tiers) return [];
	return [...tiers.daily, ...tiers.raw]
		.map(([t, l, m]) => [t, l, m] as [number, number, number])
		.sort((a, b) => a[0] - b[0]);
}
