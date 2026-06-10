<script lang="ts">
	import type { Level } from '$lib/market/aggregate';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		levels: Level[];
		side: 'buy' | 'sell';
	}

	const { levels, side }: Props = $props();

	// buy_summary = instabuy offers (asks), sell_summary = instasell bids
	const title = $derived(side === 'buy' ? 'Buy Orders (Asks)' : 'Sell Orders (Bids)');
	const tone = $derived(side === 'buy' ? 'text-down' : 'text-up');
</script>

<div class="flex flex-col gap-2">
	<h2 class="text-sm font-medium {tone}">{title}</h2>
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-subtle text-left text-xs text-muted">
				<th class="py-1.5 pr-3 font-normal">Price / Unit</th>
				<th class="py-1.5 pr-3 text-right font-normal">Amount</th>
				<th class="py-1.5 pr-3 text-right font-normal">Orders</th>
				<th class="py-1.5 text-right font-normal">Value</th>
			</tr>
		</thead>
		<tbody>
			{#each levels as [ppu, amount, orders], index (index)}
				<tr class="border-b border-subtle/60">
					<td class="py-1 pr-3 font-mono tabular-nums">{formatPrice(ppu)}</td>
					<td class="py-1 pr-3 text-right font-mono tabular-nums">{formatCompact(amount)}</td>
					<td class="py-1 pr-3 text-right font-mono text-muted tabular-nums">{orders}</td>
					<td class="py-1 text-right font-mono text-muted tabular-nums"
						>{formatCompact(ppu * amount)}</td
					>
				</tr>
			{:else}
				<tr><td colspan="4" class="py-4 text-center text-xs text-muted">No open orders.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
