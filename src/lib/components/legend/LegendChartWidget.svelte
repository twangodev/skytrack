<script lang="ts">
	import { CandlestickChart, LineChart, Plus, X } from '@lucide/svelte';
	import LegendChart, { type LegendSeries } from '$lib/components/LegendChart.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import MarketSearch from '$lib/components/MarketSearch.svelte';
	import { legendSeries, withLiveSnapshot } from '$lib/legend/data';
	import type { LegendWidget } from '$lib/legend/layout';
	import {
		loadMarketSeries,
		marketItemKey,
		type MarketItem,
		type PickedMarketItem
	} from '$lib/market/client';
	import { LiveMarket } from '$lib/market/live.svelte';

	interface Props {
		widget: LegendWidget;
		items: MarketItem[];
		onupdate: (patch: Partial<LegendWidget>) => void;
	}

	const { widget, items, onupdate }: Props = $props();

	let loaded = $state<Record<string, LegendSeries | null>>({});
	let live = $state<LiveMarket | null>(null);
	const requested = new Set<string>();

	function request(item: PickedMarketItem) {
		const key = marketItemKey(item);
		if (requested.has(key)) return;
		requested.add(key);
		void loadMarketSeries(item.slug).then((json) => {
			loaded = { ...loaded, [key]: json ? legendSeries(item, json) : null };
		});
	}

	$effect(() => {
		if (widget.item) request(widget.item);
		for (const comparison of widget.comparisons ?? []) request(comparison);
	});

	$effect(() => {
		const item = widget.item;
		if (!item) {
			live = null;
			return;
		}
		const poller = new LiveMarket(item.slug);
		poller.start();
		live = poller;
		return () => poller.stop();
	});

	const storedPrimary = $derived(widget.item ? (loaded[marketItemKey(widget.item)] ?? null) : null);
	const primary = $derived(
		storedPrimary ? withLiveSnapshot(storedPrimary, live?.snapshot ?? null) : null
	);
	const currentSnapshot = $derived.by(() => {
		if (!widget.item || !live?.snapshot) return null;
		return widget.item.kind === 'bazaar' ? live.snapshot.bazaar : live.snapshot.auctions;
	});
	const comparisons = $derived(
		(widget.comparisons ?? [])
			.map((item) => loaded[marketItemKey(item)])
			.filter((series): series is LegendSeries => series !== null && series !== undefined)
	);
	const loading = $derived(
		widget.item !== null && !Object.hasOwn(loaded, marketItemKey(widget.item))
	);
	const style = $derived(widget.style ?? 'line');
	const excluded = $derived(
		new Set([
			...(widget.item ? [marketItemKey(widget.item)] : []),
			...(widget.comparisons ?? []).map(marketItemKey)
		])
	);

	function addComparison(item: PickedMarketItem) {
		const current = widget.comparisons ?? [];
		if (current.length >= 3) return;
		onupdate({ comparisons: [...current, item], style: 'line' });
	}

	function removeComparison(index: number) {
		onupdate({ comparisons: (widget.comparisons ?? []).toSpliced(index, 1) });
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-subtle px-2">
		<button
			type="button"
			onclick={() => onupdate({ style: 'line' })}
			aria-label="Line chart"
			aria-pressed={style === 'line'}
			class="cursor-pointer rounded p-1 text-muted hover:text-text {style === 'line'
				? 'bg-subtle text-text'
				: ''}"
		>
			<LineChart size={12} strokeWidth={1.5} />
		</button>
		<button
			type="button"
			onclick={() => onupdate({ style: 'candles' })}
			disabled={(widget.comparisons?.length ?? 0) > 0}
			aria-label="Candlestick chart"
			aria-pressed={style === 'candles'}
			class="cursor-pointer rounded p-1 text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-30 {style ===
			'candles'
				? 'bg-subtle text-text'
				: ''}"
		>
			<CandlestickChart size={12} strokeWidth={1.5} />
		</button>
		{#if currentSnapshot}
			<span class="shrink-0 text-[8px] text-muted">
				<LastUpdated at={currentSnapshot.updatedAt} live={currentSnapshot.live} />
			</span>
		{/if}
		<div class="group relative ml-auto shrink-0">
			<button
				type="button"
				disabled={(widget.comparisons?.length ?? 0) >= 3}
				class="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[9px] text-muted hover:bg-subtle hover:text-text disabled:opacity-30"
			>
				<Plus size={10} strokeWidth={1.5} /> Compare
			</button>
			<div
				class="invisible absolute top-6 right-0 z-40 w-60 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
			>
				<MarketSearch
					{items}
					{excluded}
					placeholder="Add comparison"
					compact
					disabled={(widget.comparisons?.length ?? 0) >= 3}
					onpick={addComparison}
				/>
			</div>
		</div>
		{#each widget.comparisons ?? [] as comparison, index (marketItemKey(comparison))}
			<span
				class="flex shrink-0 items-center gap-1 rounded border border-subtle px-1.5 py-0.5 text-[8px]"
			>
				<span class="max-w-20 truncate">{comparison.name}</span>
				<button
					type="button"
					onclick={() => removeComparison(index)}
					aria-label="Remove {comparison.name} comparison"
					class="cursor-pointer text-muted hover:text-text"
				>
					<X size={9} strokeWidth={1.5} />
				</button>
			</span>
		{/each}
	</div>
	<div class="min-h-0 flex-1">
		<LegendChart {primary} {comparisons} {style} {loading} />
	</div>
</div>
