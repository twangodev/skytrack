import { error } from '@sveltejs/kit';
import {
	loadBazaar,
	loadItems,
	bazaarSlugMap,
	bazaarHistory,
	bazaarSummaryHistory
} from '$lib/server/data';
import { summarizeHistory } from '$lib/market/history-summary';
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
	const history = bazaarHistory(id);
	const summaryHistory = bazaarSummaryHistory(id);
	return {
		id,
		slug: params.slug,
		name: meta?.name ?? titleCase(id),
		tier: meta?.tier,
		snapshot: products[id],
		history,
		summary: summarizeHistory(summaryHistory.map((point) => ({ t: point.t, value: point.b }))),
		lastUpdated
	};
};
