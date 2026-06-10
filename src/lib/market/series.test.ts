import { describe, expect, test } from 'vitest';
import { itemSeries, INTRADAY_WINDOW } from './series';
import { emptyState } from './state';

const HOUR = 3_600;

describe('itemSeries', () => {
	test('bazaar item: intraday slices trailing window of raw, tiers sorted', () => {
		const state = emptyState();
		const now = 1781000000;
		state.bazaar.raw.set('A', [
			{ t: now - INTRADAY_WINDOW - HOUR, b: 1, s: 0.5 }, // outside intraday
			{ t: now - HOUR, b: 2, s: 1 },
			{ t: now, b: 3, s: 1.5 }
		]);
		state.bazaar.hourly.set('A', [{ t: now - 10 * HOUR, b: 9, s: 8 }]);
		state.bazaar.daily.set('A', [{ t: now - 100 * 24 * HOUR, b: 7, s: 6 }]);

		const out = itemSeries(state, 'A');
		expect(out.bazaar?.intraday).toEqual([
			[now - HOUR, 2, 1],
			[now, 3, 1.5]
		]);
		expect(out.bazaar?.hourly).toEqual([[now - 10 * HOUR, 9, 8]]);
		expect(out.bazaar?.daily).toEqual([[now - 100 * 24 * HOUR, 7, 6]]);
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
