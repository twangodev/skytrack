import { describe, expect, test } from 'vitest';
import { cumulative, depthDomain, scale, stepPath, linePath, niceTicks } from './chart';
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
});

describe('scale', () => {
	test('maps domain to range', () => {
		expect(scale(5, [0, 10], [0, 100])).toBe(50);
		expect(scale(0, [0, 10], [100, 0])).toBe(100);
	});
	test('degenerate domain centers', () => {
		expect(scale(5, [5, 5], [0, 100])).toBe(50);
	});
});

describe('paths', () => {
	test('stepPath emits H/V steps', () => {
		const d = stepPath(
			[
				[0, 0],
				[10, 5]
			],
			[0, 10],
			[0, 5],
			100,
			50
		);
		expect(d.startsWith('M')).toBe(true);
		expect(d).toContain('H');
		expect(d).toContain('V');
	});
	test('linePath connects points', () => {
		const d = linePath(
			[
				[0, 0],
				[10, 10]
			],
			[0, 10],
			[0, 10],
			100,
			100
		);
		expect(d).toBe('M0,100L100,0');
	});
	test('empty points give empty path', () => {
		expect(linePath([], [0, 1], [0, 1], 10, 10)).toBe('');
	});
});

describe('niceTicks', () => {
	test('produces round values within range', () => {
		const ticks = niceTicks(0, 1234, 4);
		expect(ticks.length).toBeGreaterThanOrEqual(3);
		for (const t of ticks) {
			expect(t).toBeGreaterThanOrEqual(0);
			expect(t).toBeLessThanOrEqual(1234);
		}
	});

	test('no duplicate ticks on sub-cent domains', () => {
		const ticks = niceTicks(0.092, 0.108, 4);
		expect(new Set(ticks).size).toBe(ticks.length);
		expect(ticks.length).toBeGreaterThanOrEqual(2);
	});

	test('no duplicates on tiny domains', () => {
		const ticks = niceTicks(0.001, 0.0015, 4);
		expect(new Set(ticks).size).toBe(ticks.length);
	});
});

describe('logDepth', () => {
	test('zero maps to zero', async () => {
		const { logDepth } = await import('./chart');
		expect(logDepth(0)).toBe(0);
		expect(logDepth(9)).toBe(1);
	});
	test('logPoints transforms y only', async () => {
		const { logPoints } = await import('./chart');
		expect(logPoints([[5, 99]])).toEqual([[5, 2]]);
	});
});
