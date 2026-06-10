import { describe, expect, test } from 'vitest';
import { bazaarResponse, auctionsPage, itemsResponse } from './types';

const product = {
	product_id: 'ENCHANTED_DIAMOND',
	buy_summary: [{ amount: 10, pricePerUnit: 100.5, orders: 2 }],
	sell_summary: [{ amount: 5, pricePerUnit: 99.1, orders: 1 }],
	quick_status: {
		buyPrice: 100.5,
		sellPrice: 99.1,
		buyVolume: 1000,
		sellVolume: 900,
		buyMovingWeek: 50000,
		sellMovingWeek: 45000,
		buyOrders: 12,
		sellOrders: 9
	}
};

describe('bazaarResponse', () => {
	test('parses a valid payload', () => {
		const parsed = bazaarResponse.parse({
			success: true,
			lastUpdated: 1781089493556,
			products: { ENCHANTED_DIAMOND: product }
		});
		expect(parsed.products.ENCHANTED_DIAMOND.quick_status.buyPrice).toBe(100.5);
	});

	test('rejects a product missing quick_status', () => {
		const { quick_status: _qs, ...broken } = product;
		expect(() =>
			bazaarResponse.parse({ success: true, lastUpdated: 0, products: { X: broken } })
		).toThrow();
	});
});

describe('auctionsPage', () => {
	test('parses and tolerates extra fields', () => {
		const parsed = auctionsPage.parse({
			success: true,
			page: 0,
			totalPages: 42,
			lastUpdated: 1781089492246,
			extra_field: 'ignored',
			auctions: [
				{
					uuid: 'abc',
					item_name: 'Aspect of the End',
					tier: 'RARE',
					starting_bid: 100000,
					item_bytes: 'H4sIA...',
					bin: true,
					auctioneer: 'someone'
				}
			]
		});
		expect(parsed.auctions[0].bin).toBe(true);
	});
});

describe('itemsResponse', () => {
	test('parses resource items', () => {
		const parsed = itemsResponse.parse({
			success: true,
			lastUpdated: 0,
			items: [{ id: 'ASPECT_OF_THE_END', name: 'Aspect of the End', tier: 'RARE', material: 'SWORD' }]
		});
		expect(parsed.items[0].name).toBe('Aspect of the End');
	});
});
