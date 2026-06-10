<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import QuickStats from '$lib/components/QuickStats.svelte';
	import OrderBookTable from '$lib/components/OrderBookTable.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import StarButton from '$lib/components/StarButton.svelte';
	import DepthChart from '$lib/components/DepthChart.svelte';
	import PriceOverview from '$lib/components/PriceOverview.svelte';
	import { formatPrice } from '$lib/format';
	import { breadcrumbSchema, itemPageSchema } from '$lib/schema';
	import { site } from '$lib/config';
	import { LiveBazaar } from '$lib/hypixel/live.svelte';
	import { toSnapshot } from '$lib/market/aggregate';
	import type { Point } from '$lib/market/chart';

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
	// timestamp must describe whatever snapshot is on screen, even if the
	// latest poll failed and we're still showing the previous successful one
	const updatedAt = $derived(
		live?.product ? (live.lastUpdated ?? data.lastUpdated) : data.lastUpdated
	);

	// chart series extend to the live price so the line ticks in real time
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
			<h1 class="text-2xl font-medium">{data.name}</h1>
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

	<QuickStats qs={snapshot.qs} />

	<DepthChart buy={snapshot.buy} sell={snapshot.sell} />

	<div class="grid gap-8 sm:grid-cols-2">
		<OrderBookTable levels={snapshot.buy} side="buy" />
		<OrderBookTable levels={snapshot.sell} side="sell" />
	</div>
</article>
