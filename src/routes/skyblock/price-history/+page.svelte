<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();
</script>

<SEO
	title="Hypixel SkyBlock Price History"
	description="Track historical Hypixel SkyBlock bazaar and auction house prices, including instabuy, instasell, lowest BIN, median BIN, and downloadable item history."
	canonical="/skyblock/price-history"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'SkyBlock Price History', url: `${site.url}/skyblock/price-history` }
	])}
/>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">Hypixel SkyBlock Price History</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Skytrack records historical Hypixel SkyBlock market prices from the official Hypixel API,
			covering bazaar products and auction house buy-it-now listings. Use it to inspect item price
			charts, current market snapshots, and downloadable history for individual items.
		</p>
	</div>

	<section class="grid gap-4 sm:grid-cols-2">
		<a
			href="/bazaar"
			class="rounded-lg border border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent"
		>
			<h2 class="text-sm font-medium">Bazaar price history</h2>
			<p class="mt-1 text-sm text-muted">
				Instabuy, instasell, order volume, market depth, and historical charts.
			</p>
		</a>
		<a
			href="/auctions"
			class="rounded-lg border border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent"
		>
			<h2 class="text-sm font-medium">Auction price history</h2>
			<p class="mt-1 text-sm text-muted">
				Lowest BIN, median BIN, active listings, and sampled auction history.
			</p>
		</a>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Popular historical searches</h2>
		<ul class="grid gap-2 text-sm text-muted sm:grid-cols-2">
			{#each data.auctionExamples as item (item.slug)}
				<li>
					<a href="/auctions/{item.slug}" class="hover:text-text">{item.name} lowest BIN history</a>
				</li>
			{/each}
			{#each data.bazaarExamples as item (item.slug)}
				<li>
					<a href="/bazaar/{item.slug}" class="hover:text-text">{item.name} bazaar history</a>
				</li>
			{/each}
		</ul>
	</section>

	<p class="text-xs text-muted">
		Data comes from the official Hypixel API and is regenerated on the market data pipeline.
		Skytrack is not affiliated with Hypixel Inc.
	</p>
</article>
