<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import MarketListSearch from '$lib/components/MarketListSearch.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	function pageHref(page: number): string {
		const params = new URLSearchParams();
		if (data.query.length >= 2) params.set('q', data.query);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/auctions?${query}` : '/auctions';
	}
</script>

<SEO
	title="Auction House Prices"
	description={`Lowest and median BIN prices for ${data.itemCount} Hypixel Skyblock auction house items, aggregated from every active buy-it-now listing.`}
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
				{data.itemCount} items with active BINs · <LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<MarketListSearch query={data.query} placeholder="Filter items…" />
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
					<th class="py-2 pr-4 text-right font-normal">Discount</th>
					<th class="py-2 text-right font-normal">7d</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.id)}
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
							class="py-1.5 pr-4 text-right font-mono tabular-nums {row.discount >= 0.2
								? 'text-up'
								: 'text-muted'}"
							title="lowest BIN vs median BIN; large gaps suggest underpriced listings"
							>{(row.discount * 100).toFixed(0) + '%'}</td
						>
						<td class="py-1.5">
							{#if row.spark.length >= 2}
								<div
									class="ml-auto h-8 w-24 {row.spark[row.spark.length - 1] > row.spark[0]
										? 'text-up'
										: 'text-down'}"
								>
									<Sparkline points={row.spark.map((v, i) => [i, v] as [number, number])} />
								</div>
							{/if}
						</td>
					</tr>
				{:else}
					<tr
						><td colspan="7" class="py-8 text-center text-muted">No items match “{data.query}”.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={pageHref} />
</div>
