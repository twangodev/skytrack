import { median } from './aggregate';

export type BazaarPoint = { t: number; b: number; s: number };
export type AuctionPoint = { t: number; l: number; m: number; c: number };

export const DAY = 86_400;
export const HOUR = 3_600;

export const RAW_WINDOW = 90 * DAY;
export const HOURLY_WINDOW = 730 * DAY;

export function bucketMedian<P extends { t: number }>(
	points: P[],
	bucketSeconds: number,
	reduce: (bucket: P[], bucketStart: number) => P
): P[] {
	const buckets = new Map<number, P[]>();
	for (const point of points) {
		const start = Math.floor(point.t / bucketSeconds) * bucketSeconds;
		const list = buckets.get(start) ?? [];
		list.push(point);
		buckets.set(start, list);
	}
	return [...buckets.entries()]
		.sort(([x], [y]) => x - y)
		.map(([start, list]) => reduce(list, start));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const bazaarMedian = (bucket: BazaarPoint[], t: number): BazaarPoint => ({
	t,
	b: round1(median(bucket.map((p) => p.b))),
	s: round1(median(bucket.map((p) => p.s)))
});

export const auctionMedian = (bucket: AuctionPoint[], t: number): AuctionPoint => ({
	t,
	l: Math.round(median(bucket.map((p) => p.l))),
	m: Math.round(median(bucket.map((p) => p.m))),
	c: Math.max(...bucket.map((p) => p.c))
});
