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

const BUCKET_LADDER = [
	300,
	900,
	1800,
	3600,
	7200,
	14_400,
	21_600,
	43_200,
	86_400,
	259_200,
	604_800
];

export const TARGET_CANDLES = 50;

export function pickBucket(rangeSeconds: number, targetCandles = TARGET_CANDLES): number {
	const minWidth = rangeSeconds / targetCandles;
	for (const w of BUCKET_LADDER) {
		if (w >= minWidth) return w;
	}
	return BUCKET_LADDER[BUCKET_LADDER.length - 1];
}
