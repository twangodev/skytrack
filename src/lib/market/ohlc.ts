export type Candle = { t: number; o: number; h: number; l: number; c: number };

/** Fold ascending [t, value] points into OHLC candles of `bucketSeconds` width. */
export function bucketOHLC(points: [t: number, v: number][], bucketSeconds: number): Candle[] {
	const candles: Candle[] = [];
	for (const [t, v] of points) {
		const start = Math.floor(t / bucketSeconds) * bucketSeconds;
		const last = candles[candles.length - 1];
		if (last && last.t === start) {
			last.c = v;
			if (v > last.h) last.h = v;
			if (v < last.l) last.l = v;
		} else {
			candles.push({ t: start, o: v, h: v, l: v, c: v });
		}
	}
	return candles;
}

/** "Nice" candle widths in seconds, ascending. Floors at the 5m source cadence. */
const BUCKET_LADDER = [
	300, // 5m
	900, // 15m
	1800, // 30m
	3600, // 1h
	7200, // 2h
	14_400, // 4h
	21_600, // 6h
	43_200, // 12h
	86_400, // 1d
	259_200, // 3d
	604_800 // 1w
];

/** Aim for at most this many candles across the visible range. */
export const TARGET_CANDLES = 50;

/**
 * Smallest "nice" bucket that keeps the visible range at or under `targetCandles`
 * candles. Targeting a count (rather than a fixed per-range width) keeps each
 * candle aggregating several samples instead of collapsing to a single source
 * tick — at the ~5-min refresh cadence, a 1D view becomes ~48 thirty-minute
 * candles rather than 288 one-point ticks. Floors at 5m, caps at 1w; pass the
 * real data span (not Infinity) for the ALL range so the target actually binds.
 */
export function pickBucket(rangeSeconds: number, targetCandles = TARGET_CANDLES): number {
	const minWidth = rangeSeconds / targetCandles;
	for (const w of BUCKET_LADDER) {
		if (w >= minWidth) return w;
	}
	return BUCKET_LADDER[BUCKET_LADDER.length - 1];
}
