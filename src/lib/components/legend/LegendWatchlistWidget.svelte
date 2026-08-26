<script lang="ts">
	import { X } from '@lucide/svelte';
	import MarketSearch from '$lib/components/MarketSearch.svelte';
	import { formatPrice } from '$lib/format';
	import { clipPoints, seriesStats } from '$lib/market/chart';
	import { legendSeries } from '$lib/legend/data';
	import {
		loadMarketSeries,
		marketItemKey,
		type MarketItem,
		type PickedMarketItem
	} from '$lib/market/client';
	import { watchlist } from '$lib/watchlist.svelte';

	interface Props {
		items: MarketItem[];
		active: PickedMarketItem | null;
		onselect: (item: PickedMarketItem) => void;
	}

	const { items, active, onselect }: Props = $props();
	let stats = $state<Record<string, ReturnType<typeof seriesStats>>>({});
	const requested = new Set<string>();

	const visible = $derived.by(() => {
		const result: PickedMarketItem[] = [];
		for (const item of [...watchlist.items, ...(active ? [active] : [])]) {
			if (!result.some((candidate) => marketItemKey(candidate) === marketItemKey(item))) {
				result.push(item);
			}
		}
		return result;
	});
	const excluded = $derived(new Set(visible.map(marketItemKey)));

	$effect(() => {
		for (const item of visible) {
			const key = marketItemKey(item);
			if (requested.has(key)) continue;
			requested.add(key);
			void loadMarketSeries(item.slug).then((json) => {
				if (!json) return;
				const series = legendSeries(item, json);
				const recent = clipPoints(series.points, 86_400);
				stats = { ...stats, [key]: seriesStats(recent.length >= 2 ? recent : series.points) };
			});
		}
	});

	function add(item: PickedMarketItem) {
		if (!watchlist.has(item.kind, item.slug)) watchlist.toggle(item);
		onselect(item);
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="shrink-0 border-b border-subtle p-2">
		<MarketSearch {items} {excluded} placeholder="Add to watchlist" compact onpick={add} />
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto py-1">
		{#each visible as item (marketItemKey(item))}
			{@const itemStats = stats[marketItemKey(item)]}
			{@const selected = active && marketItemKey(active) === marketItemKey(item)}
			<div
				class="group flex items-center border-l-2 {selected
					? 'border-accent bg-subtle/40'
					: 'border-transparent hover:bg-surface'}"
			>
				<button
					type="button"
					onclick={() => onselect(item)}
					class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-2 text-left"
				>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[10px]">{item.name}</span>
						<span class="font-mono text-[8px] tracking-wider text-muted uppercase"
							>{item.kind === 'bazaar' ? 'BZ' : 'AH'}</span
						>
					</span>
					{#if itemStats}
						<span class="text-right font-mono text-[9px] tabular-nums">
							<span class="block">{formatPrice(itemStats.current)}</span>
							<span class={itemStats.changePct >= 0 ? 'text-up' : 'text-down'}>
								{itemStats.changePct >= 0 ? '+' : ''}{itemStats.changePct.toFixed(2)}%
							</span>
						</span>
					{/if}
				</button>
				{#if watchlist.has(item.kind, item.slug)}
					<button
						type="button"
						onclick={() => watchlist.toggle(item)}
						aria-label="Remove {item.name} from watchlist"
						class="mr-1 grid h-5 w-5 cursor-pointer place-items-center text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-down"
					>
						<X size={10} strokeWidth={1.5} />
					</button>
				{/if}
			</div>
		{/each}
		{#if visible.length === 0}
			<p class="p-4 text-center text-[10px] text-muted">Add items to begin a watchlist.</p>
		{/if}
	</div>
</div>
