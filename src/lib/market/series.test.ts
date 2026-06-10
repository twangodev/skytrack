import { describe, expect, test } from 'vitest';
import { itemSeries, mergedSeries } from './series';
import { emptyState } from './state';

const HOUR = 3_600;

describe('itemSeries', () => {
	test('bazaar item mirrors tiers as tuples', () => {
		const state = emptyState();
		const now = 1781000000;
		state.bazaar.raw.set('A', [
			{ t: now - HOUR, b: 2, s: 1 },
			{ t: now, b: 3, s: 1.5 }
		]);
		state.bazaar.hourly.set('A', [{ t: now - 40 * 24 * HOUR, b: 9, s: 8 }]);
		state.bazaar.daily.set('A', [{ t: now - 200 * 24 * HOUR, b: 7, s: 6 }]);

		const out = itemSeries(state, 'A');
		expect(out.bazaar?.raw).toEqual([
			[now - HOUR, 2, 1],
			[now, 3, 1.5]
		]);
		expect(out.bazaar?.hourly).toEqual([[now - 40 * 24 * HOUR, 9, 8]]);
		expect(out.bazaar?.daily).toEqual([[now - 200 * 24 * HOUR, 7, 6]]);
		expect(out.auctions).toBeUndefined();
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
