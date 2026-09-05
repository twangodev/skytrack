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
	import { LiveMarket } from '$lib/market/live.svelte';
	import { ItemHistory } from '$lib/market/item-history.svelte';
	import MarketLoading from '$lib/components/MarketLoading.svelte';

	const { data } = $props();

	let live = $state<LiveMarket | null>(null);
	let history = $state<ItemHistory | null>(null);
	$effect(() => {
		const poller = new LiveMarket(data.slug);
		const archive = new ItemHistory(data.slug);
		poller.start();
		archive.start();
		live = poller;
		history = archive;
		return () => {
			poller.stop();
			archive.stop();
		};
	});
	const stats = $derived(live?.snapshot?.auctions?.snapshot ?? null);
	const updatedAt = $derived(live?.snapshot?.auctions?.updatedAt ?? 0);
	const summary = $derived(history?.series?.auctions?.summary ?? null);
	const description = $derived(
		`${data.name} lowest BIN price history on the Hypixel Skyblock auction house. Track lowest and median BIN prices, active listings, and historical prices.`
	);
	const temporalCoverage = $derived(
		summary
			? `${new Date(summary.firstTracked * 1000).toISOString()}/${new Date(summary.lastTracked * 1000).toISOString()}`
			: undefined
	);

	const cells = $derived(
		stats
			? [
					{ label: 'Median BIN', value: formatPrice(stats.medianBin), coins: true },
					{ label: 'Active Listings', value: formatCompact(stats.count), coins: false }
				]
			: []
	);

	const discount = $derived(
		stats && stats.medianBin > 0 ? (stats.medianBin - stats.lowestBin) / stats.medianBin : 0
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
		priceHistoryDatasetSchema({
			name: `${data.name} Hypixel Skyblock Auction Price History`,
			url: `${site.url}/auctions/${data.slug}`,
			description,
			dataUrl: `${site.url}/data/items/${data.slug}.json`,
			csvUrl: `${site.url}/data/items/${data.slug}.csv`,
			markdownUrl: `${site.url}/auctions/${data.slug}.md`,
			dateModified: updatedAt ? new Date(updatedAt).toISOString() : undefined,
			variables: ['lowest BIN price', 'median BIN price', 'active listings'],
			temporalCoverage
		}),
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
			{#if stats?.tier ?? data.tier}<RarityBadge tier={(stats?.tier ?? data.tier)!} />{/if}
			<StarButton kind="auctions" slug={data.slug} name={data.name} />
		</div>
		<p class="mt-1 text-sm text-muted">
			{#if stats}<LastUpdated at={updatedAt} />{:else}Lowest BIN, median BIN, and listing history{/if}
		</p>
	</div>

	{#if stats}
		<PriceOverview
			loading={history?.loading ?? true}
			failed={history?.failed ?? false}
			onretry={() => void history?.refresh()}
			series={history?.series ?? null}
			current={stats.lowestBin}
			slug={data.slug}
			kind="auctions"
			primary={{ label: 'Lowest BIN', points: [[Math.floor(updatedAt / 1000), stats.lowestBin]] }}
			secondary={{ label: 'Median BIN', points: [[Math.floor(updatedAt / 1000), stats.medianBin]] }}
		/>
	{:else}
		<MarketLoading
			failed={live?.failed || (live !== null && !live.loading)}
			onretry={() => void live?.refresh()}
		/>
	{/if}

	<HistorySummary
		itemName={data.name}
		marketLabel="auction"
		metricLabel="lowest BIN"
		secondaryMetricLabel="median BIN"
		{summary}
		loading={history?.loading ?? true}
		failed={history?.failed ?? false}
		onretry={() => void history?.refresh()}
		dataUrl={`/data/items/${data.slug}.json`}
		csvUrl={`/data/items/${data.slug}.csv`}
		markdownUrl={`/auctions/${data.slug}.md`}
	/>

	{#if stats}
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
					{formatPrice(stats.lowestBin)} vs {formatPrice(stats.medianBin)} median across
					{stats.count} listings, as of the last refresh
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
	{/if}
</article>
