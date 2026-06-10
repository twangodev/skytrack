<script lang="ts">
	import type { Level } from '$lib/market/aggregate';
	import { cumulative, depthDomain, scale, stepPath, type Point } from '$lib/market/chart';
	import { formatCompact, formatPrice } from '$lib/format';

	interface Props {
		buy: Level[]; // asks (instabuy offers), ascending ppu
		sell: Level[]; // bids (instasell offers), descending ppu
	}

	const { buy, sell }: Props = $props();

	const W = 600;
	const H = 200;
	const PAD_BOTTOM = 18;
	const PLOT_H = H - PAD_BOTTOM;

	const asks = $derived(cumulative(buy));
	// bids arrive best-first (descending ppu); reverse so x ascends for drawing
	const bids = $derived(cumulative(sell).toReversed());

	const xd = $derived(depthDomain(buy, sell));
	const maxDepth = $derived(Math.max(1, ...asks.map(([, y]) => y), ...bids.map(([, y]) => y)));
	const yd = $derived([0, maxDepth * 1.05] as [number, number]);

	const mid = $derived(
		buy.length && sell.length ? (buy[0][0] + sell[0][0]) / 2 : (buy[0]?.[0] ?? sell[0]?.[0] ?? 0)
	);

	function areaPath(points: Point[]): string {
		if (points.length === 0) return '';
		const open = stepPath(points, xd, yd, W, PLOT_H);
		const x0 = scale(points[0][0], xd, [0, W]);
		return `${open}V${PLOT_H}H${x0}Z`;
	}

	let hover = $state<{ x: number; price: number; depth: number; side: 'bid' | 'ask' } | null>(null);

	function onMove(event: PointerEvent) {
		const svg = event.currentTarget as SVGSVGElement;
		const rect = svg.getBoundingClientRect();
		const price = scale(((event.clientX - rect.left) / rect.width) * W, [0, W], xd);
		const all: { point: Point; side: 'bid' | 'ask' }[] = [
			...bids.map((point) => ({ point, side: 'bid' as const })),
			...asks.map((point) => ({ point, side: 'ask' as const }))
		];
		if (all.length === 0) return;
		const nearest = all.reduce((a, b) =>
			Math.abs(b.point[0] - price) < Math.abs(a.point[0] - price) ? b : a
		);
		hover = {
			x: scale(nearest.point[0], xd, [0, W]),
			price: nearest.point[0],
			depth: nearest.point[1],
			side: nearest.side
		};
	}
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="text-sm font-medium">Market Depth</figcaption>
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full touch-none select-none"
		role="img"
		aria-label="Cumulative market depth chart"
		onpointermove={onMove}
		onpointerleave={() => (hover = null)}
	>
		<!-- bids (instasell side) -->
		<path d={areaPath(bids)} class="fill-up/15" />
		<path d={stepPath(bids, xd, yd, W, PLOT_H)} class="fill-none stroke-up" stroke-width="1.5" />
		<!-- asks (instabuy side) -->
		<path d={areaPath(asks)} class="fill-down/15" />
		<path d={stepPath(asks, xd, yd, W, PLOT_H)} class="fill-none stroke-down" stroke-width="1.5" />

		<!-- mid price -->
		<line
			x1={scale(mid, xd, [0, W])}
			x2={scale(mid, xd, [0, W])}
			y1="0"
			y2={PLOT_H}
			class="stroke-muted"
			stroke-dasharray="3 4"
			stroke-width="1"
		/>

		{#if hover}
			<line x1={hover.x} x2={hover.x} y1="0" y2={PLOT_H} class="stroke-text/40" stroke-width="1" />
			<text
				x={hover.x + (hover.x > W / 2 ? -8 : 8)}
				y="14"
				text-anchor={hover.x > W / 2 ? 'end' : 'start'}
				class="fill-text font-mono text-[11px]"
			>
				{formatPrice(hover.price)} · {formatCompact(hover.depth)} {hover.side === 'bid' ? 'bid' : 'ask'}
			</text>
		{/if}

		<!-- x axis labels -->
		<text x="0" y={H - 4} class="fill-muted font-mono text-[10px]">{formatPrice(xd[0])}</text>
		<text x={scale(mid, xd, [0, W])} y={H - 4} text-anchor="middle" class="fill-muted font-mono text-[10px]">
			{formatPrice(mid)}
		</text>
		<text x={W} y={H - 4} text-anchor="end" class="fill-muted font-mono text-[10px]">
			{formatPrice(xd[1])}
		</text>
	</svg>
</figure>
