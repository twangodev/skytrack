<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import QuickStats from '$lib/components/QuickStats.svelte';
	import OrderBookTable from '$lib/components/OrderBookTable.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import DepthChart from '$lib/components/DepthChart.svelte';
	import HistoryChart from '$lib/components/HistoryChart.svelte';
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema, itemPageSchema } from '$lib/schema';
	import { site } from '$lib/config';
	import { LiveBazaar } from '$lib/hypixel/live.svelte';
	import { toSnapshot } from '$lib/market/aggregate';

	const { data } = $props();

	// recreated on navigation between product pages
	let live = $state<LiveBazaar | null>(null);
	$effect(() => {
		const poller = new LiveBazaar(data.id);
		poller.start();
		live = poller;
		return () => poller.stop();
	});

	const isLive = $derived(live !== null && live.product !== null && !live.failed);
	const snapshot = $derived(live?.product ? toSnapshot(live.product) : data.snapshot);
	const updatedAt = $derived(isLive ? (live?.lastUpdated ?? data.lastUpdated) : data.lastUpdated);

	const description = $derived(
		`${data.name} bazaar prices on Hypixel Skyblock: instabuy ${formatPrice(snapshot.qs.bp)} coins, ` +
			`instasell ${formatPrice(snapshot.qs.sp)} coins. Live order book, market depth, and price history.`
	);
</script>

<SEO
	title={`${data.name} — Bazaar Price`}
	{description}
	canonical={`/bazaar/${data.slug}`}
	jsonLd={[
		itemPageSchema({
			name: `${data.name} — Hypixel Skyblock Bazaar Price`,
			url: `${site.url}/bazaar/${data.slug}`,
			description
		}),
		breadcrumbSchema([
			{ name: 'SkyTrack', url: site.url },
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
			<h1 class="text-2xl font-medium">{data.name}</h1>
			{#if data.tier}
				<RarityBadge tier={data.tier} />
			{/if}
		</div>
		<p class="mt-1 text-sm text-muted">
			<LastUpdated at={updatedAt} live={isLive} />
		</p>
	</div>

	<QuickStats qs={snapshot.qs} />

	<DepthChart buy={snapshot.buy} sell={snapshot.sell} />

	<div class="grid gap-8 sm:grid-cols-2">
		<OrderBookTable levels={snapshot.buy} side="buy" />
		<OrderBookTable levels={snapshot.sell} side="sell" />
	</div>

	<HistoryChart
		title="Price History"
		lines={[
			{
				label: 'Instabuy',
				points: data.history.map((h) => [h.t, h.b]),
				colorClass: 'stroke-down',
				textClass: 'text-down'
			},
			{
				label: 'Instasell',
				points: data.history.map((h) => [h.t, h.s]),
				colorClass: 'stroke-up',
				textClass: 'text-up'
			}
		]}
	/>
</article>
