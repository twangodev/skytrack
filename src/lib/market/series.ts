import type { MarketState, BazaarPoint, AuctionPoint } from './state';

/** intraday slice of the raw tier exposed to charts (1D view + headroom) */
export const INTRADAY_WINDOW = 48 * 3_600;

/** columnar tuples: bazaar [t, instabuy, instasell]; auctions [t, lowest, median, count] */
export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

export interface ItemSeriesJson {
	bazaar?: { intraday: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

const bazaarTuple = (p: BazaarPoint): BazaarTuple => [p.t, p.b, p.s];
const auctionTuple = (p: AuctionPoint): AuctionTuple => [p.t, p.l, p.m, p.c];

export function itemSeries(state: MarketState, id: string): ItemSeriesJson {
	const out: ItemSeriesJson = {};

	const raw = state.bazaar.raw.get(id);
	const hourly = state.bazaar.hourly.get(id);
	const daily = state.bazaar.daily.get(id);
	if (raw?.length || hourly?.length || daily?.length) {
		const newest = raw?.[raw.length - 1]?.t ?? 0;
		out.bazaar = {
			intraday: (raw ?? []).filter((p) => p.t >= newest - INTRADAY_WINDOW).map(bazaarTuple),
			hourly: (hourly ?? []).map(bazaarTuple),
			daily: (daily ?? []).map(bazaarTuple)
		};
	}

	const auctionRaw = state.auctions.raw.get(id);
	const auctionDaily = state.auctions.daily.get(id);
	if (auctionRaw?.length || auctionDaily?.length) {
		out.auctions = {
			raw: (auctionRaw ?? []).map(auctionTuple),
			daily: (auctionDaily ?? []).map(auctionTuple)
		};
	}

	return out;
}
