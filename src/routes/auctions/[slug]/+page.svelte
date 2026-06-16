<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import { TrendingDown } from '@lucide/svelte';
	import StarButton from '$lib/components/StarButton.svelte';
	import PriceOverview from '$lib/components/PriceOverview.svelte';
	import HistorySummary from '$lib/components/HistorySummary.svelte';
	import { formatPrice, formatCompact } from '$lib/format';
	import { breadcrumbSchema, itemPageSchema, priceHistoryDatasetSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	const description = $derived(
		`${data.name} lowest BIN price history on the Hypixel Skyblock auction house: current lowest BIN ` +
			`${formatPrice(data.stats.lowestBin)} coins, median BIN ${formatPrice(data.stats.medianBin)} coins across ${data.stats.count} active listings.`
	);
	const temporalCoverage = $derived(
		data.summary
			? `${new Date(data.summary.firstTracked * 1000).toISOString()}/${new Date(data.summary.lastTracked * 1000).toISOString()}`
			: undefined
	);

	const cells = $derived([
		{ label: 'Median BIN', value: formatPrice(data.stats.medianBin), coins: true },
		{ label: 'Active Listings', value: formatCompact(data.stats.count), coins: false }
	]);

	const discount = $derived(
		data.stats.medianBin > 0
			? (data.stats.medianBin - data.stats.lowestBin) / data.stats.medianBin
			: 0
	);
</script>

<SEO
	title={`${data.name} Auction Price History`}
	{description}
	canonical={`/auctions/${data.slug}`}
	markdown={`/auctions/${data.slug}.md`}
	jsonLd={[
		itemPageSchema({
			name: `${data.name} Hypixel Skyblock Auction Price History`,
			url: `${site.url}/auctions/${data.slug}`,
			description
		}),
		...(data.summary
			? [
					priceHistoryDatasetSchema({
						name: `${data.name} Hypixel Skyblock Auction Price History`,
						url: `${site.url}/auctions/${data.slug}`,
						description,
						dataUrl: `${site.url}/data/items/${data.slug}.json`,
						markdownUrl: `${site.url}/auctions/${data.slug}.md`,
						dateModified: new Date(data.lastUpdated).toISOString(),
						variables: ['lowest BIN price', 'median BIN price', 'active listings'],
						temporalCoverage
					})
				]
			: []),
		breadcrumbSchema([
			{ name: site.title, url: site.url },
			{ name: 'Auctions', url: `${site.url}/auctions` },
			{ name: data.name, url: `${site.url}/auctions/${data.slug}` }
		])
	]}
/>

<article class="flex flex-col gap-6">
	<div>
		<nav class="text-xs text-muted">
			<a href="/auctions" class="transition-colors hover:text-text">Auction House</a>
			<span aria-hidden="true"> / </span>
		</nav>
		<div class="mt-1 flex flex-wrap items-baseline gap-3">
			<h1 class="text-2xl font-medium">{data.name} Auction Price History</h1>
			<RarityBadge tier={data.tier} />
			<StarButton kind="auctions" slug={data.slug} name={data.name} />
		</div>
		<p class="mt-1 text-sm text-muted">
			<LastUpdated at={data.lastUpdated} />
		</p>
	</div>

	<PriceOverview
		current={data.stats.lowestBin}
		slug={data.slug}
		kind="auctions"
		primary={{ label: 'Lowest BIN', points: data.history.map((h) => [h.t, h.l]) }}
		secondary={{ label: 'Median BIN', points: data.history.map((h) => [h.t, h.m]) }}
	/>

	<HistorySummary
		itemName={data.name}
		marketLabel="auction"
		metricLabel="lowest BIN"
		secondaryMetricLabel="median BIN"
		summary={data.summary}
		dataUrl={`/data/items/${data.slug}.json`}
		markdownUrl={`/auctions/${data.slug}.md`}
	/>

	{#if discount >= 0.15}
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-up/40 bg-up/10 px-4 py-3"
		>
			<span class="flex items-center gap-2 text-sm font-medium text-up">
				<TrendingDown size={14} strokeWidth={2} aria-hidden="true" />
				Underpriced listing
			</span>
			<span class="font-mono text-sm text-up tabular-nums">
				lowest BIN {(discount * 100).toFixed(0)}% under median
			</span>
			<span class="text-xs text-muted">
				{formatPrice(data.stats.lowestBin)} vs {formatPrice(data.stats.medianBin)} median across
				{data.stats.count} listings, as of the last refresh
			</span>
		</div>
	{/if}

	<dl
		class="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle sm:grid-cols-2"
	>
		{#each cells as cell (cell.label)}
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">{cell.label}</dt>
				<dd class="font-mono text-sm tabular-nums">
					{cell.value}
					{#if cell.coins}
						<span class="text-xs text-muted">coins</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</article>
