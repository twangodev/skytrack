<script lang="ts">
	import { formatCompact, formatPrice } from '$lib/format';
	import type { LegendWidget } from '$lib/legend/layout';
	import { LiveMarket } from '$lib/market/live.svelte';

	interface Props {
		widget: LegendWidget;
	}

	const { widget }: Props = $props();
	let market = $state<LiveMarket | null>(null);

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
	const loading = $derived(market?.loading ?? false);
</script>

{#if !widget.item}
	<div class="grid h-full place-items-center text-[10px] text-muted">Choose an item.</div>
{:else if loading}
	<div class="grid h-full place-items-center text-[10px] text-muted">Loading market…</div>
{:else if widget.item.kind === 'bazaar' && snapshot?.bazaar}
	<div class="grid h-full min-h-0 grid-cols-2 divide-x divide-subtle overflow-hidden">
		<div class="min-w-0 overflow-y-auto">
			<div
				class="sticky top-0 grid grid-cols-[1fr_auto] bg-bg px-2 py-1.5 text-[8px] tracking-wider text-muted uppercase"
			>
				<span>Bid</span><span>Amount</span>
			</div>
			{#each snapshot.bazaar.snapshot.sell as level (level[0])}
				<div
					class="relative grid grid-cols-[1fr_auto] gap-2 px-2 py-1 font-mono text-[9px] tabular-nums"
				>
					<span class="text-up">{formatPrice(level[0])}</span>
					<span class="text-muted">{formatCompact(level[1])}</span>
				</div>
			{/each}
		</div>
		<div class="min-w-0 overflow-y-auto">
			<div
				class="sticky top-0 grid grid-cols-[1fr_auto] bg-bg px-2 py-1.5 text-[8px] tracking-wider text-muted uppercase"
			>
				<span>Ask</span><span>Amount</span>
			</div>
			{#each snapshot.bazaar.snapshot.buy as level (level[0])}
				<div class="grid grid-cols-[1fr_auto] gap-2 px-2 py-1 font-mono text-[9px] tabular-nums">
					<span class="text-down">{formatPrice(level[0])}</span>
					<span class="text-muted">{formatCompact(level[1])}</span>
				</div>
			{/each}
		</div>
	</div>
{:else if snapshot?.auctions}
	<div class="grid h-full place-items-center p-4">
		<dl
			class="grid w-full max-w-sm grid-cols-3 gap-px overflow-hidden rounded border border-subtle bg-subtle text-center"
		>
			<div class="bg-bg p-3">
				<dt class="text-[9px] text-muted">Lowest BIN</dt>
				<dd class="mt-1 font-mono text-[11px]">
					{formatPrice(snapshot.auctions.snapshot.lowestBin)}
				</dd>
			</div>
			<div class="bg-bg p-3">
				<dt class="text-[9px] text-muted">Median BIN</dt>
				<dd class="mt-1 font-mono text-[11px]">
					{formatPrice(snapshot.auctions.snapshot.medianBin)}
				</dd>
			</div>
			<div class="bg-bg p-3">
				<dt class="text-[9px] text-muted">Listings</dt>
				<dd class="mt-1 font-mono text-[11px]">
					{formatCompact(snapshot.auctions.snapshot.count)}
				</dd>
			</div>
		</dl>
	</div>
{:else}
	<div class="grid h-full place-items-center p-4 text-center text-[10px] text-muted">
		No current market snapshot.
	</div>
{/if}
