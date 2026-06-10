<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import type { BazaarProductSnapshot } from '$lib/market/aggregate';

	interface Props {
		qs: BazaarProductSnapshot['qs'];
	}

	const { qs }: Props = $props();

	const PRICE: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
	const COMPACT: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 1 };

	const FIELDS = [
		{ key: 'bp', label: 'Buy Price', format: PRICE },
		{ key: 'sp', label: 'Sell Price', format: PRICE },
		{ key: 'bv', label: 'Buy Volume', format: COMPACT },
		{ key: 'sv', label: 'Sell Volume', format: COMPACT },
		{ key: 'bmw', label: 'Weekly Buys', format: COMPACT },
		{ key: 'smw', label: 'Weekly Sells', format: COMPACT },
		{ key: 'bo', label: 'Buy Orders', format: COMPACT },
		{ key: 'so', label: 'Sell Orders', format: COMPACT }
	] as const;

	type Key = (typeof FIELDS)[number]['key'];

	// flash green/red when a live poll moves a value, like the original site
	let flashes = $state<Partial<Record<Key, 'up' | 'down'>>>({});
	let previous: BazaarProductSnapshot['qs'] | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const next: Partial<Record<Key, 'up' | 'down'>> = {};
		if (previous) {
			for (const { key } of FIELDS) {
				if (qs[key] > previous[key]) next[key] = 'up';
				else if (qs[key] < previous[key]) next[key] = 'down';
			}
		}
		previous = qs;
		if (Object.keys(next).length > 0) {
			flashes = next;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => (flashes = {}), 1200);
		}
		// no cleanup here: a re-run with no changes must not kill the pending
		// reset, or the flash colors stick until the next price move
	});

	$effect(() => {
		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

<dl
	class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle sm:grid-cols-4"
>
	{#each FIELDS as field (field.key)}
		<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
			<dt class="text-xs text-muted">{field.label}</dt>
			<dd
				class="font-mono text-sm tabular-nums transition-colors duration-700 {flashes[field.key] ===
				'up'
					? 'text-up'
					: flashes[field.key] === 'down'
						? 'text-down'
						: ''}"
			>
				<NumberFlow value={Math.round(qs[field.key] * 10) / 10} format={field.format} />
			</dd>
		</div>
	{/each}
</dl>
