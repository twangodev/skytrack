import { error } from '@sveltejs/kit';
import {
	requireDb,
	getBazaarSnapshot,
	getItems,
	resolveBazaarId,
	bazaarHistory,
	bazaarSeriesSince
} from '$lib/server/db';
import { titleCase, formatPrice, formatCompact } from '$lib/format';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

const DAY = 86_400;

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

export const GET: RequestHandler = async ({ params, platform }) => {
	const db = requireDb(platform);
	const id = await resolveBazaarId(db, params.slug);
	if (!id) error(404, 'Unknown product');
	const now = Math.floor(Date.now() / 1000);
	const [{ lastUpdated, products }, items, rawSeries, history] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db),
		bazaarSeriesSince(db, [id], now - 2 * DAY),
		bazaarHistory(db, id)
	]);
	const snap = products[id];
	const meta = items[id];
	const name = meta?.name ?? titleCase(id);

	// last 24h at hourly sampling keeps the table readable
	const raw = rawSeries.get(id) ?? [];
	const newest = raw[raw.length - 1]?.t ?? 0;
	const recent = raw
		.filter((p) => p.t >= newest - DAY)
		.filter(
			(p, i, list) =>
				i === list.length - 1 || Math.floor(p.t / 3600) !== Math.floor((list[i + 1]?.t ?? 0) / 3600)
		);
	const daily = history.filter((p) => p.t < newest - DAY);

	const body = `# ${name}

Hypixel Skyblock bazaar product \`${id}\`${meta?.tier ? ` (${meta.tier})` : ''}.
Updated ${new Date(lastUpdated).toISOString()}. Prices in Skyblock coins.
Page: ${site.url}/bazaar/${params.slug} | JSON history: ${site.url}/data/items/${params.slug}.json

## Current

| Metric | Buy side | Sell side |
| --- | --- | --- |
| Price (instant) | ${formatPrice(snap.qs.bp)} | ${formatPrice(snap.qs.sp)} |
| Order volume | ${formatCompact(snap.qs.bv)} | ${formatCompact(snap.qs.sv)} |
| Weekly moving volume | ${formatCompact(snap.qs.bmw)} | ${formatCompact(snap.qs.smw)} |
| Open orders | ${snap.qs.bo} | ${snap.qs.so} |

## Last 24 hours (hourly)

| Time (UTC) | Instabuy | Instasell |
| --- | --- | --- |
${recent.map((p) => `| ${iso(p.t)} | ${formatPrice(p.b)} | ${formatPrice(p.s)} |`).join('\n')}

${
	daily.length > 0
		? `## Earlier history (sampled)

| Time (UTC) | Instabuy | Instasell |
| --- | --- | --- |
${daily
	.slice(-30)
	.map((p) => `| ${iso(p.t)} | ${formatPrice(p.b)} | ${formatPrice(p.s)} |`)
	.join('\n')}
`
		: ''
}
Data from the official Hypixel API. Not affiliated with Hypixel Inc.
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=900'
		}
	});
};
