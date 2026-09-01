import { describe, expect, test } from 'vitest';
import { itemSeriesCsv, mergedSeries } from './series';

describe('itemSeriesCsv', () => {
	test('flattens both markets and tiers into chronological rows', () => {
		expect(
			itemSeriesCsv({
				bazaar: {
					raw: [[300, 3, 2.5]],
					hourly: [[200, 2, 1.5]],
					daily: [[100, 1, 0.5]]
				},
				auctions: {
					raw: [[250, 10, 20, 5]],
					daily: [[50, 1, 2, 3]]
				}
			})
		).toBe(
			[
				'timestamp,datetime,market,tier,buy,sell,lowest_bin,median_bin,listings',
				'50,1970-01-01T00:00:50.000Z,auctions,daily,,,1,2,3',
				'100,1970-01-01T00:01:40.000Z,bazaar,daily,1,0.5,,,',
				'200,1970-01-01T00:03:20.000Z,bazaar,hourly,2,1.5,,,',
				'250,1970-01-01T00:04:10.000Z,auctions,raw,,,10,20,5',
				'300,1970-01-01T00:05:00.000Z,bazaar,raw,3,2.5,,,',
				''
			].join('\r\n')
		);
	});

	test('returns the header for an empty series', () => {
		expect(itemSeriesCsv({})).toBe(
			'timestamp,datetime,market,tier,buy,sell,lowest_bin,median_bin,listings\r\n'
		);
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
