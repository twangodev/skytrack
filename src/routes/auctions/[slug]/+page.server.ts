import { error } from '@sveltejs/kit';
import { loadAuctions, loadItems, auctionSlugMap, auctionHistory } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	Object.keys(loadAuctions().items).map((id) => ({ slug: slugFromId(id) }));

export const load: PageServerLoad = ({ params }) => {
	const id = auctionSlugMap().get(params.slug);
	if (!id) error(404, 'Unknown item');
	const { lastUpdated, items } = loadAuctions();
	const stats = items[id];
	return {
		slug: params.slug,
		name: stats.name,
		tier: stats.tier,
		stats,
		history: auctionHistory(id),
		lastUpdated
	};
};
