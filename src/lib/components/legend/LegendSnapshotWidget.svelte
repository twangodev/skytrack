<script lang="ts">
	import { formatCompact, formatPrice } from '$lib/format';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import { clipPoints, seriesStats } from '$lib/market/chart';
	import { legendSeries, primaryMetric, secondaryMetric } from '$lib/legend/data';
	import type { LegendWidget } from '$lib/legend/layout';
	import { loadMarketSeries } from '$lib/market/client';
	import { LiveMarket } from '$lib/market/live.svelte';

	interface Props {
		widget: LegendWidget;
	}

	const { widget }: Props = $props();
	let series = $state<ReturnType<typeof legendSeries> | null>(null);
	let market = $state<LiveMarket | null>(null);
	let seriesLoading = $state(false);

	$effect(() => {
		const item = widget.item;
		series = null;
		if (!item) return;
		seriesLoading = true;
		void loadMarketSeries(item.slug).then((json) => {
			if (widget.item?.slug !== item.slug || widget.item.kind !== item.kind) return;
			series = json ? legendSeries(item, json) : null;
			seriesLoading = false;
		});
	});

	$effect(() => {
		const item = widget.item;
		if (!item) {
			market = null;
			return;
		}
		const poller = new LiveMarket(item.slug);
		poller.start();
		market = poller;
		return () => poller.stop();
	});

	const snapshot = $derived(market?.snapshot ?? null);
	const loading = $derived(seriesLoading || (market?.loading ?? false));
	const currentSnapshot = $derived.by(() => {
		if (!widget.item || !snapshot) return null;
		return widget.item.kind === 'bazaar' ? snapshot.bazaar : snapshot.auctions;
	});

	const recent = $derived(series ? clipPoints(series.points, 86_400) : []);
	const stats = $derived(seriesStats(recent.length >= 2 ? recent : (series?.points ?? [])));
	const secondary = $derived(seriesStats(series?.secondary?.points ?? []));
	const current = $derived.by(() => {
		if (!widget.item) return null;
		if (widget.item.kind === 'bazaar')
			return snapshot?.bazaar?.snapshot.qs.bp ?? stats?.current ?? null;
		return snapshot?.auctions?.snapshot.lowestBin ?? stats?.current ?? null;
	});
	const positive = $derived((stats?.change ?? 0) >= 0);
	const spread = $derived.by(() => {
		if (!snapshot?.bazaar) return null;
		const { bp, sp } = snapshot.bazaar.snapshot.qs;
		return bp - sp;
	});
</script>

{#if !widget.item}
	<div class="grid h-full place-items-center p-4 text-center text-[10px] text-muted">
		Choose an item.
	</div>
{:else if loading}
	<div class="grid h-full place-items-center text-[10px] text-muted">Loading snapshot…</div>
{:else}
	<div class="h-full overflow-y-auto p-3">
		<p class="font-mono text-xl tabular-nums">
			{current === null ? '—' : formatPrice(current)}
			<span class="text-[9px] text-muted">coins</span>
		</p>
		{#if currentSnapshot}
			<p class="mt-1 text-[9px] text-muted">
				<LastUpdated at={currentSnapshot.updatedAt} live={currentSnapshot.live} />
			</p>
		{/if}
		{#if stats}
			<p class="mt-1 font-mono text-[10px] tabular-nums {positive ? 'text-up' : 'text-down'}">
				{stats.change >= 0 ? '+' : '−'}{formatPrice(Math.abs(stats.change))}
				({stats.changePct >= 0 ? '+' : ''}{stats.changePct.toFixed(2)}%)
				<span class="font-sans text-muted">24h</span>
			</p>
		{/if}
		<dl class="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-subtle bg-subtle">
			<div class="bg-bg p-2">
				<dt class="text-[9px] text-muted">24h high</dt>
				<dd class="mt-1 font-mono text-[10px]">{stats ? formatPrice(stats.high) : '—'}</dd>
			</div>
			<div class="bg-bg p-2">
				<dt class="text-[9px] text-muted">24h low</dt>
				<dd class="mt-1 font-mono text-[10px]">{stats ? formatPrice(stats.low) : '—'}</dd>
			</div>
			<div class="bg-bg p-2">
				<dt class="text-[9px] text-muted">{primaryMetric(widget.item)}</dt>
				<dd class="mt-1 font-mono text-[10px]">{current === null ? '—' : formatPrice(current)}</dd>
			</div>
			<div class="bg-bg p-2">
				<dt class="text-[9px] text-muted">{secondaryMetric(widget.item)}</dt>
				<dd class="mt-1 font-mono text-[10px]">
					{secondary ? formatPrice(secondary.current) : '—'}
				</dd>
			</div>
			{#if snapshot?.bazaar}
				<div class="bg-bg p-2">
					<dt class="text-[9px] text-muted">Spread</dt>
					<dd class="mt-1 font-mono text-[10px]">{spread === null ? '—' : formatPrice(spread)}</dd>
				</div>
				<div class="bg-bg p-2">
					<dt class="text-[9px] text-muted">Weekly volume</dt>
					<dd class="mt-1 font-mono text-[10px]">
						{formatCompact(snapshot.bazaar.snapshot.qs.bmw)}
					</dd>
				</div>
			{:else if snapshot?.auctions}
				<div class="bg-bg p-2">
					<dt class="text-[9px] text-muted">Median BIN</dt>
					<dd class="mt-1 font-mono text-[10px]">
						{formatPrice(snapshot.auctions.snapshot.medianBin)}
					</dd>
				</div>
				<div class="bg-bg p-2">
					<dt class="text-[9px] text-muted">Listings</dt>
					<dd class="mt-1 font-mono text-[10px]">
						{formatCompact(snapshot.auctions.snapshot.count)}
					</dd>
				</div>
			{/if}
		</dl>
	</div>
{/if}
