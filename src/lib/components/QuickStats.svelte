<script lang="ts">
	import type { BazaarProductSnapshot } from '$lib/market/aggregate';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		qs: BazaarProductSnapshot['qs'];
	}

	const { qs }: Props = $props();

	type Stat = { label: string; value: string; tone?: 'up' | 'down' };

	const stats: Stat[] = $derived([
		{ label: 'Buy Price', value: formatPrice(qs.bp), tone: 'down' },
		{ label: 'Sell Price', value: formatPrice(qs.sp), tone: 'up' },
		{ label: 'Buy Volume', value: formatCompact(qs.bv) },
		{ label: 'Sell Volume', value: formatCompact(qs.sv) },
		{ label: 'Weekly Buys', value: formatCompact(qs.bmw) },
		{ label: 'Weekly Sells', value: formatCompact(qs.smw) },
		{ label: 'Buy Orders', value: formatCompact(qs.bo) },
		{ label: 'Sell Orders', value: formatCompact(qs.so) }
	]);
</script>

<dl
	class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle sm:grid-cols-4"
>
	{#each stats as stat (stat.label)}
		<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
			<dt class="text-xs text-muted">{stat.label}</dt>
			<dd
				class="font-mono text-sm tabular-nums {stat.tone === 'up'
					? 'text-up'
					: stat.tone === 'down'
						? 'text-down'
						: ''}"
			>
				{stat.value}
			</dd>
		</div>
	{/each}
</dl>
