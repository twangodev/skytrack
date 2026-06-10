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

export function scale(value: number, domain: Domain, range: Domain): number {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	if (d0 === d1) return (r0 + r1) / 2;
	return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

const fmt = (n: number) => Math.round(n * 100) / 100;

/** Stepped path (step-after), y inverted for SVG. */
export function stepPath(points: Point[], xd: Domain, yd: Domain, w: number, h: number): string {
	if (points.length === 0) return '';
	const px = (x: number) => fmt(scale(x, xd, [0, w]));
	const py = (y: number) => fmt(scale(y, yd, [h, 0]));
	let d = `M${px(points[0][0])},${py(points[0][1])}`;
	for (let i = 1; i < points.length; i++) {
		d += `H${px(points[i][0])}V${py(points[i][1])}`;
	}
	return d;
}

export function linePath(points: Point[], xd: Domain, yd: Domain, w: number, h: number): string {
	if (points.length === 0) return '';
	return points
		.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(scale(x, xd, [0, w]))},${fmt(scale(y, yd, [h, 0]))}`)
		.join('');
}

/** Round tick values for a y axis. */
export function niceTicks(min: number, max: number, count = 4): number[] {
	if (max <= min) return [min];
	const step = (max - min) / count;
	const magnitude = 10 ** Math.floor(Math.log10(step));
	const nice = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= step) ?? 10;
	const niceStep = nice * magnitude;
	const start = Math.ceil(min / niceStep) * niceStep;
	const ticks: number[] = [];
	for (let v = start; v <= max + 1e-9; v += niceStep) ticks.push(fmt(v));
	return ticks;
}
