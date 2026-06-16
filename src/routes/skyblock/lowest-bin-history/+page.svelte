<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';
</script>

<SEO
	title="SkyBlock Lowest BIN History"
	description="Track Hypixel SkyBlock lowest BIN history for auction house items, with median BIN comparison, listing counts, and price charts."
	canonical="/skyblock/lowest-bin-history"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Lowest BIN History', url: `${site.url}/skyblock/lowest-bin-history` }
	])}
/>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">SkyBlock Lowest BIN History</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Skytrack tracks lowest BIN history for Hypixel SkyBlock auction house items and compares it
			with median BIN and active listing counts. Item pages can reveal underpriced listings, price
			spikes, and longer-term auction trends.
		</p>
	</div>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Lowest BIN tools</h2>
		<ul class="grid gap-2 text-sm text-muted sm:grid-cols-2">
			<li><a href="/auctions" class="hover:text-text">All auction lowest BIN prices</a></li>
			<li><a href="/movers" class="hover:text-text">Top market movers</a></li>
			<li><a href="/compare" class="hover:text-text">Compare item price histories</a></li>
			<li><a href="/docs" class="hover:text-text">Download historical data</a></li>
		</ul>
	</section>
</article>
