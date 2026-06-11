<script lang="ts">
	import { Activity, ArrowRight, Gavel, Repeat, Store } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import ItemSearch from '$lib/components/ItemSearch.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import WatchlistSection from '$lib/components/WatchlistSection.svelte';
	import { formatCompact, formatPrice } from '$lib/format';
	import { site } from '$lib/config';

	const { data } = $props();

	const pct = (change: number) => `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;

	// Equal-weight market index: last point is today's change (series starts at 0).
	const indexChange = $derived(
		data.index.length >= 2 ? data.index[data.index.length - 1][1] : null
	);
</script>

<SEO canonical="/" />

<div class="flex flex-col gap-12">
	<section class="flex flex-col items-center gap-6 pt-8 text-center sm:pt-16">
		<h1 class="max-w-xl text-3xl font-medium text-balance sm:text-4xl">
			The Hypixel Skyblock market, tracked.
		</h1>
		<p class="max-w-md text-sm text-balance text-muted">
			{site.description}
		</p>
		<div class="w-full max-w-lg">
			<ItemSearch />
		</div>
		<p class="text-xs text-muted"><LastUpdated at={data.lastUpdated} /></p>
	</section>

	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<a
			href="/bazaar"
			class="group flex items-center justify-between rounded-lg border border-subtle bg-surface px-5 py-4 transition-colors hover:border-accent"
		>
			<span class="flex items-center gap-3">
				<Store size={18} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
				<span class="flex flex-col text-left">
					<span class="text-sm font-medium">Bazaar</span>
					<span class="text-xs text-muted">{data.bazaarCount} products · live order books</span>
				</span>
			</span>
			<ArrowRight
				size={16}
				strokeWidth={1.5}
				class="text-muted transition-transform group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
		<a
			href="/auctions"
			class="group flex items-center justify-between rounded-lg border border-subtle bg-surface px-5 py-4 transition-colors hover:border-accent"
		>
			<span class="flex items-center gap-3">
				<Gavel size={18} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
				<span class="flex flex-col text-left">
					<span class="text-sm font-medium">Auction House</span>
					<span class="text-xs text-muted">{data.auctionCount} items · BIN price tracking</span>
				</span>
			</span>
			<ArrowRight
				size={16}
				strokeWidth={1.5}
				class="text-muted transition-transform group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
		<a
			href="/flips"
			class="group flex items-center justify-between rounded-lg border border-subtle bg-surface px-5 py-4 transition-colors hover:border-accent"
		>
			<span class="flex items-center gap-3">
				<Repeat size={18} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
				<span class="flex flex-col text-left">
					<span class="text-sm font-medium">Flips</span>
					<span class="text-xs text-muted">spread screener · margins & volume</span>
				</span>
			</span>
			<ArrowRight
				size={16}
				strokeWidth={1.5}
				class="text-muted transition-transform group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
		<a
			href="/movers"
			class="group flex items-center justify-between rounded-lg border border-subtle bg-surface px-5 py-4 transition-colors hover:border-accent"
		>
			<span class="flex items-center gap-3">
				<Activity size={18} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
				<span class="flex flex-col text-left">
					<span class="text-sm font-medium">Movers</span>
					<span class="text-xs text-muted">today's gainers & losers</span>
				</span>
			</span>
			<ArrowRight
				size={16}
				strokeWidth={1.5}
				class="text-muted transition-transform group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
	</section>

	<WatchlistSection />

	<section class="flex flex-col gap-3">
		<dl class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-subtle bg-subtle">
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">Weekly Volume</dt>
				<dd class="font-mono text-sm tabular-nums">
					{formatCompact(data.totalWeeklyVolume)} items
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">Advancers / Decliners</dt>
				<dd class="font-mono text-sm tabular-nums">
					{#if data.breadth.up + data.breadth.down === 0}
						<span class="text-muted">—</span>
					{:else}
						<span class="text-up">{data.breadth.up}</span>
						/
						<span class="text-down">{data.breadth.down}</span>
					{/if}
				</dd>
			</div>
			<div class="flex flex-col gap-0.5 bg-surface px-4 py-3">
				<dt class="text-xs text-muted">Market 24h</dt>
				<dd
					class="font-mono text-sm tabular-nums {indexChange === null
						? 'text-muted'
						: indexChange > 0
							? 'text-up'
							: indexChange < 0
								? 'text-down'
								: 'text-muted'}"
				>
					{indexChange === null ? '—' : `${indexChange >= 0 ? '+' : ''}${indexChange.toFixed(2)}%`}
				</dd>
			</div>
		</dl>
		{#if data.index.length >= 2}
			<div class="h-10 w-full {(indexChange ?? 0) >= 0 ? 'text-up' : 'text-down'}">
				<Sparkline points={data.index} />
			</div>
		{/if}
	</section>

	{#if data.movers.length > 0}
		<section class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between">
				<h2 class="text-sm font-medium text-muted">Top movers · 24h</h2>
				<a href="/movers" class="text-xs text-muted transition-colors hover:text-accent">
					view all
				</a>
			</div>
			<div class="grid gap-3 sm:grid-cols-3">
				{#each data.movers as mover (mover.id)}
					<a
						href="/bazaar/{mover.slug}"
						class="flex flex-col gap-1 rounded-lg border border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent"
					>
						<span class="truncate text-sm">{mover.name}</span>
						<span class="flex items-baseline justify-between gap-2">
							<span class="font-mono text-sm tabular-nums">{formatPrice(mover.price)}</span>
							<span
								class="font-mono text-xs tabular-nums {mover.change >= 0 ? 'text-up' : 'text-down'}"
							>
								{pct(mover.change)}
							</span>
						</span>
						<span class="h-8 {mover.change >= 0 ? 'text-up' : 'text-down'}">
							<Sparkline points={mover.spark} />
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
