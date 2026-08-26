<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import MarketListSearch from '$lib/components/MarketListSearch.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { formatCompact, formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	type SortKey = 'sp' | 'bp' | 'profit' | 'marginPct' | 'volume' | 'weeklyPotential';

	const columns: { key: SortKey; label: string }[] = [
		{ key: 'sp', label: 'Buy Order' },
		{ key: 'bp', label: 'Sell Offer' },
		{ key: 'profit', label: 'Profit/Item' },
		{ key: 'marginPct', label: 'Margin' },
		{ key: 'volume', label: 'Weekly Volume' },
		{ key: 'weeklyPotential', label: 'Weekly Potential' }
	];

	function listHref(page: number, sortKey: SortKey, sortDir: 'asc' | 'desc'): string {
		const params = new URLSearchParams();
		if (data.query.length >= 2) params.set('q', data.query);
		if (sortKey !== 'weeklyPotential' || sortDir !== 'desc') {
			params.set('sort', sortKey);
			params.set('dir', sortDir);
		}
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return query ? `/flips?${query}` : '/flips';
	}

	function pageHref(page: number): string {
		return listHref(page, data.sortKey, data.sortDir);
	}

	function sortHref(key: SortKey): string {
		const direction = data.sortKey === key && data.sortDir === 'desc' ? 'asc' : 'desc';
		return listHref(1, key, direction);
	}
</script>

<SEO
	title="Bazaar Flips"
	description={`Flipping margins and spreads for ${data.itemCount} profitable Hypixel Skyblock bazaar products: buy-order to sell-offer profit, margin, and weekly volume.`}
	canonical="/flips"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Flips', url: `${site.url}/flips` }
	])}
/>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-medium">Bazaar Flips</h1>
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
					<th class="py-2 pr-4 font-normal">Item</th>
					{#each columns as column (column.key)}
						<th
							class="py-2 text-right font-normal {column.key === 'weeklyPotential' ? '' : 'pr-4'}"
							aria-sort={data.sortKey === column.key
								? data.sortDir === 'asc'
									? 'ascending'
									: 'descending'
								: undefined}
						>
							<a
								href={sortHref(column.key)}
								data-sveltekit-noscroll
								class="transition-colors {data.sortKey === column.key ? 'text-text' : 'text-muted'}"
							>
								{column.label}{data.sortKey === column.key
									? data.sortDir === 'asc'
										? ' ↑'
										: ' ↓'
									: ''}
							</a>
						</th>
					{/each}
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
						<td class="py-1.5 pr-4 text-right font-mono tabular-nums">{formatPrice(row.sp)}</td>
						<td class="py-1.5 pr-4 text-right font-mono tabular-nums">{formatPrice(row.bp)}</td>
						<td class="py-1.5 pr-4 text-right font-mono text-up tabular-nums"
							>{formatPrice(row.profit)}</td
						>
						<td class="py-1.5 pr-4 text-right font-mono text-up tabular-nums"
							>{row.marginPct.toFixed(1)}%</td
						>
						<td class="py-1.5 pr-4 text-right font-mono text-muted tabular-nums"
							>{formatCompact(row.volume)}</td
						>
						<td class="py-1.5 text-right font-mono text-muted tabular-nums"
							>{formatCompact(row.weeklyPotential)}</td
						>
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

	<p class="text-xs text-muted">
		Assumes buy order at instasell +0.1, sell offer at instabuy −0.1, and the 1.25% bazaar tax.
		Margins move fast, so verify in game.
	</p>
</div>
