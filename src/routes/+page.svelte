<script lang="ts">
	import { ArrowRight, Gavel, Store } from '@lucide/svelte';
	import SEO from '$lib/components/SEO.svelte';
	import ItemSearch from '$lib/components/ItemSearch.svelte';
	import LastUpdated from '$lib/components/LastUpdated.svelte';
	import { formatPrice } from '$lib/format';
	import { site } from '$lib/config';

	const { data } = $props();

	const pct = (change: number) => `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
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
			<ItemSearch items={data.searchIndex} />
		</div>
		<p class="text-xs text-muted"><LastUpdated at={data.lastUpdated} /></p>
	</section>

	<section class="grid gap-4 sm:grid-cols-2">
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
	</section>

	{#if data.movers.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted">Top movers today</h2>
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
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
