<script lang="ts">
	import { Area, Chart, Highlight, Rule, Svg, Tooltip } from 'layerchart';
	import { scaleSymlog } from 'd3-scale';
	import { curveStepAfter } from 'd3-shape';
	import type { Level } from '$lib/market/aggregate';
	import { cumulative, depthDomain } from '$lib/market/chart';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		buy: Level[];
		sell: Level[];
	}

	const { buy, sell }: Props = $props();

	type Row = { ppu: number; depth: number; side: 'bid' | 'ask' };

	const toRows = (points: [number, number][], side: Row['side']): Row[] =>
		points.map(([ppu, depth]) => ({ ppu, depth, side }));

	const asks = $derived(toRows(cumulative(buy), 'ask'));
	const bids = $derived(toRows(cumulative(sell).toReversed(), 'bid'));
	const rows = $derived([...bids, ...asks]);

	const xDomain = $derived(depthDomain(buy, sell));

	const mid = $derived(
		buy.length && sell.length ? (buy[0][0] + sell[0][0]) / 2 : (buy[0]?.[0] ?? sell[0]?.[0] ?? 0)
	);
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="text-sm font-medium">Market Depth</figcaption>
	<div class="h-[200px] w-full font-mono text-[10px]">
		<Chart
			data={rows}
			x="ppu"
			{xDomain}
			y="depth"
			yDomain={[0, null]}
			yScale={scaleSymlog()}
			padding={{ bottom: 20 }}
			tooltipContext={{ mode: 'bisect-x' }}
		>
			<Svg>
				<Area
					data={bids}
					curve={curveStepAfter}
					class="fill-up/15"
					line={{ class: 'stroke-up stroke-[1.5]' }}
				/>
				<Area
					data={asks}
					curve={curveStepAfter}
					class="fill-down/15"
					line={{ class: 'stroke-down stroke-[1.5]' }}
				/>
				<Rule x={mid} class="stroke-muted [stroke-dasharray:3,4]" />
				<Highlight lines={{ class: 'stroke-muted' }} />
			</Svg>
			{#snippet tooltip({ context })}
				<Tooltip.Root {context} class="border border-subtle bg-surface text-xs text-text shadow-lg">
					{#snippet children({ data })}
						<Tooltip.List>
							<Tooltip.Item
								label={data.side === 'bid' ? 'bid' : 'ask'}
								value="{formatPrice(data.ppu)} · {formatCompact(data.depth)}"
								classes={{ label: 'font-sans text-muted' }}
							/>
						</Tooltip.List>
					{/snippet}
				</Tooltip.Root>
			{/snippet}
		</Chart>
	</div>
	<div class="flex justify-between font-mono text-[10px] text-muted" aria-hidden="true">
		<span>{formatPrice(xDomain[0])}</span>
		<span>mid {formatPrice(mid)}</span>
		<span>{formatPrice(xDomain[1])}</span>
	</div>
</figure>
