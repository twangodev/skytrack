<script lang="ts" module>
	import type { PickedMarketItem } from '$lib/market/client';
	import type { Point } from '$lib/market/chart';

	export interface LegendSeries {
		key: string;
		item: PickedMarketItem;
		points: Point[];
		secondary?: { label: string; points: Point[] };
	}
</script>

<script lang="ts">
	import NumberFlow from '@number-flow/svelte';
	import type { Action } from 'svelte/action';
	import {
		Axis,
		Chart,
		ChartClipPath,
		Grid,
		Highlight,
		Rule,
		Spline,
		Svg,
		Tooltip,
		type ChartState
	} from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import CandleChart from '$lib/components/CandleChart.svelte';
	import {
		clampDomain,
		normalizePoints,
		panDomain,
		zoomDomain,
		type Domain
	} from '$lib/market/chart';
	import { bucketOHLC, pickBucket, type Candle } from '$lib/market/ohlc';
	import { formatPrice } from '$lib/format';

	interface Props {
		primary: LegendSeries | null;
		comparisons?: LegendSeries[];
		style?: 'line' | 'candles';
		loading?: boolean;
	}

	const { primary, comparisons = [], style = 'line', loading = false }: Props = $props();

	const STROKES = ['stroke-accent', 'stroke-up', 'stroke-[#a970d6]', 'stroke-[#d69e3e]'] as const;
	const TEXTS = ['text-accent', 'text-up', 'text-[#a970d6]', 'text-[#d69e3e]'] as const;
	const INITIAL_POINT_COUNT = 60;

	const hasComparisons = $derived(comparisons.length > 0);

	interface VisibleLine {
		key: string;
		name: string;
		points: Point[];
		colorIndex: number;
	}

	const visibleLines = $derived.by((): VisibleLine[] => {
		if (!primary) return [];
		const sources = [primary, ...comparisons].filter((series) => series.points.length >= 2);
		if (sources.length === 0) return [];

		const firsts = sources.map((series) => series.points[0][0]);
		const lasts = sources.map((series) => series.points[series.points.length - 1][0]);
		let start = Math.max(...firsts);
		let end = Math.min(...lasts);
		if (start >= end) {
			start = Math.min(...firsts);
			end = Math.max(...lasts);
		}

		return sources
			.map((source, colorIndex) => {
				const clipped = source.points.filter(
					([timestamp]) => timestamp >= start && timestamp <= end
				);
				return {
					key: source.key,
					name: source.item.name,
					points: hasComparisons ? normalizePoints(clipped) : clipped,
					colorIndex
				};
			})
			.filter((line) => line.points.length >= 2);
	});

	type Row = { date: Date } & Record<string, number>;
	const data = $derived.by((): Row[] => {
		const rows = new Map<number, Row>();
		for (const line of visibleLines) {
			for (const [timestamp, value] of line.points) {
				let row = rows.get(timestamp);
				if (!row) {
					row = { date: new Date(timestamp * 1000) } as Row;
					rows.set(timestamp, row);
				}
				row[line.key] = value;
			}
		}
		if (!hasComparisons && primary?.secondary) {
			for (const [timestamp, value] of primary.secondary.points) {
				const row = rows.get(timestamp);
				if (row) row.secondary = value;
			}
		}
		return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
	});

	const xBounds = $derived.by((): Domain | null => {
		const timestamps = visibleLines.flatMap((line) => line.points.map(([timestamp]) => timestamp));
		if (timestamps.length === 0) return null;
		const min = Math.min(...timestamps);
		const max = Math.max(...timestamps);
		return [min, max > min ? max : min + 1];
	});
	let xViewport = $state<Domain | null>(null);
	let yViewport = $state<Domain | null>(null);
	let hoveredCandle = $state<Candle | null>(null);
	const viewportKey = $derived(
		`${primary?.key ?? ''}|${style}|${comparisons.map((series) => series.key).join(',')}`
	);

	function defaultXViewport(): Domain | null {
		if (!xBounds) return null;
		const points = visibleLines[0]?.points ?? [];
		if (points.length <= INITIAL_POINT_COUNT) return null;
		const start = Math.max(xBounds[0], points[points.length - INITIAL_POINT_COUNT][0]);
		return start > xBounds[0] ? [start, xBounds[1]] : null;
	}

	$effect(() => {
		void viewportKey;
		void xBounds;
		xViewport = defaultXViewport();
		yViewport = null;
		hoveredCandle = null;
	});
	const activeXDomain = $derived(xViewport ?? xBounds);
	const candleSpan = $derived(
		activeXDomain ? Math.max(1, activeXDomain[1] - activeXDomain[0]) : 86_400
	);
	const candleBucket = $derived(pickBucket(candleSpan));
	const candles = $derived(
		style === 'candles' && !hasComparisons ? bucketOHLC(primary?.points ?? [], candleBucket) : []
	);
	const yBounds = $derived.by((): Domain | null => {
		const inViewport = (timestamp: number) =>
			!activeXDomain || (timestamp >= activeXDomain[0] && timestamp <= activeXDomain[1]);
		let values =
			style === 'candles' && candles.length > 0
				? candles.filter((candle) => inViewport(candle.t)).flatMap((candle) => [candle.l, candle.h])
				: visibleLines.flatMap((line) =>
						line.points.filter(([timestamp]) => inViewport(timestamp)).map(([, value]) => value)
					);
		if (style !== 'candles' && !hasComparisons && primary?.secondary) {
			values.push(
				...primary.secondary.points
					.filter(([timestamp]) => inViewport(timestamp))
					.map(([, value]) => value)
			);
		}
		if (values.length === 0) {
			values =
				style === 'candles' && candles.length > 0
					? candles.flatMap((candle) => [candle.l, candle.h])
					: visibleLines.flatMap((line) => line.points.map(([, value]) => value));
			if (style !== 'candles' && !hasComparisons && primary?.secondary) {
				values.push(...primary.secondary.points.map(([, value]) => value));
			}
		}
		if (values.length === 0) return null;
		const min = Math.min(...values);
		const max = Math.max(...values);
		const pad = Math.max((max - min) * 0.06, Math.abs(max) * 0.002, 0.001);
		return [min - pad, max + pad];
	});
	const activeYDomain = $derived(yViewport ?? yBounds);
	const chartXDomain = $derived(
		activeXDomain
			? [new Date(activeXDomain[0] * 1000), new Date(activeXDomain[1] * 1000)]
			: undefined
	);

	type DragMode = 'pan' | 'x-scale' | 'y-scale';
	let drag:
		| { pointerId: number; x: number; y: number; width: number; height: number; mode: DragMode }
		| undefined;
	let dragMode = $state<DragMode | null>(null);
	let chartContext = $state<ChartState<Row>>();

	function clearHover() {
		chartContext?.tooltipState.hide();
		hoveredCandle = null;
	}

	function resetViewport() {
		clearHover();
		xViewport = defaultXViewport();
		yViewport = null;
	}

	function onWheel(event: WheelEvent) {
		if (!xBounds || !yBounds) return;
		clearHover();
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
		const y = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
		event.preventDefault();
		event.stopPropagation();

		if (x <= 64 || event.shiftKey) {
			const domain = yViewport ?? yBounds;
			const span = domain[1] - domain[0];
			const anchor = domain[1] - (y / Math.max(1, rect.height)) * span;
			const delta = event.deltaY === 0 ? event.deltaX : event.deltaY;
			yViewport = zoomDomain(
				domain,
				anchor,
				Math.exp(delta * 0.0015),
				(yBounds[1] - yBounds[0]) / 200,
				(yBounds[1] - yBounds[0]) * 8
			);
			return;
		}

		const domain = xViewport ?? xBounds;
		const span = domain[1] - domain[0];
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
			xViewport = clampDomain(
				panDomain(domain, (event.deltaX / Math.max(1, rect.width)) * span),
				xBounds
			);
			return;
		}
		const anchor = domain[0] + (x / Math.max(1, rect.width)) * span;
		xViewport = clampDomain(
			zoomDomain(
				domain,
				anchor,
				Math.exp(event.deltaY * 0.0015),
				(xBounds[1] - xBounds[0]) / 200,
				xBounds[1] - xBounds[0]
			),
			xBounds
		);
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !xBounds || !yBounds) return;
		clearHover();
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const mode: DragMode = y >= rect.height - 34 ? 'x-scale' : x <= 64 ? 'y-scale' : 'pan';
		drag = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			width: rect.width,
			height: rect.height,
			mode
		};
		dragMode = mode;
		target.setPointerCapture(event.pointerId);
		target.focus({ preventScroll: true });
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag || drag.pointerId !== event.pointerId || !xBounds || !yBounds) return;
		const deltaX = event.clientX - drag.x;
		const deltaY = event.clientY - drag.y;
		if (drag.mode === 'pan') {
			const xDomain = xViewport ?? xBounds;
			const yDomain = yViewport ?? yBounds;
			xViewport = clampDomain(
				panDomain(xDomain, (-deltaX / Math.max(1, drag.width)) * (xDomain[1] - xDomain[0])),
				xBounds
			);
			yViewport = panDomain(
				yDomain,
				(deltaY / Math.max(1, drag.height)) * (yDomain[1] - yDomain[0])
			);
		} else if (drag.mode === 'x-scale') {
			const domain = xViewport ?? xBounds;
			xViewport = clampDomain(
				zoomDomain(
					domain,
					(domain[0] + domain[1]) / 2,
					Math.exp(deltaX * 0.008),
					(xBounds[1] - xBounds[0]) / 200,
					xBounds[1] - xBounds[0]
				),
				xBounds
			);
		} else {
			const domain = yViewport ?? yBounds;
			yViewport = zoomDomain(
				domain,
				(domain[0] + domain[1]) / 2,
				Math.exp(deltaY * 0.008),
				(yBounds[1] - yBounds[0]) / 200,
				(yBounds[1] - yBounds[0]) * 8
			);
		}
		drag.x = event.clientX;
		drag.y = event.clientY;
	}

	function onPointerUp(event: PointerEvent) {
		if (!drag || drag.pointerId !== event.pointerId) return;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
		drag = undefined;
		dragMode = null;
	}

	const chartNavigation: Action<HTMLElement> = (node) => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' || event.key === '0') resetViewport();
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', onPointerUp);
		node.addEventListener('pointercancel', onPointerUp);
		node.addEventListener('dblclick', resetViewport);
		node.addEventListener('keydown', onKeyDown);
		return {
			destroy() {
				node.removeEventListener('wheel', onWheel);
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('pointermove', onPointerMove);
				node.removeEventListener('pointerup', onPointerUp);
				node.removeEventListener('pointercancel', onPointerUp);
				node.removeEventListener('dblclick', resetViewport);
				node.removeEventListener('keydown', onKeyDown);
			}
		};
	};

	const hovered = $derived(chartContext?.tooltipState.data ?? null);
	const latestVisibleTimestamp = $derived.by(() => {
		const end = activeXDomain?.[1] ?? Infinity;
		return Math.max(
			...visibleLines.flatMap((line) =>
				line.points.filter(([timestamp]) => timestamp <= end).map(([timestamp]) => timestamp)
			),
			-Infinity
		);
	});
	const legendDate = $derived(
		(style === 'candles' && hoveredCandle ? new Date(hoveredCandle.t * 1000) : hovered?.date) ??
			(Number.isFinite(latestVisibleTimestamp)
				? new Date(latestVisibleTimestamp * 1000)
				: data.length > 0
					? data[data.length - 1].date
					: undefined)
	);
	const legendValue = (line: VisibleLine): number | undefined => {
		if (style === 'candles' && hoveredCandle && line.colorIndex === 0) return hoveredCandle.c;
		if (hovered?.[line.key] !== undefined) return hovered[line.key];
		const start = activeXDomain?.[0] ?? -Infinity;
		const end = activeXDomain?.[1] ?? Infinity;
		return line.points.findLast(([timestamp]) => timestamp >= start && timestamp <= end)?.[1];
	};

	const axisPrice = (value: number) => formatPrice(value);
	const axisPercent = (value: number) => `${value.toFixed(1)}%`;
	const dateLabel = (date: Date) =>
		date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<!-- The chart is a keyboard-addressable composite interaction surface. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="relative h-full min-h-0 w-full overflow-hidden bg-bg {xBounds && yBounds
		? dragMode
			? 'cursor-grabbing'
			: 'cursor-grab'
		: ''}"
	role="application"
	tabindex="0"
	aria-label="Interactive market chart. Scroll to zoom time, scroll the price axis or hold Shift to zoom price, drag to pan, and double-click to reset."
	title="Scroll: zoom time · Shift-scroll: zoom price · Drag: pan · Double-click: reset"
	style:touch-action="none"
	use:chartNavigation
