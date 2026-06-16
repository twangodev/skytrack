<script lang="ts">
	import { formatPrice } from '$lib/format';
	import type { HistorySummary, HistoryWindow } from '$lib/market/history-summary';

	interface Props {
		itemName: string;
		marketLabel: string;
		metricLabel: string;
		secondaryMetricLabel: string;
		summary: HistorySummary | null;
		dataUrl: string;
		markdownUrl: string;
	}

	const {
		itemName,
		marketLabel,
		metricLabel,
		secondaryMetricLabel,
		summary,
		dataUrl,
		markdownUrl
	}: Props = $props();

	const dateTime = (seconds: number) => new Date(seconds * 1000).toISOString();
	const dateLabel = (seconds: number) =>
		new Date(seconds * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	const pct = (window: HistoryWindow) =>
		`${window.changePct >= 0 ? '+' : ''}${(window.changePct * 100).toFixed(2)}%`;
	const priceChange = (window: HistoryWindow) =>
		`${window.change >= 0 ? '+' : '-'}${formatPrice(Math.abs(window.change))}`;
</script>

<section class="flex flex-col gap-3">
	<div>
		<h2 class="text-sm font-medium">Price history summary</h2>
		{#if summary}
			<p class="mt-1 text-sm leading-relaxed text-muted">
				{itemName}
				{marketLabel} price history tracks {metricLabel} and {secondaryMetricLabel}
				in Hypixel Skyblock coins from
				<time datetime={dateTime(summary.firstTracked)}>{dateLabel(summary.firstTracked)}</time>
				to
				<time datetime={dateTime(summary.lastTracked)}>{dateLabel(summary.lastTracked)}</time>, with
				{summary.sampleCount.toLocaleString('en-US')} sampled price points.
			</p>
		{:else}
			<p class="mt-1 text-sm leading-relaxed text-muted">
				{itemName}
				{marketLabel} price history will appear here after enough Hypixel Skyblock market samples have
				been collected.
			</p>
		{/if}
	</div>

	{#if summary}
		<dl
			class="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle sm:grid-cols-2 lg:grid-cols-4"
		>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">24h change</dt>
				<dd
					class="font-mono text-sm tabular-nums {summary.day
						? summary.day.change > 0
							? 'text-up'
							: summary.day.change < 0
								? 'text-down'
								: 'text-muted'
						: 'text-muted'}"
				>
					{summary.day ? `${priceChange(summary.day)} (${pct(summary.day)})` : 'not enough data'}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">7d change</dt>
				<dd
					class="font-mono text-sm tabular-nums {summary.week
						? summary.week.change > 0
							? 'text-up'
							: summary.week.change < 0
								? 'text-down'
								: 'text-muted'
						: 'text-muted'}"
				>
					{summary.week ? `${priceChange(summary.week)} (${pct(summary.week)})` : 'not enough data'}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">Tracked low</dt>
				<dd class="font-mono text-sm tabular-nums">
					{formatPrice(summary.low.value)}
					<span class="text-xs text-muted">coins</span>
				</dd>
				<dd class="text-xs text-muted">
					<time datetime={dateTime(summary.low.t)}>{dateLabel(summary.low.t)}</time>
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">Tracked high</dt>
				<dd class="font-mono text-sm tabular-nums">
					{formatPrice(summary.high.value)}
					<span class="text-xs text-muted">coins</span>
				</dd>
				<dd class="text-xs text-muted">
					<time datetime={dateTime(summary.high.t)}>{dateLabel(summary.high.t)}</time>
				</dd>
			</div>
		</dl>
	{/if}

	<p class="text-xs text-muted">
		Full historical data:
		{#if summary}
			<a href={dataUrl} class="underline decoration-subtle underline-offset-2 hover:text-text"
				>JSON</a
			>
			<span aria-hidden="true"> · </span>
		{/if}
		<a href={markdownUrl} class="underline decoration-subtle underline-offset-2 hover:text-text"
			>Markdown</a
		>
	</p>
</section>
