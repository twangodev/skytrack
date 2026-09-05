<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import QuickStats from '$lib/components/QuickStats.svelte';
	import OrderBookTable from '$lib/components/OrderBookTable.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import StarButton from '$lib/components/StarButton.svelte';
	import DepthChart from '$lib/components/DepthChart.svelte';
	import FlipCallout from '$lib/components/FlipCallout.svelte';
	import PriceOverview from '$lib/components/PriceOverview.svelte';
	import HistorySummary from '$lib/components/HistorySummary.svelte';
	import { breadcrumbSchema, itemPageSchema, priceHistoryDatasetSchema } from '$lib/schema';
	import { site } from '$lib/config';
	import { LiveMarket } from '$lib/market/live.svelte';
	import { ItemHistory } from '$lib/market/item-history.svelte';
	import MarketLoading from '$lib/components/MarketLoading.svelte';
	import type { Point } from '$lib/market/chart';

	const { data } = $props();

	let live = $state<LiveMarket | null>(null);
	let history = $state<ItemHistory | null>(null);
	$effect(() => {
		const poller = new LiveMarket(data.slug);
		poller.start();
		live = poller;
		const archive = new ItemHistory(data.slug);
		archive.start();
		history = archive;
		return () => {
			poller.stop();
			archive.stop();
		};
	});

	const liveBazaar = $derived(live?.snapshot?.bazaar ?? null);
	const isLive = $derived(liveBazaar?.live ?? false);
	const snapshot = $derived(liveBazaar?.snapshot ?? null);
	const updatedAt = $derived(liveBazaar?.updatedAt ?? 0);

	const instabuy = $derived.by((): Point[] => {
		const points: Point[] = [];
		if (snapshot) points.push([Math.floor(updatedAt / 1000), snapshot.qs.bp]);
		return points;
	});
	const instasell = $derived.by((): Point[] => {
		const points: Point[] = [];
		if (snapshot) points.push([Math.floor(updatedAt / 1000), snapshot.qs.sp]);
		return points;
	});

	const summary = $derived(history?.series?.bazaar?.summary ?? null);
	const description = $derived(
		`${data.name} bazaar price history on Hypixel Skyblock. Track instabuy and instasell prices, live order books, market depth, and historical prices.`
	);
	const temporalCoverage = $derived(
		summary
			? `${new Date(summary.firstTracked * 1000).toISOString()}/${new Date(summary.lastTracked * 1000).toISOString()}`
			: undefined
	);
</script>

<SEO
	title={`${data.name} Bazaar Price History`}
	{description}
	canonical={`/bazaar/${data.slug}`}
	markdown={`/bazaar/${data.slug}.md`}
	jsonLd={[
		itemPageSchema({
			name: `${data.name} Hypixel Skyblock Bazaar Price History`,
			url: `${site.url}/bazaar/${data.slug}`,
			description
		}),
		priceHistoryDatasetSchema({
			name: `${data.name} Hypixel Skyblock Bazaar Price History`,
			url: `${site.url}/bazaar/${data.slug}`,
			description,
			dataUrl: `${site.url}/data/items/${data.slug}.json`,
			csvUrl: `${site.url}/data/items/${data.slug}.csv`,
			markdownUrl: `${site.url}/bazaar/${data.slug}.md`,
			dateModified: updatedAt ? new Date(updatedAt).toISOString() : undefined,
			variables: ['instabuy price', 'instasell price'],
			temporalCoverage
		}),
		breadcrumbSchema([
			{ name: site.title, url: site.url },
			{ name: 'Bazaar', url: `${site.url}/bazaar` },
			{ name: data.name, url: `${site.url}/bazaar/${data.slug}` }
		])
	]}
/>

<article class="flex flex-col gap-6">
	<div>
		<nav class="text-xs text-muted">
			<a href="/bazaar" class="transition-colors hover:text-text">Bazaar</a>
			<span aria-hidden="true"> / </span>
		</nav>
		<div class="mt-1 flex flex-wrap items-baseline gap-3">
			<h1 class="text-2xl font-medium">{data.name} Bazaar Price History</h1>
			{#if data.tier}
				<RarityBadge tier={data.tier} />
			{/if}
			<StarButton kind="bazaar" slug={data.slug} name={data.name} />
		</div>
		<p class="mt-1 text-sm text-muted">
			{#if snapshot}<LastUpdated at={updatedAt} live={isLive} />{:else}Instabuy, instasell, and
				order book history{/if}
		</p>
	</div>

	{#if snapshot}
		<PriceOverview
			loading={history?.loading ?? true}
			failed={history?.failed ?? false}
			onretry={() => void history?.refresh()}
			series={history?.series ?? null}
			current={snapshot.qs.bp}
			slug={data.slug}
			kind="bazaar"
			primary={{ label: 'Instabuy', points: instabuy }}
			secondary={{ label: 'Instasell', points: instasell }}
		/>
	{:else}
		<MarketLoading
			failed={live?.failed || (live !== null && !live.loading)}
			onretry={() => void live?.refresh()}
		/>
	{/if}

	<HistorySummary
		itemName={data.name}
		marketLabel="bazaar"
		metricLabel="instabuy"
		secondaryMetricLabel="instasell"
		{summary}
		loading={history?.loading ?? true}
		failed={history?.failed ?? false}
		onretry={() => void history?.refresh()}
		dataUrl={`/data/items/${data.slug}.json`}
		csvUrl={`/data/items/${data.slug}.csv`}
		markdownUrl={`/bazaar/${data.slug}.md`}
	/>

	{#if snapshot}
		<FlipCallout qs={snapshot.qs} />

		<QuickStats qs={snapshot.qs} />

		<DepthChart buy={snapshot.buy} sell={snapshot.sell} />

		<div class="grid gap-8 sm:grid-cols-2">
			<OrderBookTable levels={snapshot.buy} side="buy" />
			<OrderBookTable levels={snapshot.sell} side="sell" />
		</div>
	{/if}
</article>
