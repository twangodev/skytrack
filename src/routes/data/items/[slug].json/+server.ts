import { error, json } from '@sveltejs/kit';
import { requireDb, getItemIdBySlug, itemSeriesJson } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const db = requireDb(platform);
	const id = await getItemIdBySlug(db, params.slug);
	if (!id) error(404, 'Unknown item');
	const series = await itemSeriesJson(db, id);
	if (!series.bazaar && !series.auctions) error(404, 'No history');
	setHeaders({ 'cache-control': 'public, max-age=300' });
	return json(series);
};
