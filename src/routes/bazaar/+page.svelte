<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import MarketListSearch from '$lib/components/MarketListSearch.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { formatCompact, formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	function pageHref(page: number): string {
		const params = new URLSearchParams();
		if (data.query.length >= 2) params.set('q', data.query);
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/bazaar?${query}` : '/bazaar';
	}
</script>

<SEO
	title="Bazaar Prices"
	description={`Live buy and sell prices for all ${data.itemCount} Hypixel Skyblock bazaar products, with order books, market depth, and trade volume.`}
	canonical="/bazaar"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Bazaar', url: `${site.url}/bazaar` }
	])}
/>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-medium">Bazaar</h1>
			<p class="mt-1 text-sm text-muted">
				{data.itemCount} products · <LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<MarketListSearch query={data.query} placeholder="Filter products…" />
	</div>

	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-subtle text-left text-xs text-muted">
					<th class="py-2 pr-4 font-normal">Product</th>
					<th class="py-2 pr-4 text-right font-normal">Buy Price</th>
					<th class="py-2 pr-4 text-right font-normal">Sell Price</th>
					<th class="py-2 pr-4 text-right font-normal">Weekly Buys</th>
					<th class="py-2 pr-4 text-right font-normal">Weekly Sells</th>
					<th class="py-2 pr-4 text-right font-normal">Pressure</th>
					<th class="py-2 text-right font-normal">7d</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.id)}
					<tr class="border-b border-subtle/60 transition-colors hover:bg-surface">
						<td class="py-1.5 pr-4">
							<a href="/bazaar/{row.slug}" class="transition-colors hover:text-accent">
								{row.name}
							</a>
						</td>
						<td class="py-1.5 pr-4 text-right font-mono tabular-nums">{formatPrice(row.bp)}</td>
						<td class="py-1.5 pr-4 text-right font-mono tabular-nums">{formatPrice(row.sp)}</td>
						<td class="py-1.5 pr-4 text-right font-mono text-muted tabular-nums"
							>{formatCompact(row.bmw)}</td
						>
						<td class="py-1.5 pr-4 text-right font-mono text-muted tabular-nums"
							>{formatCompact(row.smw)}</td
						>
						<td
							class="py-1.5 pr-4 text-right font-mono tabular-nums {row.demandShare > 0.55
								? 'text-up'
								: row.demandShare < 0.45
									? 'text-down'
									: 'text-muted'}"
							title="share of order-book volume on the demand side"
							>{Math.round(row.demandShare * 100) + '%'}</td
						>
						<td class="py-1.5">
							{#if row.spark.length > 0}
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
						><td colspan="7" class="py-8 text-center text-muted"
							>No products match “{data.query}”.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={pageHref} />
</div>
