<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import RarityBadge from '$lib/components/RarityBadge.svelte';
	import HistoryChart from '$lib/components/HistoryChart.svelte';
	import { formatPrice, formatCompact } from '$lib/format';
	import { breadcrumbSchema, itemPageSchema } from '$lib/schema';
	import { site } from '$lib/config';

	const { data } = $props();

	const description = $derived(
		`${data.name} is worth ${formatPrice(data.stats.lowestBin)} coins (lowest BIN) on the Hypixel ` +
			`Skyblock auction house — median BIN ${formatPrice(data.stats.medianBin)} across ${data.stats.count} active listings.`
	);

	const cells = $derived([
		{ label: 'Lowest BIN', value: formatPrice(data.stats.lowestBin), highlight: true },
		{ label: 'Median BIN', value: formatPrice(data.stats.medianBin) },
		{ label: 'Active Listings', value: formatCompact(data.stats.count) }
	]);
</script>

<SEO
	title={`${data.name} — Auction Price`}
	{description}
	canonical={`/auctions/${data.slug}`}
	jsonLd={[
		itemPageSchema({
			name: `${data.name} — Hypixel Skyblock Auction Price`,
			url: `${site.url}/auctions/${data.slug}`,
			description
		}),
		breadcrumbSchema([
			{ name: 'SkyTrack', url: site.url },
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
			<h1 class="text-2xl font-medium">{data.name}</h1>
			<RarityBadge tier={data.tier} />
		</div>
		<p class="mt-1 text-sm text-muted">
			<LastUpdated at={data.lastUpdated} />
		</p>
	</div>

	<dl class="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle sm:grid-cols-3">
		{#each cells as cell (cell.label)}
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">{cell.label}</dt>
				<dd class="font-mono tabular-nums {cell.highlight ? 'text-lg text-accent' : 'text-sm'}">
					{cell.value}
					<span class="text-xs text-muted">coins</span>
				</dd>
			</div>
		{/each}
	</dl>

	<HistoryChart
		title="BIN Price History"
		lines={[
			{
				label: 'Lowest BIN',
				points: data.history.map((h) => [h.t, h.l]),
				colorClass: 'stroke-accent',
				textClass: 'text-accent'
			},
			{
				label: 'Median BIN',
				points: data.history.map((h) => [h.t, h.m]),
				colorClass: 'stroke-muted',
				textClass: 'text-muted'
			}
		]}
	/>
</article>