>
	{#if loading && !primary}
		<div class="absolute inset-0 grid place-items-center text-xs text-muted">
			Loading market data…
		</div>
	{:else if !primary}
		<div class="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted">
			Choose a market item to open its chart.
		</div>
	{:else if style === 'candles' && !hasComparisons && candles.length >= 2}
		<div class="h-full px-4 pt-24 pb-4 sm:px-6">
			<CandleChart
				{candles}
				bucketSeconds={candleBucket}
				xDomain={activeXDomain ?? undefined}
				yDomain={activeYDomain ?? undefined}
				showYAxis
				onhover={(candle) => (hoveredCandle = candle)}
			/>
		</div>
	{:else if data.length >= 2 && visibleLines.length > 0}
		<div class="absolute inset-0 pt-20 font-mono text-[10px] sm:pt-24">
			<Chart
				{data}
				x="date"
				xScale={scaleTime()}
				xDomain={chartXDomain}
				y={(row: Row) => [
					...visibleLines.map((line) => row[line.key]).filter((value) => value !== undefined),
					...(!hasComparisons && row.secondary !== undefined ? [row.secondary] : [])
				]}
				yDomain={activeYDomain ?? undefined}
				yNice={false}
				padding={{ left: 60, right: 18, top: 8, bottom: 28 }}
				tooltipContext={{ mode: 'bisect-x' }}
				bind:context={chartContext}
			>
				<Svg>
					<ChartClipPath>
						<Grid x={false} class="stroke-subtle/70" />
						{#if hasComparisons}
							<Rule y={0} class="stroke-subtle [stroke-dasharray:2,4]" />
						{/if}
						{#each visibleLines as line (line.key)}
							<Spline
								y={(row: Row) => row[line.key]}
								curve={curveMonotoneX}
								defined={(row: Row) => row[line.key] !== undefined}
								class="fill-none stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round] {STROKES[
									line.colorIndex
								]}"
							/>
						{/each}
						{#if !hasComparisons && primary.secondary}
							<Spline
								y={(row: Row) => row.secondary}
								curve={curveMonotoneX}
								defined={(row: Row) => row.secondary !== undefined}
								class="fill-none stroke-muted/60 stroke-1 [stroke-dasharray:2,3]"
							/>
						{/if}
						<Highlight
							lines={{ class: 'stroke-muted' }}
							points={{ class: 'fill-bg stroke-text', r: 3 }}
						/>
					</ChartClipPath>
					<Axis
						placement="left"
						format={hasComparisons ? axisPercent : axisPrice}
						tickLabelProps={{ class: 'fill-muted stroke-none' }}
						tickMarks={false}
					/>
					<Axis
						placement="bottom"
						tickLabelProps={{ class: 'fill-muted stroke-none' }}
						tickMarks={false}
						rule={{ class: 'stroke-subtle' }}
					/>
				</Svg>
				{#snippet tooltip({ context })}
					<Tooltip.Root {context} class="hidden" />
				{/snippet}
			</Chart>
		</div>
	{:else}
		<div class="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted">
			Not enough history in this range. Choose a wider range or another item.
		</div>
	{/if}

	{#if primary && visibleLines.length > 0}
		<div
			class="pointer-events-none absolute top-4 left-4 z-10 max-w-[calc(100%-2rem)] sm:top-5 sm:left-6"
		>
			<p class="mb-2 h-4 font-mono text-[10px] text-muted">
				{legendDate ? dateLabel(legendDate) : 'Latest'}
			</p>
			<ul class="flex max-w-full flex-wrap gap-x-4 gap-y-1.5">
				{#each visibleLines as line (line.key)}
					{@const value = legendValue(line)}
					<li class="flex min-w-0 items-center gap-1.5 text-xs">
						<span
							class="h-1.5 w-1.5 shrink-0 rounded-full bg-current {TEXTS[line.colorIndex]}"
							aria-hidden="true"
						></span>
						<span class="max-w-36 truncate text-muted">{line.name}</span>
						<span class="font-mono tabular-nums {TEXTS[line.colorIndex]}">
							{#if value === undefined}
								—
							{:else}
								<NumberFlow
									{value}
									format={hasComparisons
										? { maximumFractionDigits: 2, signDisplay: 'exceptZero' }
										: { maximumFractionDigits: 1 }}
									suffix={hasComparisons ? '%' : ' c'}
									willChange
								/>
							{/if}
						</span>
					</li>
				{/each}
				{#if !hasComparisons && primary.secondary}
					<li class="flex items-center gap-1.5 text-xs text-muted">
						<span class="h-px w-2 border-t border-dashed border-muted" aria-hidden="true"></span>
						<span>{primary.secondary.label}</span>
					</li>
				{/if}
			</ul>
		</div>
	{/if}
</div>
