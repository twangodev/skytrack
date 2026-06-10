<script lang="ts">
	import type { BazaarProductSnapshot } from '$lib/market/aggregate';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		qs: BazaarProductSnapshot['qs'];
	}

	const { qs }: Props = $props();

	const FIELDS = [
		{ key: 'bp', label: 'Buy Price', format: formatPrice },
		{ key: 'sp', label: 'Sell Price', format: formatPrice },
		{ key: 'bv', label: 'Buy Volume', format: formatCompact },
		{ key: 'sv', label: 'Sell Volume', format: formatCompact },
		{ key: 'bmw', label: 'Weekly Buys', format: formatCompact },
		{ key: 'smw', label: 'Weekly Sells', format: formatCompact },
		{ key: 'bo', label: 'Buy Orders', format: formatCompact },
		{ key: 'so', label: 'Sell Orders', format: formatCompact }
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
				{field.format(qs[field.key])}
			</dd>
		</div>
	{/each}
</dl>
