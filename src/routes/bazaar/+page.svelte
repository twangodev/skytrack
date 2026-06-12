<script lang="ts">
	import { Search } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import { formatCompact, formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	let query = $state('');
	let page = $state(1);
	const pageSize = 100;

	const filtered = $derived(
		query.length < 2
			? data.rows
			: data.rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()))
	);
	const paged = $derived(filtered.slice((page - 1) * pageSize, page * pageSize));
</script>

<SEO
	title="Bazaar Prices"
	description={`Live buy and sell prices for all ${data.rows.length} Hypixel Skyblock bazaar products, with order books, market depth, and trade volume.`}
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
				{data.rows.length} products · <LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<label class="flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-1.5">
			<Search size={14} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
			<input
				type="search"
				placeholder="Filter products…"
				value={query}
				oninput={(e) => {
					query = e.currentTarget.value;
					page = 1;
				}}
				class="w-48 bg-transparent text-sm outline-none placeholder:text-muted"
			/>
		</label>
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
				{#each paged as row (row.id)}
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
						><td colspan="7" class="py-8 text-center text-muted">No products match “{query}”.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination bind:page pageSize={100} total={filtered.length} />
</div>
