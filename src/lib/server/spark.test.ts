import { describe, expect, test } from 'vitest';
import { downsample } from './spark';

const HOUR = 3_600;

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
