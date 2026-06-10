import { describe, expect, test } from 'vitest';
import { median, aggregateBins, toSnapshot } from './aggregate';

describe('median', () => {
	test('odd', () => expect(median([3, 1, 2])).toBe(2));
	test('even', () => expect(median([1, 2, 3, 4])).toBe(2.5));
	test('empty', () => expect(median([])).toBeNaN());
	test('single', () => expect(median([7])).toBe(7));
});

describe('aggregateBins', () => {
	const bin = (id: string, price: number) => ({ id, price, tier: 'RARE', name: 'X' });

	test('lowest/median/count per item', () => {
		const out = aggregateBins([bin('A', 5), bin('A', 1), bin('A', 3)]);
		expect(out.A).toEqual({ name: 'X', tier: 'RARE', lowestBin: 1, medianBin: 3, count: 3 });
	});

	test('groups by id', () => {
		const out = aggregateBins([bin('A', 5), bin('B', 10)]);
		expect(Object.keys(out).sort()).toEqual(['A', 'B']);
		expect(out.B.lowestBin).toBe(10);
	});

	test('rounds prices to integers', () => {
		const out = aggregateBins([bin('A', 1.6), bin('A', 2.4)]);
		expect(out.A.lowestBin).toBe(2);
		expect(out.A.medianBin).toBe(2);
	});

	test('name selection is order-independent', () => {
		const a = { id: 'A', price: 1, tier: 'RARE', name: 'Zeta Rune' };
		const b = { id: 'A', price: 2, tier: 'RARE', name: 'Alpha Rune' };
		expect(aggregateBins([a, b]).A.name).toBe(aggregateBins([b, a]).A.name);
	});
});

describe('toSnapshot', () => {
	test('caps levels at 15 and maps to tuples', () => {
		const entries = Array.from({ length: 20 }, (_, i) => ({
			pricePerUnit: i + 0.05,
			amount: i,
			orders: 1
		}));
		const snap = toSnapshot({
			product_id: 'X',
			buy_summary: entries,
			sell_summary: entries.slice(0, 2),
			quick_status: {
				buyPrice: 1.23456,
				sellPrice: 1,
				buyVolume: 2,
				sellVolume: 3,
				buyMovingWeek: 4,
				sellMovingWeek: 5,
				buyOrders: 6,
				sellOrders: 7
			}
		});
		expect(snap.buy).toHaveLength(15);
		expect(snap.sell).toHaveLength(2);
		expect(snap.buy[1]).toEqual([1.05, 1, 1]);
		expect(snap.qs.bp).toBe(1.2);
		expect(snap.qs.so).toBe(7);
	});
});
