import { describe, expect, test } from 'vitest';
import { bucketOHLC, pickBucket } from './ohlc';

describe('bucketOHLC', () => {
	test('single bucket: o=first, c=last, h=max, l=min', () => {
		const points: [number, number][] = [
			[3600, 10],
			[3700, 14],
			[3800, 6],
			[3900, 12]
		];
		expect(bucketOHLC(points, 3600)).toEqual([{ t: 3600, o: 10, h: 14, l: 6, c: 12 }]);
	});

	test('splits across multiple buckets, ascending output', () => {
		const points: [number, number][] = [
			[0, 5],
			[1800, 7],
			[3600, 8],
			[5400, 3],
			[7200, 9]
		];
		expect(bucketOHLC(points, 3600)).toEqual([
			{ t: 0, o: 5, h: 7, l: 5, c: 7 },
			{ t: 3600, o: 8, h: 8, l: 3, c: 3 },
			{ t: 7200, o: 9, h: 9, l: 9, c: 9 }
		]);
	});

	test('bucket start aligns to floor(t / bucketSeconds) * bucketSeconds', () => {
		const candles = bucketOHLC([[5000, 1]], 3600);
		expect(candles).toEqual([{ t: 3600, o: 1, h: 1, l: 1, c: 1 }]);
	});

	test('skips empty buckets between populated ones', () => {
		const candles = bucketOHLC(
			[
				[0, 1],
				[10800, 2]
			],
			3600
		);
		expect(candles.map((c) => c.t)).toEqual([0, 10800]);
	});

	test('empty input gives []', () => {
		expect(bucketOHLC([], 3600)).toEqual([]);
	});
});

describe('pickBucket', () => {
	test('≤ 1 day → 5m candles', () => {
		expect(pickBucket(3600)).toBe(300);
		expect(pickBucket(86_400)).toBe(300);
	});

	test('≤ 1 week → 30m candles', () => {
		expect(pickBucket(86_401)).toBe(1800);
		expect(pickBucket(604_800)).toBe(1800);
	});

	test('≤ 30 days → 2h candles', () => {
		expect(pickBucket(604_801)).toBe(7200);
		expect(pickBucket(2_592_000)).toBe(7200);
	});

	test('beyond 30 days → 1D candles', () => {
		expect(pickBucket(2_592_001)).toBe(86_400);
		expect(pickBucket(Infinity)).toBe(86_400);
	});
});
