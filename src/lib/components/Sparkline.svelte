<script lang="ts">
	import { line, curveMonotoneX } from 'd3-shape';

	interface Props {
		/** [unix seconds, value] ascending */
		points: [number, number][];
		/** stroke follows the surrounding text color by default */
		class?: string;
	}

	const { points, class: className = '' }: Props = $props();

	const W = 100;
	const H = 32;

	// same monotone curve as the main charts, without a chart wrapper so the
	// path is part of the prerendered html
	const path = $derived.by(() => {
		if (points.length < 2) return null;
		const ts = points.map(([t]) => t);
		const vs = points.map(([, v]) => v);
		const tMin = Math.min(...ts);
		const tSpan = Math.max(...ts) - tMin || 1;
		const vMin = Math.min(...vs);
		const vMax = Math.max(...vs);
		const pad = (vMax - vMin) * 0.1 || 1;
		const lo = vMin - pad;
		const span = vMax + pad - lo;
		const toXY = line<[number, number]>()
			.x(([t]) => ((t - tMin) / tSpan) * W)
			.y(([, v]) => (1 - (v - lo) / span) * H)
			.curve(curveMonotoneX);
		return toXY(points);
	});
</script>

{#if path}
	<svg
		viewBox="0 0 {W} {H}"
		preserveAspectRatio="none"
		class="h-full w-full {className}"
		aria-hidden="true"
	>
		<path
			d={path}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/if}
