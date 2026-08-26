<script lang="ts">
	import { formatPrice } from '$lib/format';
	import { legendSeries, primaryMetric, secondaryMetric } from '$lib/legend/data';
	import type { LegendWidget } from '$lib/legend/layout';
	import { loadMarketSeries } from '$lib/market/client';

	interface Props {
		widget: LegendWidget;
	}

	const { widget }: Props = $props();
	let series = $state<ReturnType<typeof legendSeries> | null>(null);
	let loading = $state(false);

	$effect(() => {
		const item = widget.item;
		series = null;
		if (!item) return;
		loading = true;
		void loadMarketSeries(item.slug).then((json) => {
			if (widget.item?.slug !== item.slug || widget.item.kind !== item.kind) return;
			series = json ? legendSeries(item, json) : null;
			loading = false;
		});
	});

	const rows = $derived.by(() => {
		if (!series) return [];
		const secondary = new Map(series.secondary?.points ?? []);
		return series.points
			.slice(-100)
			.reverse()
			.map(([timestamp, primary]) => ({ timestamp, primary, secondary: secondary.get(timestamp) }));
	});
	const dateLabel = (timestamp: number) =>
		new Date(timestamp * 1000).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

{#if !widget.item}
	<div class="grid h-full place-items-center text-[10px] text-muted">Choose an item.</div>
{:else if loading}
	<div class="grid h-full place-items-center text-[10px] text-muted">Loading history…</div>
{:else if rows.length > 0}
	<div class="h-full overflow-auto">
		<table class="w-full border-collapse text-left text-[9px]">
			<thead class="sticky top-0 bg-bg text-muted">
				<tr class="border-b border-subtle">
					<th class="px-2 py-1.5 font-normal">Time</th>
					<th class="px-2 py-1.5 text-right font-normal">{primaryMetric(widget.item)}</th>
					<th class="px-2 py-1.5 text-right font-normal">{secondaryMetric(widget.item)}</th>
				</tr>
			</thead>
			<tbody class="font-mono tabular-nums">
				{#each rows as row (row.timestamp)}
					<tr class="border-b border-subtle/60 hover:bg-surface/50">
						<td class="px-2 py-1.5 whitespace-nowrap text-muted">{dateLabel(row.timestamp)}</td>
						<td class="px-2 py-1.5 text-right">{formatPrice(row.primary)}</td>
						<td class="px-2 py-1.5 text-right text-muted"
							>{row.secondary === undefined ? '—' : formatPrice(row.secondary)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="grid h-full place-items-center text-[10px] text-muted">No tracked history.</div>
{/if}
