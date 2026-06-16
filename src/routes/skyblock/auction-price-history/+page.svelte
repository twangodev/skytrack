<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();
</script>

<SEO
	title="SkyBlock Auction Price History"
	description="Historical Hypixel SkyBlock auction house prices with lowest BIN, median BIN, active listings, and per-item auction history."
	canonical="/skyblock/auction-price-history"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Auction Price History', url: `${site.url}/skyblock/auction-price-history` }
	])}
/>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">SkyBlock Auction Price History</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Auction item pages track Hypixel SkyBlock buy-it-now prices from active listings, including
			lowest BIN, median BIN, listing count, historical charts, and downloadable item history.
		</p>
	</div>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Browse auction house history</h2>
		<p class="text-sm leading-relaxed text-muted">
			The auction directory ranks tracked items by active BIN count and links to individual price
			history pages for weapons, armor, pets, books, accessories, and other market items.
		</p>
		<p><a href="/auctions" class="text-sm text-accent hover:text-text">Open auction prices</a></p>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Example auction histories</h2>
		<ul class="grid gap-2 text-sm text-muted sm:grid-cols-2">
			{#each data.examples as item (item.slug)}
				<li><a href="/auctions/{item.slug}" class="hover:text-text">{item.name}</a></li>
			{/each}
		</ul>
	</section>
</article>
