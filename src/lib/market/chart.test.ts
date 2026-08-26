import { describe, expect, test } from 'vitest';
import {
	clampDomain,
	clipPoints,
	cumulative,
	depthDomain,
	normalizePoints,
	panDomain,
	seriesStats,
	zoomDomain
} from './chart';
import type { Level } from './aggregate';

describe('cumulative', () => {
	test('sums amounts in order', () => {
		const levels: Level[] = [
			[10, 5, 1],
			[11, 3, 1],
			[12, 2, 1]
		];
		expect(cumulative(levels)).toEqual([
			[10, 5],
			[11, 8],
			[12, 10]
		]);
	});
	test('empty', () => expect(cumulative([])).toEqual([]));
});

describe('depthDomain', () => {
	test('spans both books around the mid', () => {
		const buy: Level[] = [
			[100, 1, 1],
			[110, 1, 1]
		];
		const sell: Level[] = [
			[95, 1, 1],
			[90, 1, 1]
		];
		const [lo, hi] = depthDomain(buy, sell);
		expect(lo).toBeLessThanOrEqual(90);
		expect(hi).toBeGreaterThanOrEqual(110);
	});
	test('one-sided book still produces a range', () => {
		const [lo, hi] = depthDomain([[100, 1, 1]], []);
		expect(hi).toBeGreaterThan(lo);
	});
	test('empty books give a safe default', () => {
		expect(depthDomain([], [])).toEqual([0, 1]);
	});
});

describe('clipPoints', () => {
	test('keeps points inside a fixed trailing window', () => {
		expect(
			clipPoints(
				[
					[100, 1],
					[150, 2],
					[200, 3]
				],
				60,
				200
			)
		).toEqual([
			[150, 2],
			[200, 3]
		]);
	});

	test('returns the original all-time series', () => {
		const points: [number, number][] = [[100, 1]];
		expect(clipPoints(points, Infinity)).toBe(points);
	});
});

describe('normalizePoints', () => {
	test('normalizes against the first visible value', () => {
		expect(
			normalizePoints([
				[100, 50],
				[200, 75],
				[300, 25]
			])
		).toEqual([
			[100, 0],
			[200, 50],
			[300, -50]
		]);
	});

	test('rejects a non-positive baseline', () => {
		expect(
			normalizePoints([
				[100, 0],
				[200, 1]
			])
		).toEqual([]);
	});
});

describe('seriesStats', () => {
	test('summarizes the visible price series', () => {
		expect(
			seriesStats([
				[100, 10],
				[200, 14],
				[300, 12]
			])
		).toEqual({
			open: 10,
			current: 12,
			low: 10,
			high: 14,
			average: 12,
			change: 2,
			changePct: 20
		});
	});

	test('returns null for an empty series', () => {
		expect(seriesStats([])).toBeNull();
	});
});

describe('axis navigation', () => {
	test('zooms around the pointer anchor', () => {
		expect(zoomDomain([0, 100], 25, 0.5)).toEqual([12.5, 62.5]);
		expect(zoomDomain([0, 100], 25, 10, 20, 200)).toEqual([-25, 175]);
	});

	test('pans a domain by an exact amount', () => {
		expect(panDomain([10, 20], -3)).toEqual([7, 17]);
	});

	test('keeps a viewport inside the available data', () => {
		expect(clampDomain([-5, 45], [0, 100])).toEqual([0, 50]);
		expect(clampDomain([70, 120], [0, 100])).toEqual([50, 100]);
		expect(clampDomain([20, 120], [0, 100])).toEqual([0, 100]);
	});
});
