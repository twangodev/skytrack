<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import { Repeat } from '@lucide/svelte';
	import type { BazaarProductSnapshot } from '$lib/market/aggregate';
	import { flipQuote } from '$lib/market/flips';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		/** reactive on bazaar pages, so the callout follows the live book */
		qs: BazaarProductSnapshot['qs'];
	}

	const { qs }: Props = $props();

	const quote = $derived(flipQuote(qs.bp, qs.sp));
	const fillVolume = $derived(Math.min(qs.bmw, qs.smw));
</script>

{#if quote.profit > 0 && qs.bp > 0 && qs.sp > 0}
	<a
		href="/flips"
		class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-up/40 bg-up/10 px-4 py-3 transition-colors hover:border-up"
	>
		<span class="flex items-center gap-2 text-sm font-medium text-up">
			<Repeat size={14} strokeWidth={2} aria-hidden="true" />
			Flip opportunity
		</span>
		<span class="font-mono text-sm text-up tabular-nums">
			+<NumberFlow
				value={Math.round(quote.profit * 10) / 10}
				format={{ maximumFractionDigits: 1 }}
			/> coins/item ({quote.marginPct.toFixed(1)}%)
		</span>
		<span class="text-xs text-muted">
			buy order at {formatPrice(qs.sp + 0.1)}, sell offer at {formatPrice(qs.bp - 0.1)}, after tax ·
			fills about {formatCompact(fillVolume)}/week
		</span>
	</a>
{/if}
