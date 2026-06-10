<script lang="ts">
	import { Axis, Chart, Highlight, Spline, Svg, Tooltip } from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { formatCompact, formatPrice } from '$lib/format';
	import type { Point } from '$lib/market/chart';

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

	const enough = $derived(lines.some((line) => line.points.length >= 2));

	// one row per timestamp so the bisect-x tooltip can show every series
	const data = $derived.by(() => {
		const byTime = new Map<number, Record<string, number | Date>>();
		for (const line of lines) {
			for (const [t, value] of line.points) {
				const row = byTime.get(t) ?? { date: new Date(t * 1000) };
				row[line.label] = value;
				byTime.set(t, row);
			}
		}
		return [...byTime.values()].sort(
			(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
		);
	});

	const accessors = $derived(lines.map((line) => (d: Record<string, number>) => d[line.label]));

	// compact labels collapse into duplicates ("1.26K, 1.26K") when the domain
	// is narrow relative to its magnitude; fall back to exact prices there
	const yFormat = $derived.by(() => {
		const values = lines.flatMap((line) => line.points.map(([, v]) => v));
		const max = Math.max(...values);
		const span = max - Math.min(...values);
		return span < max * 0.05 ? formatPrice : formatCompact;
	});

	const dateLabel = (date: Date) =>
		date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
		<div class="h-[200px] w-full font-mono text-[10px]">
			<Chart
				{data}
				x="date"
				xScale={scaleTime()}
				y={accessors}
				yNice
				padding={{ left: 48, bottom: 20 }}
				tooltip={{ mode: 'bisect-x' }}
			>
				<Svg>
					<Axis
						placement="left"
						grid={{ class: 'stroke-subtle' }}
						format={yFormat}
						tickLabelProps={{ class: 'fill-muted stroke-none' }}
					/>
					<Axis
						placement="bottom"
						format={dateLabel}
						ticks={4}
						tickLabelProps={{ class: 'fill-muted stroke-none' }}
					/>
					{#each lines as line, index (line.label)}
						<Spline y={accessors[index]} class="fill-none stroke-[1.5] {line.colorClass}" />
					{/each}
					<Highlight lines={{ class: 'stroke-muted' }} />
				</Svg>
				<Tooltip.Root class="border border-subtle bg-surface text-xs text-text shadow-lg" let:data>
					<Tooltip.Header class="font-sans">{dateLabel(data.date)}</Tooltip.Header>
					<Tooltip.List>
						{#each lines as line (line.label)}
							{#if data[line.label] !== undefined}
								<Tooltip.Item
									label={line.label}
									value={formatPrice(data[line.label])}
									classes={{ label: 'font-sans text-muted' }}
								/>
							{/if}
						{/each}
					</Tooltip.List>
				</Tooltip.Root>
			</Chart>
		</div>
	{:else}
		<p class="rounded-md border border-subtle bg-surface px-4 py-8 text-center text-xs text-muted">
			Not enough history yet — check back after a few updates.
		</p>
	{/if}
</figure>
