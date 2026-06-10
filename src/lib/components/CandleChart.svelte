<script lang="ts">
	import type { Candle } from '$lib/market/ohlc';

	interface Props {
		candles: Candle[];
	}

	const { candles }: Props = $props();

	const W = 600;
	const H = 220;
	const AXIS = 16; // bottom strip for date labels
	const PLOT_H = H - AXIS;

	const slot = $derived(candles.length > 0 ? W / candles.length : W);
	const bodyW = $derived(Math.min(18, Math.max(2, slot * 0.65)));

	// y domain: [min low, max high] padded 4%
	const domain = $derived.by((): [number, number] => {
		let lo = Infinity;
		let hi = -Infinity;
		for (const { h, l } of candles) {
			if (l < lo) lo = l;
			if (h > hi) hi = h;
		}
		const pad = (hi - lo) * 0.04;
		return [lo - pad, hi + pad];
	});
	const y = $derived.by(() => {
		const [lo, hi] = domain;
		const span = hi - lo || 1;
		return (v: number) => PLOT_H * (1 - (v - lo) / span);
	});

	// candle width inferred from the smallest gap between consecutive candles
	const bucket = $derived.by(() => {
		let min = Infinity;
		for (let i = 1; i < candles.length; i++) {
			const gap = candles[i].t - candles[i - 1].t;
			if (gap < min) min = gap;
		}
		return min;
	});

	const label = (t: number) => {
		const date = new Date(t * 1000);
		return bucket < 86_400
			? date.toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})
			: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};
</script>

{#if candles.length >= 2}
	<svg viewBox="0 0 {W} {H}" class="h-full w-full" preserveAspectRatio="none" role="img">
		{#each candles as candle, i (candle.t)}
			{@const cx = i * slot + slot / 2}
			{@const up = candle.c >= candle.o}
			{@const top = y(Math.max(candle.o, candle.c))}
			{@const bodyH = Math.max(1, Math.abs(y(candle.o) - y(candle.c)))}
			<line
				x1={cx}
				x2={cx}
				y1={y(candle.h)}
				y2={y(candle.l)}
				stroke-width="1"
				class={up ? 'stroke-up' : 'stroke-down'}
			/>
			<rect
				x={cx - bodyW / 2}
				y={top}
				width={bodyW}
				height={bodyH}
				class={up ? 'fill-up' : 'fill-down'}
			/>
		{/each}
		<g class="fill-muted font-mono text-[10px]" aria-hidden="true">
			<text x="0" y={H - 4}>{label(candles[0].t)}</text>
			<text x={W} y={H - 4} text-anchor="end">{label(candles[candles.length - 1].t)}</text>
		</g>
	</svg>
{/if}
