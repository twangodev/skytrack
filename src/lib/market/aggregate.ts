import type { BazaarProduct } from '$lib/hypixel/types';

export function median(values: number[]): number {
	if (values.length === 0) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface DecodedBin {
	id: string;
	price: number;
	tier: string;
	name: string;
}

export interface AuctionItemStats {
	name: string;
	tier: string;
	lowestBin: number;
	medianBin: number;
	count: number;
}

export function aggregateBins(bins: DecodedBin[]): Record<string, AuctionItemStats> {
	const grouped = new Map<string, DecodedBin[]>();
	for (const b of bins) {
		const list = grouped.get(b.id) ?? [];
		list.push(b);
		grouped.set(b.id, list);
	}
	const out: Record<string, AuctionItemStats> = {};
	for (const [id, list] of grouped) {
		const prices = list.map((b) => b.price);
		// pick names deterministically — pagination order shifts between fetches
		const name = list.map((b) => b.name).sort()[0];
		out[id] = {
			name,
			tier: list[0].tier,
			lowestBin: Math.round(Math.min(...prices)),
			medianBin: Math.round(median(prices)),
			count: list.length
		};
	}
	return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Level = [ppu: number, amount: number, orders: number];

export interface BazaarProductSnapshot {
	qs: {
		bp: number;
		sp: number;
		bv: number;
		sv: number;
		bmw: number;
		smw: number;
		bo: number;
		so: number;
	};
	buy: Level[];
	sell: Level[];
}

export function toSnapshot(p: BazaarProduct): BazaarProductSnapshot {
	const tuple = (e: { pricePerUnit: number; amount: number; orders: number }): Level => [
		e.pricePerUnit,
		e.amount,
		e.orders
	];
	const q = p.quick_status;
	return {
		qs: {
			bp: round1(q.buyPrice),
			sp: round1(q.sellPrice),
			bv: q.buyVolume,
			sv: q.sellVolume,
			bmw: q.buyMovingWeek,
			smw: q.sellMovingWeek,
			bo: q.buyOrders,
			so: q.sellOrders
		},
		buy: p.buy_summary.slice(0, 15).map(tuple),
		sell: p.sell_summary.slice(0, 15).map(tuple)
	};
}
