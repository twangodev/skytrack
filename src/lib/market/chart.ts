import type { Level } from './aggregate';

export type Point = [x: number, y: number];
export type Domain = [min: number, max: number];

export interface SeriesStats {
	open: number;
	current: number;
	low: number;
	high: number;
	average: number;
	change: number;
	changePct: number;
}

export function clipPoints(points: Point[], seconds: number, now = Date.now() / 1000): Point[] {
	if (seconds === Infinity) return points;
	const cutoff = now - seconds;
	return points.filter(([timestamp]) => timestamp >= cutoff);
}

export function normalizePoints(points: Point[]): Point[] {
	const first = points[0]?.[1];
	if (first === undefined || first <= 0) return [];
	return points.map(([timestamp, value]) => [timestamp, ((value - first) / first) * 100]);
}

export function seriesStats(points: Point[]): SeriesStats | null {
	if (points.length === 0) return null;
	const open = points[0][1];
	const current = points[points.length - 1][1];
	let low = Infinity;
	let high = -Infinity;
	let total = 0;
	for (const [, value] of points) {
		low = Math.min(low, value);
		high = Math.max(high, value);
		total += value;
	}
	const change = current - open;
	return {
		open,
		current,
		low,
		high,
		average: total / points.length,
		change,
		changePct: open > 0 ? (change / open) * 100 : 0
	};
}

export function zoomDomain(
	domain: Domain,
	anchor: number,
	factor: number,
	minSpan = 0,
	maxSpan = Infinity
): Domain {
	const span = domain[1] - domain[0];
	if (span <= 0 || factor <= 0) return domain;
	const nextSpan = Math.min(maxSpan, Math.max(minSpan, span * factor));
	const ratio = Math.min(1, Math.max(0, (anchor - domain[0]) / span));
	return [anchor - nextSpan * ratio, anchor + nextSpan * (1 - ratio)];
}

export function panDomain(domain: Domain, delta: number): Domain {
	return [domain[0] + delta, domain[1] + delta];
}

export function clampDomain(domain: Domain, bounds: Domain): Domain {
	const span = domain[1] - domain[0];
	const boundsSpan = bounds[1] - bounds[0];
	if (span >= boundsSpan) return bounds;
	if (domain[0] < bounds[0]) return [bounds[0], bounds[0] + span];
	if (domain[1] > bounds[1]) return [bounds[1] - span, bounds[1]];
	return domain;
}

export function cumulative(levels: Level[]): Point[] {
	let sum = 0;
	return levels.map(([ppu, amount]) => {
		sum += amount;
		return [ppu, sum];
	});
}

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
