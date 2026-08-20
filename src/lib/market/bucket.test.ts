import { describe, expect, test } from 'vitest';
import {
	bucketMedian,
	bazaarMedian,
	auctionMedian,
	round1,
	DAY,
	HOUR,
	RAW_WINDOW,
	HOURLY_WINDOW,
	type BazaarPoint,
	type AuctionPoint
} from './bucket';

describe('round1', () => {
	test('rounds to one decimal place', () => {
		expect(round1(1.234)).toBe(1.2);
		expect(round1(1.25)).toBe(1.3);
		expect(round1(1)).toBe(1);
	});
});

describe('bucketMedian', () => {
	test('groups points into aligned buckets and applies the reducer', () => {
		const base = Math.floor(1781000000 / HOUR) * HOUR;
		const points = [{ t: base + 60 }, { t: base + 120 }, { t: base + HOUR + 60 }];
		const result = bucketMedian(points, HOUR, (bucket, start) => ({
			t: start,
			count: bucket.length
		}));
		expect(result).toEqual([
			{ t: base, count: 2 },
			{ t: base + HOUR, count: 1 }
		]);
	});

	test('returns buckets sorted by start time regardless of input order', () => {
		const base = Math.floor(1781000000 / DAY) * DAY;
		const points = [{ t: base + 2 * DAY }, { t: base }, { t: base + DAY }];
		const result = bucketMedian(points, DAY, (bucket, start) => ({ t: start }));
		expect(result.map((p) => p.t)).toEqual([base, base + DAY, base + 2 * DAY]);
	});
});

describe('bazaarMedian', () => {
	test('computes the median buy/sell price rounded to one decimal', () => {
		const bucket: BazaarPoint[] = [
			{ t: 0, b: 1, s: 0.5 },
			{ t: 0, b: 3, s: 1.5 },
			{ t: 0, b: 2, s: 1 }
		];
		expect(bazaarMedian(bucket, 100)).toEqual({ t: 100, b: 2, s: 1 });
	});
});

describe('auctionMedian', () => {
	test('computes the median low/median-bin price and the max count', () => {
		const bucket: AuctionPoint[] = [
			{ t: 0, l: 100, m: 200, c: 5 },
			{ t: 0, l: 120, m: 240, c: 9 },
			{ t: 0, l: 110, m: 220, c: 7 }
		];
		expect(auctionMedian(bucket, 100)).toEqual({ t: 100, l: 110, m: 220, c: 9 });
	});
});

describe('window constants', () => {
	test('RAW_WINDOW and HOURLY_WINDOW are day-multiples', () => {
		expect(RAW_WINDOW).toBe(90 * DAY);
		expect(HOURLY_WINDOW).toBe(730 * DAY);
	});
});
