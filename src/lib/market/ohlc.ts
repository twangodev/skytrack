export type Candle = { t: number; o: number; h: number; l: number; c: number };

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

export function nearestCandle(
	candles: Candle[],
	bucketSeconds: number,
	timestamp: number
): Candle | undefined {
	let nearest: Candle | undefined;
	let distance = Infinity;
	for (const candle of candles) {
		const nextDistance = Math.abs(candle.t + bucketSeconds / 2 - timestamp);
		if (nextDistance >= distance) continue;
		nearest = candle;
		distance = nextDistance;
	}
	return nearest;
}

const BUCKET_LADDER = [
	300, 900, 1800, 3600, 7200, 14_400, 21_600, 43_200, 86_400, 259_200, 604_800
];

export const TARGET_CANDLES = 50;

/**
 * Adaptive candle width modeled on TradingView Lightweight Charts. Dense bars
 * remain readable while roomier bars approach 80% of their available spacing.
 */
export function candleBodyWidth(barSpacing: number, maxWidth = 12): number {
	if (!Number.isFinite(barSpacing) || barSpacing <= 0) return 1;
	if (barSpacing >= 2.5 && barSpacing <= 4) return Math.min(3, maxWidth);

	const coefficient = 1 - (0.2 * Math.atan(Math.max(4, barSpacing) - 4)) / (Math.PI * 0.5);
	return Math.min(maxWidth, Math.max(1, Math.floor(barSpacing * coefficient)));
}

export function pickBucket(rangeSeconds: number, targetCandles = TARGET_CANDLES): number {
	const minWidth = rangeSeconds / targetCandles;
	for (const w of BUCKET_LADDER) {
		if (w >= minWidth) return w;
	}
	return BUCKET_LADDER[BUCKET_LADDER.length - 1];
}
