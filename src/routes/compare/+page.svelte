<script lang="ts" module>
	import type { ItemSeriesJson } from '$lib/market/series';

	// full-history endpoint, fetched once per item and shared across navigations
	const seriesCache = new Map<string, Promise<ItemSeriesJson | null>>();
	function loadSeries(slug: string): Promise<ItemSeriesJson | null> {
		let pending = seriesCache.get(slug);
		if (!pending) {
			pending = fetch(`/data/items/${slug}.json`)
				.then((res) => (res.ok ? (res.json() as Promise<ItemSeriesJson>) : null))
				.catch(() => null)
				.then((json) => {
					// don't memoize failures - allow a retry on the next add
					if (json === null) seriesCache.delete(slug);
					return json;
				});
			seriesCache.set(slug, pending);
		}
		return pending;
	}
</script>

<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { Axis, Chart, Highlight, Rule, Spline, Svg, Tooltip } from 'layerchart';
	import { scaleTime } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import SEO from '$lib/components/SEO.svelte';
	import { mergedSeries } from '$lib/market/series';

	interface SearchItem {
		slug: string;
		name: string;
		kind: 'bazaar' | 'auctions';
		lower: string;
	}

	type Picked = Pick<SearchItem, 'slug' | 'name' | 'kind'>;

	const MAX_ITEMS = 3;
	const STROKES = ['stroke-accent', 'stroke-up', 'stroke-down'] as const;
	const TEXTS = ['text-accent', 'text-up', 'text-down'] as const;

	const itemKey = (item: Picked) => `${item.kind}:${item.slug}`;

	// --- picker (inline ItemSearch pattern) ---

	let query = $state('');
	let selected = $state(0);
	let focused = $state(false);

	// The index is ~300KB; fetch it once the user shows intent to search.
	let items = $state<SearchItem[]>([]);
	let indexPromise: Promise<SearchItem[]> | null = null;
	function ensureIndex(): Promise<SearchItem[]> {
		if (!browser) return Promise.resolve([]);
		if (!indexPromise) {
			indexPromise = fetch('/search-index.json')
				.then((res) => res.json() as Promise<Omit<SearchItem, 'lower'>[]>)
				.then((raw) => {
					const mapped = raw.map((item) => ({ ...item, lower: item.name.toLowerCase() }));
					items = mapped;
					return mapped;
				})
				.catch(() => {
					indexPromise = null; // allow a retry on next focus
					return [];
				});
		}
		return indexPromise;
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
		const taken = new Set(picked.map(itemKey));
		return items
			.filter((item) => !taken.has(itemKey(item)))
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
			if (target) addItem(target);
		}
	}

	// --- selection + URL sync ---

	let picked = $state<Picked[]>([]);
	const atMax = $derived(picked.length >= MAX_ITEMS);

	function syncUrl() {
		if (!browser) return;
		const url = new URL(location.href);
		const param = picked.map((p) => `${p.slug}:${p.kind}`).join(',');
		if (param) url.searchParams.set('items', param);
		else url.searchParams.delete('items');
		// SvelteKit's replaceState keeps the router's bookkeeping intact
		replaceState(url, {});
	}

	function addItem(item: SearchItem | Picked) {
		if (atMax || picked.some((p) => itemKey(p) === itemKey(item))) return;
		picked = [...picked, { slug: item.slug, name: item.name, kind: item.kind }];
		query = '';
		syncUrl();
	}

	function removeItem(index: number) {
		picked = picked.toSpliced(index, 1);
		syncUrl();
	}

	// restore selection from ?items=slug:kind,slug:kind (searchParams are unavailable while prerendering)
	$effect(() => {
		if (!browser) return;
		const raw = new URLSearchParams(location.search).get('items');
		if (!raw) return;
		const wanted = raw
			.split(',')
			.map((pair) => pair.split(':'))
			.filter(([slug, kind]) => slug && (kind === 'bazaar' || kind === 'auctions'))
			.slice(0, MAX_ITEMS);
		if (wanted.length === 0) return;
		void ensureIndex().then((all) => {
			if (picked.length > 0) return; // user beat the index load
			picked = wanted
				.map(([slug, kind]) => all.find((i) => i.slug === slug && i.kind === kind))
				.filter((i): i is SearchItem => i !== undefined)
				.map(({ slug, name, kind }) => ({ slug, name, kind }));
		});
	});

	// --- per-item history ---

	type MergedPoint = [number, number, number];
	let loaded = $state<Record<string, MergedPoint[]>>({});
	const requested = new Set<string>();

	$effect(() => {
		if (!browser) return;
		for (const item of picked) {
			const key = itemKey(item);
			if (requested.has(key)) continue;
			requested.add(key);
			const kind = item.kind;
			void loadSeries(item.slug).then((json) => {
				loaded = { ...loaded, [key]: json ? mergedSeries(json, kind) : [] };
			});
		}
	});

	// --- ranges (PriceOverview pattern) ---

	const RANGES = [
		{ key: '1D', label: '1D', seconds: 86_400 },
		{ key: '1W', label: '1W', seconds: 7 * 86_400 },
		{ key: '1M', label: '1M', seconds: 30 * 86_400 },
		{ key: 'ALL', label: 'ALL', seconds: Infinity }
	] as const;

	type RangeKey = (typeof RANGES)[number]['key'];
	let range = $state<RangeKey>('ALL');

	// --- normalization: overlap window → range clip → % change from window start ---

	interface NormalizedSeries {
		key: string;
		item: Picked;
		colorIndex: number;
		points: [number, number][]; // [unix seconds, pct]
	}

	const series = $derived.by((): NormalizedSeries[] => {
		const present = picked
			.map((item, colorIndex) => ({
				item,
				colorIndex,
				key: itemKey(item),
				raw: loaded[itemKey(item)]
			}))
			.filter((s) => s.raw !== undefined && s.raw.length >= 2);
		if (present.length === 0) return [];

		// overlapping window: max of firsts .. min of lasts; if invalid fall back to the union
		const firsts = present.map((s) => s.raw[0][0]);
		const lasts = present.map((s) => s.raw[s.raw.length - 1][0]);
		let lo = Math.max(...firsts);
		let hi = Math.min(...lasts);
		if (lo >= hi) {
			lo = Math.min(...firsts);
			hi = Math.max(...lasts);
		}

		const seconds = (RANGES.find((r) => r.key === range) ?? RANGES[3]).seconds;
		const cutoff = seconds === Infinity ? lo : Math.max(lo, Date.now() / 1000 - seconds);

		const out: NormalizedSeries[] = [];
		for (const { item, colorIndex, key, raw } of present) {
			const clipped = raw.filter(([t]) => t >= cutoff && t <= hi);
			if (clipped.length < 2) continue; // gracefully exclude thin series
			const first = clipped[0][1];
			if (first <= 0) continue;
			out.push({
				key,
				item,
				colorIndex,
				points: clipped.map(([t, v]) => [t, ((v - first) / first) * 100])
			});
		}
		return out;
	});

	type Row = { date: Date } & Record<string, number>;
	const data = $derived.by((): Row[] => {
		const rows = new Map<number, Row>();
		for (const s of series) {
			for (const [t, pct] of s.points) {
				let row = rows.get(t);
				if (!row) {
					row = { date: new Date(t * 1000) } as Row;
					rows.set(t, row);
				}
				row[s.key] = pct;
			}
		}
		return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
	});

	const allLoaded = $derived(picked.every((item) => loaded[itemKey(item)] !== undefined));
	const enough = $derived(series.length > 0 && data.length >= 2);

	const pctLabel = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

	const scrubLabel = (date: Date) =>
		date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
