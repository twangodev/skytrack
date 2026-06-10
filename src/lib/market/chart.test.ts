import { describe, expect, test } from 'vitest';
import { cumulative, depthDomain } from './chart';
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
