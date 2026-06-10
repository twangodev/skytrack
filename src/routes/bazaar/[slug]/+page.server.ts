import { error } from '@sveltejs/kit';
import { loadBazaar, loadItems, bazaarSlugMap, bazaarHistory } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () =>
	Object.keys(loadBazaar().products).map((id) => ({ slug: slugFromId(id) }));

export const load: PageServerLoad = ({ params }) => {
	const id = bazaarSlugMap().get(params.slug);
	if (!id) error(404, 'Unknown product');
	const { lastUpdated, products } = loadBazaar();
	const meta = loadItems()[id];
	return {
		id,
		slug: params.slug,
		name: meta?.name ?? titleCase(id),
		tier: meta?.tier,
		snapshot: products[id],
		history: bazaarHistory(id),
		lastUpdated
	};
};
