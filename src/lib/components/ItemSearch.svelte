<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	interface SearchItem {
		slug: string;
		name: string;
		kind: 'bazaar' | 'auctions';
		lower: string;
	}

	// searchParams are unavailable while prerendering
	let query = $state(browser ? (page.url.searchParams.get('q') ?? '') : '');
	let selected = $state(0);
	let focused = $state(false);

	// The index is ~300KB; fetch it once the user shows intent to search.
	let items = $state<SearchItem[]>([]);
	let loadStarted = false;
	async function ensureIndex() {
		if (loadStarted || !browser) return;
		loadStarted = true;
		try {
			const res = await fetch('/search-index.json');
			const raw = (await res.json()) as Omit<SearchItem, 'lower'>[];
			items = raw.map((item) => ({ ...item, lower: item.name.toLowerCase() }));
		} catch {
			loadStarted = false; // allow a retry on next focus
		}
	}

	$effect(() => {
		if (query.length > 0) void ensureIndex();
	});

	function rank(lower: string, q: string): number {
		if (lower.startsWith(q)) return 0;
		if (lower.includes(` ${q}`)) return 1;
		if (lower.includes(q)) return 2;
		return 3;
	}

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];
		return items
			.map((item) => ({ item, rank: rank(item.lower, q) }))
			.filter(({ rank }) => rank < 3)
			.sort((a, b) => a.rank - b.rank || a.item.name.length - b.item.name.length)
			.slice(0, 10)
			.map(({ item }) => item);
	});

	$effect(() => {
		void results;
		selected = 0;
	});

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
			if (target) void goto(`/${target.kind}/${target.slug}`);
		}
	}
</script>

<div class="relative w-full">
	<label
		class="flex items-center gap-2.5 rounded-lg border border-subtle bg-surface px-4 py-2.5 focus-within:border-accent"
	>
		<Search size={16} strokeWidth={1.5} class="shrink-0 text-muted" aria-hidden="true" />
		<input
			type="search"
			placeholder="Search any item — Enchanted Diamond, Hyperion, …"
			bind:value={query}
			onkeydown={onKeydown}
			onfocus={() => {
				focused = true;
				void ensureIndex();
			}}
			onblur={() => setTimeout(() => (focused = false), 150)}
			role="combobox"
			aria-expanded={focused && results.length > 0}
			aria-controls="search-results"
			aria-autocomplete="list"
			class="w-full bg-transparent text-sm outline-none placeholder:text-muted"
		/>
	</label>
	{#if focused && results.length > 0}
		<ul
			id="search-results"
			role="listbox"
			class="absolute top-full right-0 left-0 z-10 mt-2 overflow-hidden rounded-lg border border-subtle bg-surface shadow-lg"
		>
			{#each results as result, index (result.kind + result.slug)}
				<li role="option" aria-selected={index === selected}>
					<a
						href="/{result.kind}/{result.slug}"
						class="flex items-center justify-between px-4 py-2 text-sm transition-colors {index ===
						selected
							? 'bg-subtle/60'
							: ''} hover:bg-subtle/60"
						onpointerenter={() => (selected = index)}
					>
						<span>{result.name}</span>
						<span class="font-mono text-[10px] tracking-widest text-muted uppercase"
							>{result.kind}</span
						>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
