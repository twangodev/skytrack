<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const endpoints = [
		{
			method: 'GET',
			path: '/data/items/{slug}.json',
			example: '/data/items/enchanted-diamond.json',
			text: 'Price history for one item as columnar tiers: raw (15-minute points, trailing 35 days), hourly (4h points, up to two years), daily (forever). Concatenate the tiers and sort by timestamp for a full series. Bazaar tuples are [time, instabuy, instasell]; auction tuples are [time, lowestBin, medianBin, listings].'
		},
		{
			method: 'GET',
			path: '/search-index.json',
			example: '/search-index.json',
			text: 'Directory of every tracked item: slug, display name, and kind (bazaar or auctions).'
		},
		{
			method: 'GET',
			path: '/bazaar/{slug}.md',
			example: '/bazaar/enchanted-diamond.md',
			text: 'Markdown summary of a bazaar product: current order-book stats and recent history tables. Every item page also links its markdown alternate.'
		},
		{
			method: 'GET',
			path: '/auctions/{slug}.md',
			example: '/auctions/hyperion.md',
			text: 'Markdown summary of an auction item: lowest and median BIN, listing count, and sampled history.'
		},
		{
			method: 'GET',
			path: '/llms-full.txt',
			example: '/llms-full.txt',
			text: 'Plain-text directory of every item with current prices, built for language models.'
		},
		{
			method: 'GET',
			path: '/openapi.json',
			example: '/openapi.json',
			text: 'OpenAPI 3.1 description of everything above.'
		}
	];
</script>

<SEO
	title="API"
	description="Free static JSON, markdown, and plain-text endpoints for Hypixel Skyblock market history, described by an OpenAPI 3.1 spec."
	canonical="/docs"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'API', url: `${site.url}/docs` }
	])}
/>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">API</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Everything on this site is also available as data. The endpoints below are static files
			regenerated about every 15 minutes and served from the CDN, so there is no auth and no rate
			limit beyond it. Slugs are the item id lowercased, with underscores as hyphens and colons as
			dots: <code class="rounded bg-surface px-1 py-0.5 font-mono text-xs">ENCHANTED_DIAMOND</code>
			becomes
			<code class="rounded bg-surface px-1 py-0.5 font-mono text-xs">enchanted-diamond</code>.
		</p>
	</div>

	<dl class="flex flex-col gap-6">
		{#each endpoints as endpoint (endpoint.path)}
			<div class="flex flex-col gap-1.5">
				<dt class="font-mono text-sm">
					<span class="text-muted">{endpoint.method}</span>
					<a href={endpoint.example} class="transition-colors hover:text-accent">
						{endpoint.path}
					</a>
				</dt>
				<dd class="text-sm leading-relaxed text-muted">{endpoint.text}</dd>
			</div>
		{/each}
	</dl>

	<p class="text-xs text-muted">
		Data comes exclusively from the official Hypixel API and refreshes on the pipeline cadence:
		bazaar every 15 minutes, auctions about every 3 hours. Not affiliated with Hypixel Inc.
	</p>
</div>
