import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLiveBazaar, getLiveBazaarProduct, resetLiveBazaarCache } from './live-market';

const response = () =>
	new Response(
		JSON.stringify({
			success: true,
			lastUpdated: 1_788_296_430_902,
			products: {
				WHEAT: {
					product_id: 'WHEAT',
					buy_summary: [{ amount: 20, pricePerUnit: 11, orders: 2 }],
					sell_summary: [{ amount: 10, pricePerUnit: 10, orders: 1 }],
					quick_status: {
						buyPrice: 10.55,
						sellPrice: 9.45,
						buyVolume: 100,
						sellVolume: 80,
						buyMovingWeek: 1_000,
						sellMovingWeek: 900,
						buyOrders: 12,
						sellOrders: 9
					}
				}
			}
		})
	);

beforeEach(() => resetLiveBazaarCache());

describe('getLiveBazaar', () => {
	test('deduplicates concurrent requests and caches the market briefly', async () => {
		const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
		const [first, second] = await Promise.all([
			getLiveBazaar(fetcher, 1_000),
			getLiveBazaar(fetcher, 1_000)
		]);

		expect(first.lastUpdated).toBe(1_788_296_430_902);
		expect(second).toBe(first);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(await getLiveBazaar(fetcher, Date.now())).toBe(first);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	test('extracts and normalizes one product snapshot', async () => {
		const fetcher = vi.fn(async () => response()) as unknown as typeof fetch;
		const live = await getLiveBazaarProduct(fetcher, 'WHEAT');

		expect(live).toMatchObject({
			updatedAt: 1_788_296_430_902,
			snapshot: {
				qs: { bp: 10.6, sp: 9.5 },
				buy: [[11, 20, 2]],
				sell: [[10, 10, 1]]
			}
		});
		expect(await getLiveBazaarProduct(fetcher, 'MISSING')).toBeNull();
	});
});
