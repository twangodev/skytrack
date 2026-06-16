<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';
</script>

<SEO
	title="SkyBlock Item Flipping"
	description="Find Hypixel SkyBlock bazaar flipping margins using buy-order, sell-offer, tax, spread, volume, and historical price context."
	canonical="/skyblock/item-flipping"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Item Flipping', url: `${site.url}/skyblock/item-flipping` }
	])}
/>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">SkyBlock Item Flipping</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Skytrack estimates Hypixel SkyBlock bazaar flipping spreads from instasell buy orders,
			instabuy sell offers, bazaar tax, and weekly moving volume. Historical price pages help check
			whether a margin is stable or just a short-lived price move.
		</p>
	</div>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Flipping views</h2>
		<ul class="grid gap-2 text-sm text-muted sm:grid-cols-2">
			<li><a href="/flips" class="hover:text-text">Bazaar flip screener</a></li>
			<li><a href="/bazaar" class="hover:text-text">Bazaar order books</a></li>
			<li><a href="/movers" class="hover:text-text">Fastest moving products</a></li>
			<li><a href="/compare" class="hover:text-text">Compare price histories</a></li>
		</ul>
	</section>
</article>
