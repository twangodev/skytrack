<script lang="ts">
	import { Area, Chart, Highlight, LinearGradient, Rule, Spline, Svg, Tooltip } from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { browser } from '$app/environment';
	import { formatPrice } from '$lib/format';
	import type { Point } from '$lib/market/chart';
	import { mergedSeries, type ItemSeriesJson } from '$lib/market/series';

	interface Series {
		label: string;
		points: Point[]; // [unix seconds, value]
	}

	interface Props {
		/** hero price; reactive on bazaar pages so it ticks live */
		current: number;
		unit?: string;
		/** which /data/items endpoint backs the chart */
		slug: string;
		kind: 'bazaar' | 'auctions';
		/** SSR fallback + live tail; drives hero change & colors until the fetch lands */
		primary: Series;
		/** optional thin reference line (instasell, median BIN) */
		secondary?: Series;
	}

	const { current, unit = 'coins', slug, kind, primary, secondary }: Props = $props();

	// full-history endpoint, fetched once per item and shared across range tabs
	const seriesCache = new Map<string, Promise<ItemSeriesJson | null>>();
	function loadSeries(itemSlug: string): Promise<ItemSeriesJson | null> {
		let pending = seriesCache.get(itemSlug);
		if (!pending) {
			pending = fetch(`/data/items/${itemSlug}.json`)
				.then((res) => (res.ok ? (res.json() as Promise<ItemSeriesJson>) : null))
				.catch(() => null);
			seriesCache.set(itemSlug, pending);
		}
		return pending;
	}

	let fetched = $state<ItemSeriesJson | null>(null);
	$effect(() => {
		const target = slug;
		fetched = null;
		if (!browser) return;
		void loadSeries(target).then((data) => {
			if (target === slug) fetched = data;
		});
	});

	// fetched history + any SSR/live points newer than its newest sample
	const merged = $derived(fetched ? mergedSeries(fetched, kind) : []);
	const primaryPoints = $derived.by((): Point[] => {
		if (merged.length === 0) return primary.points;
		const newest = merged[merged.length - 1][0];
		const freshTail = primary.points.filter(([t]) => t > newest);
		return [...merged.map(([t, a]) => [t, a] as Point), ...freshTail];
	});
	const secondaryPoints = $derived.by((): Point[] => {
		if (!secondary) return [];
		if (merged.length === 0) return secondary.points;
		const newest = merged[merged.length - 1][0];
		const freshTail = secondary.points.filter(([t]) => t > newest);
		return [...merged.map(([t, , b]) => [t, b] as Point), ...freshTail];
	});

	const RANGES = [
		{ key: '1D', label: '1D', seconds: 86_400 },
		{ key: '1W', label: '1W', seconds: 7 * 86_400 },
		{ key: '1M', label: '1M', seconds: 30 * 86_400 },
		{ key: 'ALL', label: 'ALL', seconds: Infinity }
	] as const;

	type RangeKey = (typeof RANGES)[number]['key'];
	let range = $state<RangeKey>('1D');

	const clip = (points: Point[], seconds: number): Point[] => {
		if (seconds === Infinity) return points;
		const cutoff = Date.now() / 1000 - seconds;
		return points.filter(([t]) => t >= cutoff);
	};

	const visible = $derived.by(() => {
		const selected = RANGES.find((r) => r.key === range) ?? RANGES[3];
		const points = clip(primaryPoints, selected.seconds);
		// a range with under two points can't show change — widen to everything
		return points.length >= 2 ? points : primaryPoints;
	});
	const visibleSecondary = $derived(
		clip(secondaryPoints, (RANGES.find((r) => r.key === range) ?? RANGES[3]).seconds)
	);

	const open = $derived(visible[0]?.[1] ?? current);
	const change = $derived(current - open);
	const changePct = $derived(open > 0 ? (change / open) * 100 : 0);
	const direction = $derived(change > 0 ? 'up' : change < 0 ? 'down' : 'flat');

	const tone = $derived(
		direction === 'up' ? 'text-up' : direction === 'down' ? 'text-down' : 'text-muted'
	);
	const stroke = $derived(
		direction === 'up' ? 'stroke-up' : direction === 'down' ? 'stroke-down' : 'stroke-muted'
	);
	// explicit stops: tailwind v4 registers --tw-gradient-* with inherits:false,
	// so layerchart's from-*/to-* class pattern resolves to transparent in svg
	const gradientStops = $derived.by(() => {
		const color =
			direction === 'up'
				? 'var(--color-up)'
				: direction === 'down'
					? 'var(--color-down)'
					: 'var(--color-muted)';
		return [`color-mix(in oklab, ${color} 25%, transparent)`, 'transparent'];
	});

	const rangeLabel: Record<RangeKey, string> = {
		'1D': 'today',
		'1W': 'past week',
		'1M': 'past month',
		ALL: 'all time'
	};

	type Row = { date: Date; primary: number; secondary?: number };
	const data = $derived.by((): Row[] => {
		const rows = new Map<number, Row>();
		for (const [t, value] of visible) rows.set(t, { date: new Date(t * 1000), primary: value });
		for (const [t, value] of visibleSecondary) {
			const row = rows.get(t);
			if (row) row.secondary = value;
		}
		return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
	});

	const enough = $derived(data.length >= 2);

	const scrubLabel = (date: Date) =>
		date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<section class="flex flex-col gap-3">
	<div>
		<p class="font-mono text-3xl tabular-nums">
			{formatPrice(current)}
			<span class="text-sm text-muted">{unit}</span>
		</p>
		<p class="mt-1 font-mono text-sm tabular-nums {tone}">
			{change >= 0 ? '+' : '−'}{formatPrice(Math.abs(change))}
			({change >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
			<span class="font-sans text-muted">{rangeLabel[range]}</span>
		</p>
	</div>

	{#if enough}
		<div class="h-[220px] w-full font-mono text-[10px]">
			<Chart
				{data}
				x="date"
				xScale={scaleTime()}
				y={(d: Row) => d.primary}
				yNice
				padding={{ bottom: 4 }}
				tooltip={{ mode: 'bisect-x' }}
			>
				<Svg>
					<Rule y={open} class="stroke-subtle [stroke-dasharray:2,4]" />
					<LinearGradient stops={gradientStops} vertical let:gradient={fill}>
						<Area y1={(d: Row) => d.primary} curve={curveMonotoneX} {fill} />
					</LinearGradient>
					<Spline
						y={(d: Row) => d.primary}
						curve={curveMonotoneX}
						class="fill-none stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round] {stroke}"
					/>
					{#if secondary}
						<Spline
							y={(d: Row) => d.secondary}
							curve={curveMonotoneX}
							defined={(d: Row) => d.secondary !== undefined}
							class="fill-none stroke-muted/60 stroke-1 [stroke-dasharray:2,3]"
						/>
					{/if}
					<Highlight
						lines={{ class: 'stroke-muted' }}
						points={{ class: 'fill-text stroke-none', r: 3 }}
					/>
				</Svg>
				<Tooltip.Root class="border border-subtle bg-surface text-xs text-text shadow-lg" let:data
					>{@const row = data as Row}
					<Tooltip.Header class="font-sans text-muted">{scrubLabel(row.date)}</Tooltip.Header>
					<Tooltip.List>
						<Tooltip.Item
							label={primary.label}
							value={formatPrice(row.primary)}
							classes={{ label: 'font-sans text-muted' }}
						/>
						{#if secondary && row.secondary !== undefined}
							<Tooltip.Item
								label={secondary.label}
								value={formatPrice(row.secondary)}
								classes={{ label: 'font-sans text-muted' }}
							/>
						{/if}
					</Tooltip.List>
				</Tooltip.Root>
			</Chart>
		</div>
	{:else}
		<p class="rounded-md border border-subtle bg-surface px-4 py-10 text-center text-xs text-muted">
			Not enough history yet — check back after a few updates.
		</p>
	{/if}

	<div class="flex gap-1 font-mono text-xs" role="tablist" aria-label="Chart range">
		{#each RANGES as r (r.key)}
			<button
				type="button"
				role="tab"
				aria-selected={range === r.key}
				onclick={() => (range = r.key)}
				class="cursor-pointer rounded-md px-2.5 py-1 transition-colors {range === r.key
					? `${tone} bg-surface font-semibold`
					: 'text-muted hover:text-text'}"
			>
				{r.label}
			</button>
		{/each}
	</div>
</section>
