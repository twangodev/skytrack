<script lang="ts">
	import { linePath, niceTicks, scale, type Point } from '$lib/market/chart';
	import { formatCompact } from '$lib/format';

	interface Line {
		label: string;
		points: Point[]; // [unix seconds, value]
		colorClass: string; // e.g. 'stroke-up'
		textClass: string; // e.g. 'text-up'
	}

	interface Props {
		title: string;
		lines: Line[];
	}

	const { title, lines }: Props = $props();

	const W = 600;
	const H = 200;
	const PAD_BOTTOM = 18;
	const PLOT_H = H - PAD_BOTTOM;

	const allPoints = $derived(lines.flatMap((line) => line.points));
	const enough = $derived(lines.some((line) => line.points.length >= 2));

	const xd = $derived.by((): [number, number] => {
		const ts = allPoints.map(([t]) => t);
		return ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 1];
	});
	const yd = $derived.by((): [number, number] => {
		const vs = allPoints.map(([, v]) => v);
		if (!vs.length) return [0, 1];
		const lo = Math.min(...vs);
		const hi = Math.max(...vs);
		const pad = (hi - lo || hi || 1) * 0.08;
		return [Math.max(0, lo - pad), hi + pad];
	});

	const ticks = $derived(niceTicks(yd[0], yd[1], 4));

	const dateLabel = (t: number) =>
		new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

<figure class="flex flex-col gap-2">
	<figcaption class="flex flex-wrap items-baseline justify-between gap-2">
		<span class="text-sm font-medium">{title}</span>
		<span class="flex gap-3 text-xs">
			{#each lines as line (line.label)}
				<span class={line.textClass}>— {line.label}</span>
			{/each}
		</span>
	</figcaption>
	{#if enough}
		<svg viewBox="0 0 {W} {H}" class="w-full select-none" role="img" aria-label={title}>
			{#each ticks as tick (tick)}
				<line
					x1="0"
					x2={W}
					y1={scale(tick, yd, [PLOT_H, 0])}
					y2={scale(tick, yd, [PLOT_H, 0])}
					class="stroke-subtle"
					stroke-width="1"
				/>
				<text
					x="0"
					y={scale(tick, yd, [PLOT_H, 0]) - 3}
					class="fill-muted font-mono text-[10px]"
				>
					{formatCompact(tick)}
				</text>
			{/each}
			{#each lines as line (line.label)}
				<path
					d={linePath(line.points, xd, yd, W, PLOT_H)}
					class="fill-none {line.colorClass}"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			{/each}
			<text x="0" y={H - 4} class="fill-muted font-mono text-[10px]">{dateLabel(xd[0])}</text>
			<text x={W} y={H - 4} text-anchor="end" class="fill-muted font-mono text-[10px]">
				{dateLabel(xd[1])}
			</text>
		</svg>
	{:else}
		<p class="rounded-md border border-subtle bg-surface px-4 py-8 text-center text-xs text-muted">
			Not enough history yet — check back after a few updates.
		</p>
	{/if}
</figure>
