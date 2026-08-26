<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Link2, Search, X } from '@lucide/svelte';
	import MarketSearch from '$lib/components/MarketSearch.svelte';
	import { marketItemKey, type MarketItem, type PickedMarketItem } from '$lib/market/client';
	import { LINK_GROUPS, type LegendWidget, type LinkGroup } from '$lib/legend/layout';

	interface Props {
		widget: LegendWidget;
		items: MarketItem[];
		searchable?: boolean;
		children: Snippet;
		onselect: (item: PickedMarketItem) => void;
		onlink: (group: LinkGroup) => void;
		onremove: () => void;
	}

	const {
		widget,
		items,
		searchable = true,
		children,
		onselect,
		onlink,
		onremove
	}: Props = $props();

	let linkOpen = $state(false);
	let searchOpen = $state(false);
	const excluded = $derived(new Set(widget.item ? [marketItemKey(widget.item)] : []));

	const groupClass: Record<Exclude<LinkGroup, null>, string> = {
		green: 'bg-up',
		blue: 'bg-accent',
		purple: 'bg-[#a970d6]',
		orange: 'bg-[#d69e3e]'
	};
</script>

<section
	class="flex h-full min-h-0 flex-col overflow-visible rounded-md border border-subtle bg-bg shadow-sm"
>
	<header
		class="legend-widget-handle relative flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-subtle bg-surface/55 px-2.5 active:cursor-grabbing"
	>
		<div class="legend-widget-control relative">
			<button
				type="button"
				onclick={() => (linkOpen = !linkOpen)}
				aria-label="Change widget link group"
				aria-expanded={linkOpen}
				title={widget.linkGroup ? `Linked: ${widget.linkGroup}` : 'Unlinked'}
				class="grid h-5 w-5 cursor-pointer place-items-center rounded border border-subtle text-muted transition-colors hover:text-text"
			>
				{#if widget.linkGroup}
					<span class="h-2 w-2 rounded-sm {groupClass[widget.linkGroup]}" aria-hidden="true"></span>
				{:else}
					<Link2 size={10} strokeWidth={1.5} />
				{/if}
			</button>
			{#if linkOpen}
				<div
					class="absolute top-7 left-0 z-50 w-36 rounded-md border border-subtle bg-surface p-1 shadow-xl"
				>
					<p class="px-2 py-1 font-mono text-[8px] tracking-widest text-muted uppercase">
						Link group
					</p>
					{#each LINK_GROUPS as group (group)}
						<button
							type="button"
							onclick={() => {
								onlink(group);
								linkOpen = false;
							}}
							class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] capitalize hover:bg-subtle/60"
						>
							<span class="h-2 w-2 rounded-sm {groupClass[group]}"></span>{group}
						</button>
					{/each}
					<button
						type="button"
						onclick={() => {
							onlink(null);
							linkOpen = false;
						}}
						class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] text-muted hover:bg-subtle/60"
					>
						<Link2 size={10} strokeWidth={1.5} /> Unlinked
					</button>
				</div>
			{/if}
		</div>

		<div class="min-w-0 flex-1">
			<p class="flex min-w-0 items-baseline gap-2">
				<span class="shrink-0 text-[10px] font-medium">{widget.title}</span>
				{#if widget.item}
					<span class="truncate font-mono text-[9px] text-muted">{widget.item.name}</span>
				{/if}
			</p>
		</div>

		{#if searchable}
			<div class="legend-widget-control relative">
				<button
					type="button"
					onclick={() => (searchOpen = !searchOpen)}
					aria-label="Change widget item"
					aria-expanded={searchOpen}
					class="grid h-5 w-5 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-subtle hover:text-text"
				>
					<Search size={12} strokeWidth={1.5} />
				</button>
				{#if searchOpen}
					<div class="absolute top-7 right-0 z-50 w-64">
						<MarketSearch
							{items}
							{excluded}
							placeholder="Change item"
							compact
							onpick={(item) => {
								onselect(item);
								searchOpen = false;
							}}
						/>
					</div>
				{/if}
			</div>
		{/if}
		<button
			type="button"
			onclick={onremove}
			aria-label="Remove {widget.title} widget"
			class="legend-widget-control grid h-5 w-5 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-subtle hover:text-down"
		>
			<X size={12} strokeWidth={1.5} />
		</button>
	</header>

	<div class="min-h-0 flex-1 overflow-hidden">
		{@render children()}
	</div>
</section>
