import { describe, expect, test } from 'vitest';
import { downsample, spark7d } from './spark';

const HOUR = 3_600;
const DAY = 86_400;

function series(count: number, start: number, step: number, value: (i: number) => number) {
	return Array.from({ length: count }, (_, i) => [start + i * step, value(i)] as [number, number]);
}

describe('downsample', () => {
	test('returns input untouched at or below target', () => {
		const points = series(24, 0, HOUR, (i) => i);
		expect(downsample(points)).toBe(points);
	});

	test('thins to the target count and keeps both endpoints', () => {
		const points = series(500, 1_700_000_000, HOUR, (i) => i * 10);
		const out = downsample(points);
		expect(out).toHaveLength(24);
		expect(out[0]).toEqual(points[0]);
		expect(out[23]).toEqual(points[499]);
	});

	test('honors a custom target', () => {
		const points = series(100, 0, HOUR, (i) => i);
		const out = downsample(points, 12);
		expect(out).toHaveLength(12);
		expect(out[0]).toEqual(points[0]);
		expect(out[11]).toEqual(points[99]);
	});
});

describe('spark7d', () => {
	test('windows to the trailing 7 days of the newest point', () => {
		const newest = 1_781_000_000;
		const points: [number, number][] = [
			[newest - 8 * DAY, 111], // outside the window, dropped
			[newest - 6 * DAY, 222],
			[newest, 333]
		];
		expect(spark7d(points)).toEqual([222, 333]);
	});

	test('empty for no points', () => {
		expect(spark7d([])).toEqual([]);
	});

	test('empty when fewer than 2 points survive the window', () => {
		const newest = 1_781_000_000;
		expect(spark7d([[newest, 5]])).toEqual([]);
		expect(
			spark7d([
				[newest - 10 * DAY, 1],
				[newest, 5]
			])
		).toEqual([]);
	});

	test('downsamples to 12 values and preserves endpoints', () => {
		const newest = 1_781_000_000;
		const points = series(7 * 24, newest - 7 * DAY + HOUR, HOUR, (i) => i + 1);
		const out = spark7d(points);
		expect(out).toHaveLength(12);
		expect(out[0]).toBe(1);
		expect(out[11]).toBe(7 * 24);
	});

	test('rounds values to 4 significant figures', () => {
		const newest = 1_781_000_000;
		const out = spark7d([
			[newest - DAY, 1_234_567.89],
			[newest, 0.00012345]
		]);
		expect(out).toEqual([1_235_000, 0.0001234]);
	});
});
