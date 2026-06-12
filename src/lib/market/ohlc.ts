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

/**
 * Candle width that keeps a dense-but-readable count for the visible range.
 * Each tier stays at or above the underlying source resolution so candles never
 * collapse to one-point ticks: raw points land at the 5-min refresh cadence
 * (older history is 15-min from the previous schedule), the bazaar hourly
 * tier is 4h-decimated, and the daily tiers are 1d. The ~288-360 candle counts
 * below all draw from data at least that dense for their range.
 */
export function pickBucket(rangeSeconds: number): number {
	if (rangeSeconds <= 86_400) return 300; // 5m (~288 candles, matches raw cadence)
	if (rangeSeconds <= 604_800) return 1800; // 30m (~336 candles)
	if (rangeSeconds <= 2_592_000) return 7200; // 2h (~360 candles)
	return 86_400; // 1D
}
