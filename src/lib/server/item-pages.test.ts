import { beforeEach, expect, test, vi } from 'vitest';
import * as bazaar from '../../routes/bazaar/[slug]/+page.server';
import * as auctions from '../../routes/auctions/[slug]/+page.server';
import { getItemBySlug, getBazaarProduct, getAuctionItem, requireDb } from './db';

vi.mock('./db', () => ({
	requireDb: vi.fn(() => ({})),
	getItemBySlug: vi.fn(),
	getBazaarProduct: vi.fn(),
	getAuctionItem: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

function event(slug: string) {
	return { params: { slug }, setHeaders: vi.fn() } as unknown as Parameters<typeof bazaar.load>[0] &
		Parameters<typeof auctions.load>[0];
}

test('catalog items return only static metadata without touching D1', async () => {
	for (const route of [bazaar, auctions]) {
		const entries = await route.entries();
		expect(entries.length).toBeGreaterThan(2_000);
		const data = await route.load(event(entries[0].slug));
		expect(data).toEqual({
			slug: entries[0].slug,
			name: expect.any(String),
			tier: expect.any(String)
		});
	}
	expect(requireDb).not.toHaveBeenCalled();
});

test('new items get a metadata-only fallback before the next build', async () => {
	vi.mocked(getItemBySlug).mockResolvedValue({ id: 'NEW_ITEM', name: 'New Item' });
	vi.mocked(getBazaarProduct).mockResolvedValue({ snapshot: {}, lastUpdated: 1 } as never);
	vi.mocked(getAuctionItem).mockResolvedValue({ snapshot: {}, lastUpdated: 1 } as never);
	for (const route of [bazaar, auctions]) {
		expect(await route.load(event('new-item'))).toEqual({
			slug: 'new-item',
			name: 'New Item',
			tier: undefined
		});
	}
});

test('unknown items and the wrong market keep their 404 response', async () => {
	vi.mocked(getItemBySlug).mockResolvedValue(undefined);
	await expect(bazaar.load(event('missing-item'))).rejects.toMatchObject({ status: 404 });
	vi.mocked(getItemBySlug).mockResolvedValue({ id: 'NEW_ITEM', name: 'New Item' });
	vi.mocked(getAuctionItem).mockResolvedValue(null);
	await expect(auctions.load(event('new-item'))).rejects.toMatchObject({ status: 404 });
});
