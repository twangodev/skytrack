import { json } from '@sveltejs/kit';
import { site } from '$lib/config';
import { RAW_SLICE } from '$lib/market/series';
import type { RequestHandler } from './$types';

export const prerender = true;

const bazaarTuple = {
	type: 'array',
	prefixItems: [
		{ type: 'integer', description: 'unix timestamp (seconds)' },
		{ type: 'number', description: 'instabuy price (coins)' },
		{ type: 'number', description: 'instasell price (coins)' }
	],
	minItems: 3,
	maxItems: 3
};

const auctionTuple = {
	type: 'array',
	prefixItems: [
		{ type: 'integer', description: 'unix timestamp (seconds)' },
		{ type: 'number', description: 'lowest BIN (coins)' },
		{ type: 'number', description: 'median BIN (coins)' },
		{ type: 'integer', description: 'active listings' }
	],
	minItems: 4,
	maxItems: 4
};

export const GET: RequestHandler = () => {
	const spec = {
		openapi: '3.1.0',
		info: {
			title: `${site.title} API`,
			version: '1.0.0',
			description:
				'Static, CDN-served endpoints for Hypixel Skyblock market history. Everything is regenerated roughly every 15 minutes by the data pipeline; there is no rate limit beyond the CDN. Slugs are the item id lowercased with underscores as hyphens and colons as dots (ENCHANTED_DIAMOND becomes enchanted-diamond). Data comes exclusively from the official Hypixel API. Not affiliated with Hypixel Inc.'
		},
		servers: [{ url: site.url }],
		paths: {
			'/data/items/{slug}.json': {
				get: {
					summary: 'Price history for one item',
					description: `Columnar history tiers, disjoint in time: raw (15-minute bazaar / ~3h auction points, trailing ${RAW_SLICE / 86_400} days), hourly (thinned to 4h points, up to two years), daily (forever). Concatenate tiers and sort by timestamp for a full series.`,
					parameters: [
						{
							name: 'slug',
							in: 'path',
							required: true,
							schema: { type: 'string' },
							example: 'enchanted-diamond'
						}
					],
					responses: {
						'200': {
							description: 'History tiers for the item (bazaar and/or auctions kinds)',
							content: {
								'application/json': {
									schema: {
										type: 'object',
										properties: {
											bazaar: {
												type: 'object',
												properties: {
													raw: { type: 'array', items: bazaarTuple },
													hourly: { type: 'array', items: bazaarTuple },
													daily: { type: 'array', items: bazaarTuple }
												}
											},
											auctions: {
												type: 'object',
												properties: {
													raw: { type: 'array', items: auctionTuple },
													daily: { type: 'array', items: auctionTuple }
												}
											}
										}
									}
								}
							}
						},
						'404': { description: 'Unknown item' }
					}
				}
			},
			'/search-index.json': {
				get: {
					summary: 'Directory of all tracked items',
					responses: {
						'200': {
							description: 'Every tracked item with its slug and kind',
							content: {
								'application/json': {
									schema: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												slug: { type: 'string' },
												name: { type: 'string' },
												kind: { type: 'string', enum: ['bazaar', 'auctions'] }
											},
											required: ['slug', 'name', 'kind']
										}
									}
								}
							}
						}
					}
				}
			},
			'/bazaar/{slug}.md': {
				get: {
					summary: 'Markdown summary of a bazaar product',
					description: 'Current order-book stats plus recent history tables, as text/markdown.',
					parameters: [
						{
							name: 'slug',
							in: 'path',
							required: true,
							schema: { type: 'string' },
							example: 'enchanted-diamond'
						}
					],
					responses: {
						'200': { description: 'Markdown document', content: { 'text/markdown': {} } },
						'404': { description: 'Unknown product' }
					}
				}
			},
			'/auctions/{slug}.md': {
				get: {
					summary: 'Markdown summary of an auction item',
					parameters: [
						{
							name: 'slug',
							in: 'path',
							required: true,
							schema: { type: 'string' },
							example: 'hyperion'
						}
					],
					responses: {
						'200': { description: 'Markdown document', content: { 'text/markdown': {} } },
						'404': { description: 'Unknown item' }
					}
				}
			},
			'/llms-full.txt': {
				get: {
					summary: 'Plain-text directory of every item with current prices',
					responses: {
						'200': { description: 'Plain text', content: { 'text/plain': {} } }
					}
				}
			}
		}
	};

	return json(spec, {
		headers: { 'Cache-Control': 'max-age=0, s-maxage=3600' }
	});
};
