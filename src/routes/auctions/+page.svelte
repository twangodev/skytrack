<script lang="ts">
	import { Search } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	let query = $state('');

	const filtered = $derived(
		query.length < 2
			? data.rows
			: data.rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()))
	);
</script>

<SEO
	title="Auction House Prices"
	description={`Lowest and median BIN prices for ${data.rows.length} Hypixel Skyblock auction house items, aggregated from every active buy-it-now listing.`}
	canonical="/auctions"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Auctions', url: `${site.url}/auctions` }
	])}
/>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-medium">Auction House</h1>
			<p class="mt-1 text-sm text-muted">
				{data.rows.length} items with active BINs · <LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<label class="flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-1.5">
			<Search size={14} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
			<input
				type="search"
				placeholder="Filter items…"
				bind:value={query}
				class="w-48 bg-transparent text-sm outline-none placeholder:text-muted"
			/>
		</label>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-subtle text-left text-xs text-muted">
					<th class="py-2 pr-4 font-normal">Item</th>
					<th class="py-2 pr-4 font-normal">Rarity</th>
					<th class="py-2 pr-4 text-right font-normal">Lowest BIN</th>
					<th class="py-2 pr-4 text-right font-normal">Median BIN</th>
					<th class="py-2 pr-4 text-right font-normal">Listings</th>
					<th class="py-2 text-right font-normal">Discount</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as row (row.id)}
					<tr class="border-b border-subtle/60 transition-colors hover:bg-surface">
						<td class="py-1.5 pr-4">
							<a href="/auctions/{row.slug}" class="transition-colors hover:text-accent">
								{row.name}
							</a>
						</td>
						<td class="py-1.5 pr-4"><RarityBadge tier={row.tier} /></td>
						<td class="py-1.5 pr-4 text-right font-mono tabular-nums"
							>{formatPrice(row.lowestBin)}</td
						>
						<td class="py-1.5 pr-4 text-right font-mono text-muted tabular-nums"
							>{formatPrice(row.medianBin)}</td
						>
						<td class="py-1.5 pr-4 text-right font-mono text-muted tabular-nums">{row.count}</td>
						<td
							class="py-1.5 text-right font-mono tabular-nums {row.discount >= 0.2
								? 'text-up'
								: 'text-muted'}"
							title="lowest BIN vs median BIN — large gaps suggest underpriced listings"
							>{(row.discount * 100).toFixed(0) + '%'}</td
						>
					</tr>
				{:else}
					<tr><td colspan="6" class="py-8 text-center text-muted">No items match “{query}”.</td></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
</div>