</script>

<SEO
	title="Compare Items"
	description="Overlay the price history of up to three Hypixel Skyblock items, normalized to percent change, to see how they move against each other."
	canonical="/compare"
/>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-medium">Compare</h1>
		<p class="mt-1 text-sm text-muted">
			Overlay up to three items' price history, normalized to % change.
		</p>
	</div>

	<div class="relative w-full">
		<label
			class="flex items-center gap-2.5 rounded-lg border border-subtle bg-surface px-4 py-2.5 focus-within:border-accent"
		>
			<Search size={16} strokeWidth={1.5} class="shrink-0 text-muted" aria-hidden="true" />
			<input
				type="search"
				placeholder={atMax
					? 'Maximum of three items'
					: 'Add an item, like Enchanted Diamond or Hyperion'}
				disabled={atMax}
				bind:value={query}
				onkeydown={onKeydown}
				onfocus={() => {
					focused = true;
					void ensureIndex();
				}}
				onblur={() => setTimeout(() => (focused = false), 150)}
				role="combobox"
				aria-expanded={focused && results.length > 0}
				aria-controls="compare-search-results"
				aria-autocomplete="list"
				class="w-full bg-transparent text-sm outline-none placeholder:text-muted"
			/>
		</label>
		{#if focused && results.length > 0}
			<ul
				id="compare-search-results"
				role="listbox"
				class="absolute top-full right-0 left-0 z-10 mt-2 overflow-hidden rounded-lg border border-subtle bg-surface shadow-lg"
			>
				{#each results as result, index (result.kind + result.slug)}
					<li role="option" aria-selected={index === selected}>
						<button
							type="button"
							class="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-left text-sm transition-colors {index ===
							selected
								? 'bg-subtle/60'
								: ''} hover:bg-subtle/60"
							onpointerenter={() => (selected = index)}
							onclick={() => addItem(result)}
						>
							<span>{result.name}</span>
							<span class="font-mono text-[10px] tracking-widest text-muted uppercase"
								>{result.kind}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if picked.length > 0}
		<ul class="flex flex-wrap gap-2">
			{#each picked as item, index (itemKey(item))}
				<li
					class="flex items-center gap-2 rounded-md border border-subtle bg-surface px-2.5 py-1 text-sm"
				>
					<span
						class="inline-block h-2 w-2 rounded-full bg-current {TEXTS[index]}"
						aria-hidden="true"
					></span>
					<span>{item.name}</span>
					<button
						type="button"
						onclick={() => removeItem(index)}
						aria-label="Remove {item.name}"
						class="cursor-pointer text-muted transition-colors hover:text-text"
					>
						<X size={14} strokeWidth={1.5} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if picked.length === 0}
		<p class="rounded-md border border-subtle bg-surface px-4 py-10 text-center text-xs text-muted">
			Search and add up to three items to compare.
		</p>
	{:else if enough}
		<div class="h-[220px] w-full font-mono text-[10px]">
			<Chart
				{data}
				x="date"
				xScale={scaleTime()}
				y={(d: Row) => series.map((s) => d[s.key]).filter((v) => v !== undefined)}
				yNice
				padding={{ left: 40, bottom: 16 }}
				tooltip={{ mode: 'bisect-x' }}
			>
				<Svg>
					<Axis
						placement="left"
						format={(n: number) => n.toFixed(1) + '%'}
						tickLabelProps={{ class: 'fill-muted stroke-none' }}
					/>
					<Axis placement="bottom" tickLabelProps={{ class: 'fill-muted stroke-none' }} />
					<Rule y={0} class="stroke-subtle [stroke-dasharray:2,4]" />
					{#each series as s (s.key)}
						<Spline
							y={(d: Row) => d[s.key]}
							curve={curveMonotoneX}
							defined={(d: Row) => d[s.key] !== undefined}
							class="fill-none stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round] {STROKES[
								s.colorIndex
							]}"
						/>
					{/each}
					<Highlight lines={{ class: 'stroke-muted' }} />
				</Svg>
				<Tooltip.Root class="border border-subtle bg-surface text-xs text-text shadow-lg" let:data
					>{@const row = data as Row}
					<Tooltip.Header class="font-sans text-muted">{scrubLabel(row.date)}</Tooltip.Header>
					<Tooltip.List>
						{#each series as s (s.key)}
							{#if row[s.key] !== undefined}
								<Tooltip.Item
									label={s.item.name}
									value={pctLabel(row[s.key])}
									classes={{ label: 'font-sans text-muted', value: TEXTS[s.colorIndex] }}
								/>
							{/if}
						{/each}
					</Tooltip.List>
				</Tooltip.Root>
			</Chart>
		</div>
	{:else if allLoaded}
		<p class="rounded-md border border-subtle bg-surface px-4 py-10 text-center text-xs text-muted">
			Not enough overlapping history to compare. Try a wider range or different items.
		</p>
	{/if}

	{#if picked.length > 0}
		<div class="flex gap-1 font-mono text-xs" role="group" aria-label="Chart range">
			{#each RANGES as r (r.key)}
				<button
					type="button"
					aria-pressed={range === r.key}
					onclick={() => (range = r.key)}
					class="cursor-pointer rounded-md px-2.5 py-1 transition-colors {range === r.key
						? 'bg-surface font-semibold text-text'
						: 'text-muted hover:text-text'}"
				>
					{r.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
