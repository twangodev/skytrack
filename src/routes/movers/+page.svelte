<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	const WINDOWS = [
		{ key: 'd1', label: '1D' },
		{ key: 'w1', label: '1W' }
	] as const;

	type WindowKey = (typeof WINDOWS)[number]['key'];
	let range = $state<WindowKey>('d1');

	const selected = $derived(data.windows[range]);

	const pct = (change: number) =>
		change > 0 ? `+${(change * 100).toFixed(1)}%` : `−${(Math.abs(change) * 100).toFixed(1)}%`;
</script>

<SEO
	title="Top Movers"
	description="Biggest gainers and losers on the Hypixel Skyblock bazaar over the past day and week — liquid products ranked by price change."
	canonical="/movers"
	jsonLd={breadcrumbSchema([
		{ name: site.title, url: site.url },
		{ name: 'Top Movers', url: `${site.url}/movers` }
	])}
/>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-medium">Top Movers</h1>
			<p class="mt-1 text-sm text-muted">
				<LastUpdated at={data.lastUpdated} />
			</p>
		</div>
		<div class="flex gap-1 font-mono text-xs" role="tablist" aria-label="Change window">
			{#each WINDOWS as w (w.key)}
				<button
					type="button"
					role="tab"
					aria-selected={range === w.key}
					onclick={() => (range = w.key)}
					class="cursor-pointer rounded-md px-2.5 py-1 transition-colors {range === w.key
						? 'bg-surface font-semibold'
						: 'text-muted hover:text-text'}"
				>
					{w.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-8 sm:grid-cols-2">
		{#each [{ heading: 'Gainers', tone: 'text-up', rows: selected.gainers }, { heading: 'Losers', tone: 'text-down', rows: selected.losers }] as section (section.heading)}
			<div class="flex flex-col gap-2">
				<h2 class="text-sm font-medium {section.tone}">{section.heading}</h2>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-subtle text-left text-xs text-muted">
								<th class="py-2 pr-4 font-normal">Item</th>
								<th class="py-2 pr-4 text-right font-normal">Price</th>
								<th class="py-2 text-right font-normal">Change</th>
							</tr>
						</thead>
						<tbody>
							{#each section.rows as row (row.id)}
								<tr class="border-b border-subtle/60 transition-colors hover:bg-surface">
									<td class="py-1.5 pr-4">
										<a href="/bazaar/{row.slug}" class="transition-colors hover:text-accent">
											{row.name}
										</a>
									</td>
									<td class="py-1.5 pr-4 text-right font-mono tabular-nums">
										{formatPrice(row.price)}
									</td>
									<td
										class="py-1.5 text-right font-mono tabular-nums {row.change > 0
											? 'text-up'
											: 'text-down'}"
									>
										{pct(row.change)}
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="3" class="py-8 text-center text-muted">Not enough history yet.</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/each}
	</div>
</div>
