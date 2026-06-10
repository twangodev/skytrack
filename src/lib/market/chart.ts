import type { Level } from './aggregate';

export type Point = [x: number, y: number];
export type Domain = [min: number, max: number];

export function cumulative(levels: Level[]): Point[] {
	let sum = 0;
	return levels.map(([ppu, amount]) => {
		sum += amount;
		return [ppu, sum];
	});
}

/** Price domain covering both books with a little headroom. */
export function depthDomain(buy: Level[], sell: Level[]): Domain {
	const prices = [...buy, ...sell].map(([ppu]) => ppu);
	if (prices.length === 0) return [0, 1];
	let lo = Math.min(...prices);
	let hi = Math.max(...prices);
	if (lo === hi) {
		lo *= 0.95;
		hi *= 1.05;
	}
	const pad = (hi - lo) * 0.04;
	return [Math.max(0, lo - pad), hi + pad];
}
