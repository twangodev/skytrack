import { error } from '@sveltejs/kit';
import { itemSeriesCsv } from '$lib/market/series';
import { requireDb, getItemIdBySlug, itemSeriesJson } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const db = requireDb(platform);
	const id = await getItemIdBySlug(db, params.slug);
	if (!id) error(404, 'Unknown item');
	const series = await itemSeriesJson(db, id);
	if (!series.bazaar && !series.auctions) error(404, 'No history');

	const filename = `${params.slug.replace(/[^a-z0-9._-]+/gi, '-')}-history.csv`;
	return new Response(itemSeriesCsv(series), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'public, max-age=300'
		}
	});
};
