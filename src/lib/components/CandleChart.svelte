<script lang="ts">
	import type { Candle } from '$lib/market/ohlc';

	interface Props {
		candles: Candle[];
		/** bucket width in seconds - drives candle body width on the time axis */
		bucketSeconds: number;
	}

	const { candles, bucketSeconds }: Props = $props();

	const W = 600;
	const PLOT_H = 200;

	// x: time-scaled so gaps in the data render as gaps; each candle occupies
	// its bucket [t, t + bucketSeconds)
	const span = $derived.by(() => {
		if (candles.length === 0) return 1;
		return candles[candles.length - 1].t + bucketSeconds - candles[0].t;
	});
	const x = $derived.by(() => {
		const start = candles[0]?.t ?? 0;
		return (t: number) => ((t - start) / span) * W;
	});
	const bodyW = $derived(Math.min(18, Math.max(2, (bucketSeconds / span) * W * 0.65)));

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
		const range = hi - lo || 1;
		return (v: number) => PLOT_H * (1 - (v - lo) / range);
	});

	const label = (t: number) => {
		const date = new Date(t * 1000);
		return bucketSeconds < 86_400
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
	<div class="flex h-full w-full flex-col">
		<!-- stretch fills the container; wicks keep their width via
		     non-scaling-stroke, and text lives outside the svg -->
		<svg
			viewBox="0 0 {W} {PLOT_H}"
			preserveAspectRatio="none"
			class="min-h-0 w-full flex-1 select-none"
			role="img"
			aria-label="Candlestick chart"
		>
			{#each candles as candle (candle.t)}
				{@const cx = x(candle.t + bucketSeconds / 2)}
				{@const up = candle.c >= candle.o}
				{@const top = y(Math.max(candle.o, candle.c))}
				{@const bodyH = Math.max(1.5, Math.abs(y(candle.o) - y(candle.c)))}
				<line
					x1={cx}
					x2={cx}
					y1={y(candle.h)}
					y2={y(candle.l)}
					stroke-width="1"
					vector-effect="non-scaling-stroke"
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
		</svg>
		<div class="flex justify-between pt-1 font-mono text-[10px] text-muted" aria-hidden="true">
			<span>{label(candles[0].t)}</span>
			<span>{label(candles[candles.length - 1].t)}</span>
		</div>
	</div>
{/if}
