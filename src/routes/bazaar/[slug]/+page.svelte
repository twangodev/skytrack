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
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema, itemPageSchema, priceHistoryDatasetSchema } from '$lib/schema';
	import { site } from '$lib/config';
	import { LiveBazaar } from '$lib/hypixel/live.svelte';
	import { toSnapshot } from '$lib/market/aggregate';
	import type { Point } from '$lib/market/chart';

	const { data } = $props();

	let live = $state<LiveBazaar | null>(null);
	$effect(() => {
		const poller = new LiveBazaar(data.id);
		poller.start();
		live = poller;
		return () => poller.stop();
	});

	const isLive = $derived(live !== null && live.product !== null && !live.failed);
	const snapshot = $derived(live?.product ? toSnapshot(live.product) : data.snapshot);
	const updatedAt = $derived(
		live?.product ? (live.lastUpdated ?? data.lastUpdated) : data.lastUpdated
	);

	const instabuy = $derived.by((): Point[] => {
		const points: Point[] = data.history.map((h) => [h.t, h.b]);
		if (live?.product) points.push([Math.floor(updatedAt / 1000), snapshot.qs.bp]);
		return points;
	});
	const instasell = $derived.by((): Point[] => {
		const points: Point[] = data.history.map((h) => [h.t, h.s]);
		if (live?.product) points.push([Math.floor(updatedAt / 1000), snapshot.qs.sp]);
		return points;
	});

	const description = $derived(
		`${data.name} bazaar price history on Hypixel Skyblock: instabuy ${formatPrice(snapshot.qs.bp)} coins, ` +
			`instasell ${formatPrice(snapshot.qs.sp)} coins. Live order book, market depth, and historical price chart.`
	);
	const temporalCoverage = $derived(
		data.summary
			? `${new Date(data.summary.firstTracked * 1000).toISOString()}/${new Date(data.summary.lastTracked * 1000).toISOString()}`
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
		...(data.summary
			? [
					priceHistoryDatasetSchema({
						name: `${data.name} Hypixel Skyblock Bazaar Price History`,
						url: `${site.url}/bazaar/${data.slug}`,
						description,
						dataUrl: `${site.url}/data/items/${data.slug}.json`,
						markdownUrl: `${site.url}/bazaar/${data.slug}.md`,
						dateModified: new Date(data.lastUpdated).toISOString(),
						variables: ['instabuy price', 'instasell price'],
						temporalCoverage
					})
				]
			: []),
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
			<LastUpdated at={updatedAt} live={isLive} />
		</p>
	</div>

	<PriceOverview
		current={snapshot.qs.bp}
		slug={data.slug}
		kind="bazaar"
		primary={{ label: 'Instabuy', points: instabuy }}
		secondary={{ label: 'Instasell', points: instasell }}
	/>

	<HistorySummary
		itemName={data.name}
		marketLabel="bazaar"
		metricLabel="instabuy"
		secondaryMetricLabel="instasell"
		summary={data.summary}
		dataUrl={`/data/items/${data.slug}.json`}
		markdownUrl={`/bazaar/${data.slug}.md`}
	/>

	<FlipCallout qs={snapshot.qs} />

	<QuickStats qs={snapshot.qs} />

	<DepthChart buy={snapshot.buy} sell={snapshot.sell} />

	<div class="grid gap-8 sm:grid-cols-2">
		<OrderBookTable levels={snapshot.buy} side="buy" />
		<OrderBookTable levels={snapshot.sell} side="sell" />
	</div>
</article>
