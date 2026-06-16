<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();
</script>

<SEO
	title="SkyBlock Bazaar Price History"
	description="Historical Hypixel SkyBlock bazaar prices with instabuy, instasell, order books, market depth, and per-item JSON history."
	canonical="/skyblock/bazaar-price-history"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Bazaar Price History', url: `${site.url}/skyblock/bazaar-price-history` }
	])}
/>

<article class="mx-auto flex w-full max-w-3xl flex-col gap-8">
	<div>
		<h1 class="text-2xl font-medium">SkyBlock Bazaar Price History</h1>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Bazaar item pages track Hypixel SkyBlock instabuy and instasell price history alongside
			current order books, weekly moving volume, market depth, and recent price movement.
		</p>
	</div>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Start with the bazaar directory</h2>
		<p class="text-sm leading-relaxed text-muted">
			The full bazaar directory links to every tracked product page. Each product page includes a
			price chart, 24h and 7d history summary, markdown summary, and downloadable JSON history.
		</p>
		<p><a href="/bazaar" class="text-sm text-accent hover:text-text">Open bazaar prices</a></p>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium">Example bazaar histories</h2>
		<ul class="grid gap-2 text-sm text-muted sm:grid-cols-2">
			{#each data.examples as item (item.slug)}
				<li><a href="/bazaar/{item.slug}" class="hover:text-text">{item.name}</a></li>
			{/each}
		</ul>
	</section>
</article>
