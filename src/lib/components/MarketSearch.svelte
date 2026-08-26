<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { searchMarketItems, type MarketItem, type PickedMarketItem } from '$lib/market/client';

	interface Props {
		items: MarketItem[];
		excluded?: ReadonlySet<string>;
		placeholder?: string;
		compact?: boolean;
		disabled?: boolean;
		onpick: (item: PickedMarketItem) => void;
	}

	const {
		items,
		excluded = new Set(),
		placeholder = 'Search items',
		compact = false,
		disabled = false,
		onpick
	}: Props = $props();

	let query = $state('');
	let selected = $state(0);
	let focused = $state(false);
	const componentId = $props.id();
	const resultsId = `${componentId}-results`;
	const results = $derived(searchMarketItems(items, query, excluded));

	$effect(() => {
		void results;
		selected = 0;
	});

	function choose(item: MarketItem) {
		onpick({ slug: item.slug, name: item.name, kind: item.kind });
		query = '';
		focused = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (results.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = (selected + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = (selected - 1 + results.length) % results.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const target = results[selected];
			if (target) choose(target);
		} else if (event.key === 'Escape') {
			focused = false;
		}
	}
</script>

<div class="relative min-w-0">
	<label
		class="flex items-center gap-2 border border-subtle bg-bg transition-colors focus-within:border-accent {compact
			? 'h-8 rounded-md px-2.5'
			: 'h-9 rounded-lg px-3'}"
	>
		<Search
			size={compact ? 14 : 15}
			strokeWidth={1.5}
			class="shrink-0 text-muted"
			aria-hidden="true"
		/>
		<input
			type="search"
			{placeholder}
			{disabled}
			bind:value={query}
			onkeydown={onKeydown}
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
			role="combobox"
			aria-expanded={focused && results.length > 0}
			aria-controls={resultsId}
			aria-autocomplete="list"
			class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
		/>
	</label>
	{#if focused && results.length > 0}
		<ul
			id={resultsId}
			role="listbox"
			class="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-subtle bg-surface py-1 shadow-xl"
		>
			{#each results as result, index (result.kind + result.slug)}
				<li role="option" aria-selected={index === selected}>
					<button
						type="button"
						class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors {index ===
						selected
							? 'bg-subtle/60'
							: ''} hover:bg-subtle/60"
						onpointerenter={() => (selected = index)}
						onclick={() => choose(result)}
					>
						<span class="truncate text-xs">{result.name}</span>
						<span class="shrink-0 font-mono text-[9px] tracking-widest text-muted uppercase"
							>{result.kind === 'bazaar' ? 'BZ' : 'AH'}</span
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
