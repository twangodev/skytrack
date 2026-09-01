import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	clearMarketSnapshotCache,
	loadMarketSnapshot,
	marketItemKey,
	searchMarketItems,
	type MarketItem
} from './client';

const items: MarketItem[] = [
	{
		slug: 'enchanted-diamond',
		name: 'Enchanted Diamond',
		kind: 'bazaar',
		aliases: ['e diamond'],
		lower: 'enchanted diamond e diamond'
	},
	{
		slug: 'diamond-spreading',
		name: 'Diamond Spreading',
		kind: 'auctions',
		lower: 'diamond spreading'
	},
	{
		slug: 'perfect-armor',
		name: 'Perfect Armor',
		kind: 'auctions',
		aliases: ['diamond armor'],
		lower: 'perfect armor diamond armor'
	}
];

describe('searchMarketItems', () => {
	test('ranks a name prefix ahead of word and alias matches', () => {
		expect(searchMarketItems(items, 'diamond').map((item) => item.name)).toEqual([
			'Diamond Spreading',
			'Enchanted Diamond',
			'Perfect Armor'
		]);
	});

	test('excludes selected market identities', () => {
		const excluded = new Set([marketItemKey(items[1])]);
		expect(searchMarketItems(items, 'diamond', excluded).map((item) => item.name)).toEqual([
			'Enchanted Diamond',
			'Perfect Armor'
		]);
	});

	test('requires two non-whitespace characters', () => {
		expect(searchMarketItems(items, ' d ')).toEqual([]);
	});
});

describe('loadMarketSnapshot', () => {
	afterEach(() => {
		clearMarketSnapshotCache();
		vi.unstubAllGlobals();
	});

	test('deduplicates quote requests within the client freshness window', async () => {
		const response = {
			name: 'Wheat',
			bazaar: { updatedAt: 200_000, live: true, snapshot: {} }
		};
		const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
		vi.stubGlobal('fetch', fetcher);

		expect(await loadMarketSnapshot('wheat')).toEqual(response);
		expect(await loadMarketSnapshot('wheat')).toEqual(response);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
