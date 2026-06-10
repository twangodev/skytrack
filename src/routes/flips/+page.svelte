<script lang="ts">
	import { Search } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
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

	let query = $state('');
	let sortKey = $state<SortKey>('weeklyPotential');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function sortBy(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		} else {
			sortKey = key;
			sortDir = 'desc';
		}
	}

	const filtered = $derived(
		query.length < 2
			? data.rows
			: data.rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()))
	);

	const sorted = $derived(
		[...filtered].sort((a, b) =>
			sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
		)
	);
</script>

<SEO
	title="Bazaar Flips"
	description={`Flipping margins and spreads for ${data.rows.length} profitable Hypixel Skyblock bazaar products — buy-order to sell-offer profit, margin, and weekly volume.`}
	canonical="/flips"
	jsonLd={breadcrumbSchema([
		{ name: 'SkyTrack', url: site.url },
		{ name: 'Flips', url: `${site.url}/flips` }
	])}
/>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-medium">Bazaar Flips</h1>
			<p class="mt-1 text-sm text-muted">
				{data.rows.length} products · <LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<label class="flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-1.5">
			<Search size={14} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
			<input
				type="search"
				placeholder="Filter products…"
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
					{#each columns as column (column.key)}
						<th
							class="py-2 text-right font-normal {column.key === 'weeklyPotential' ? '' : 'pr-4'}"
						>
							<button
								type="button"
								onclick={() => sortBy(column.key)}
								class="transition-colors {sortKey === column.key ? 'text-text' : 'text-muted'}"
							>
								{column.label}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sorted as row (row.id)}
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
						><td colspan="7" class="py-8 text-center text-muted">No products match “{query}”.</td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="text-xs text-muted">
		Assumes buy order at instasell +0.1, sell offer at instabuy −0.1, and the 1.25% bazaar tax.
		Margins move fast — verify in game.
	</p>
</div>
