<script lang="ts">
	interface Props {
		/** [unix seconds, value] ascending */
		points: [number, number][];
		/** stroke follows the surrounding text color by default */
		class?: string;
	}

	const { points, class: className = '' }: Props = $props();

	const W = 100;
	const H = 32;

	const path = $derived.by(() => {
		if (points.length < 2) return '';
		const ts = points.map(([t]) => t);
		const vs = points.map(([, v]) => v);
		const tMin = Math.min(...ts);
		const tSpan = Math.max(...ts) - tMin || 1;
		const vMin = Math.min(...vs);
		const vMax = Math.max(...vs);
		const pad = (vMax - vMin) * 0.1 || 1;
		const lo = vMin - pad;
		const span = vMax + pad - lo;
		return points
			.map(
				([t, v]) =>
					`${(((t - tMin) / tSpan) * W).toFixed(1)},${((1 - (v - lo) / span) * H).toFixed(1)}`
			)
			.join(' ');
	});
</script>

{#if path}
	<svg
		viewBox="0 0 {W} {H}"
		preserveAspectRatio="none"
		class="h-full w-full {className}"
		aria-hidden="true"
	>
		<polyline
			points={path}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
			stroke-linejoin="round"
		/>
	</svg>
{/if}
