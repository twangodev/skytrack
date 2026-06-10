import { describe, expect, test } from 'vitest';
import { itemSeries, mergedSeries, RAW_SLICE } from './series';
import { emptyState } from './state';

const HOUR = 3_600;
const DAY = 86_400;

describe('itemSeries', () => {
	test('bazaar raw is sliced to the trailing window', () => {
		const state = emptyState();
		const now = 1781000000;
		state.bazaar.raw.set('A', [
			{ t: now - RAW_SLICE - HOUR, b: 1, s: 0.5 }, // outside the slice
			{ t: now - HOUR, b: 2, s: 1 },
			{ t: now, b: 3, s: 1.5 }
		]);
		const out = itemSeries(state, 'A');
		expect(out.bazaar?.raw).toEqual([
			[now - HOUR, 2, 1],
			[now, 3, 1.5]
		]);
	});

	test('bazaar hourly is thinned to 4h points', () => {
		const state = emptyState();
		const aligned = Math.floor(1781000000 / (4 * HOUR)) * 4 * HOUR;
		state.bazaar.hourly.set('A', [
			{ t: aligned, b: 1, s: 0.5 }, // on the 4h grid, kept
			{ t: aligned + HOUR, b: 2, s: 1 }, // off-grid, dropped
			{ t: aligned + 4 * HOUR, b: 3, s: 1.5 } // on the grid, kept
		]);
		const out = itemSeries(state, 'A');
		expect(out.bazaar?.hourly).toEqual([
			[aligned, 1, 0.5],
			[aligned + 4 * HOUR, 3, 1.5]
		]);
	});

	test('daily passes through untouched', () => {
		const state = emptyState();
		state.bazaar.daily.set('A', [{ t: 1700000000 - 200 * DAY, b: 7, s: 6 }]);
		expect(itemSeries(state, 'A').bazaar?.daily).toEqual([[1700000000 - 200 * DAY, 7, 6]]);
	});

	test('auction item: raw and daily tuples include count', () => {
		const state = emptyState();
		state.auctions.raw.set('H', [{ t: 100, l: 530_000_000, m: 1_000_000_000, c: 32 }]);
		state.auctions.daily.set('H', [{ t: 50, l: 1, m: 2, c: 3 }]);
		const out = itemSeries(state, 'H');
		expect(out.auctions?.raw).toEqual([[100, 530_000_000, 1_000_000_000, 32]]);
		expect(out.auctions?.daily).toEqual([[50, 1, 2, 3]]);
		expect(out.bazaar).toBeUndefined();
	});

	test('unknown item gives empty object', () => {
		expect(itemSeries(emptyState(), 'NOPE')).toEqual({});
	});
});

describe('mergedSeries', () => {
	test('concats bazaar tiers ascending', () => {
		expect(
			mergedSeries(
				{
					bazaar: {
						raw: [[300, 3, 2.5]],
						hourly: [[200, 2, 1.5]],
						daily: [[100, 1, 0.5]]
					}
				},
				'bazaar'
			)
		).toEqual([
			[100, 1, 0.5],
			[200, 2, 1.5],
			[300, 3, 2.5]
		]);
	});

	test('auction merge drops count and uses lowest/median', () => {
		expect(
			mergedSeries({ auctions: { raw: [[200, 10, 20, 5]], daily: [[100, 1, 2, 3]] } }, 'auctions')
		).toEqual([
			[100, 1, 2],
			[200, 10, 20]
		]);
	});

	test('missing kind gives empty', () => {
		expect(mergedSeries({}, 'bazaar')).toEqual([]);
	});
});
