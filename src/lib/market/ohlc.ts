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

/** Candle width that keeps a sensible number of candles for the visible range. */
export function pickBucket(rangeSeconds: number): number {
	if (rangeSeconds <= 86_400) return 3600; // 1h
	if (rangeSeconds <= 604_800) return 14_400; // 4h
	if (rangeSeconds <= 2_592_000) return 86_400; // 1D
	return 86_400 * 7; // 1W
}
