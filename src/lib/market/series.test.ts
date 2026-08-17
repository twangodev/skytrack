import { describe, expect, test } from 'vitest';
import { mergedSeries } from './series';

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
