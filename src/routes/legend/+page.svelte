<script lang="ts">
	import type { Action } from 'svelte/action';
	import { onMount, tick } from 'svelte';
	import type { GridItemHTMLElement, GridStack, GridStackNode } from 'gridstack';
	import 'gridstack/dist/gridstack.min.css';
	import {
		ArrowLeft,
		BarChart3,
		BookOpen,
		ChevronDown,
		Copy,
		Grid2X2,
		History,
		LayoutDashboard,
		MonitorUp,
		Plus,
		Store,
		TableProperties,
		Trash2
	} from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import LegendChartWidget from '$lib/components/legend/LegendChartWidget.svelte';
	import LegendHistoryWidget from '$lib/components/legend/LegendHistoryWidget.svelte';
	import LegendOrderBookWidget from '$lib/components/legend/LegendOrderBookWidget.svelte';
	import LegendSnapshotWidget from '$lib/components/legend/LegendSnapshotWidget.svelte';
	import LegendWatchlistWidget from '$lib/components/legend/LegendWatchlistWidget.svelte';
	import LegendWidgetShell from '$lib/components/legend/LegendWidgetShell.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import MarketSearch from '$lib/components/MarketSearch.svelte';
	import SEO from '$lib/components/SEO.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import {
		loadMarketIndex,
		marketItemKey,
		type MarketItem,
		type PickedMarketItem
	} from '$lib/market/client';
	import {
		MAX_LAYOUTS,
		STORAGE_KEY,
		broadcastLegendItem,
		createLegendLayout,
		createLegendWidget,
		createLegendWorkspace,
		parseLegendWorkspace,
		type LegendLayout,
		type LegendPreset,
		type LegendWidget,
		type LegendWidgetType,
		type LegendWorkspaceState,
		type LinkGroup
	} from '$lib/legend/layout';

	const PREFERRED_SLUGS = ['booster-cookie', 'enchanted-diamond', 'hyperion', 'wheat'];
	const WIDGET_OPTIONS: {
		type: LegendWidgetType;
		label: string;
		description: string;
		icon: typeof BarChart3;
	}[] = [
		{ type: 'chart', label: 'Chart', description: 'Interactive price history', icon: BarChart3 },
		{
			type: 'watchlist',
			label: 'Watchlist',
			description: 'Linked item selection',
			icon: TableProperties
		},
		{
			type: 'snapshot',
			label: 'Snapshot',
			description: 'Current price and range stats',
			icon: MonitorUp
		},
		{
			type: 'order-book',
			label: 'Order book',
			description: 'Bazaar depth or auction market',
			icon: BookOpen
		},
		{
			type: 'history',
			label: 'Price history',
			description: 'Tracked snapshot table',
			icon: History
		}
	];
	const PRESETS: {
		id: LegendPreset;
		label: string;
		description: string;
		icon: typeof BarChart3;
	}[] = [
		{
			id: 'chart-spotlight',
			label: 'Chart spotlight',
			description: 'Large chart with snapshot and watchlist',
			icon: BarChart3
		},
		{
			id: 'market-monitor',
			label: 'Market monitor',
			description: 'Chart, history, book, and watchlist',
			icon: Grid2X2
		},
		{
			id: 'bazaar-desk',
			label: 'Bazaar desk',
			description: 'Price and order-book focused layout',
			icon: Store
		},
		{
			id: 'blank',
			label: 'Start blank',
			description: 'An empty layout canvas',
			icon: LayoutDashboard
		}
	];

	let items = $state<MarketItem[]>([]);
	let workspace = $state<LegendWorkspaceState | null>(null);
	let ready = $state(false);
	let indexError = $state(false);
	let addWidgetOpen = $state(false);
	let addLayoutOpen = $state(false);
	let layoutMenuOpen = $state(false);
	let draggedLayoutId = $state<string | null>(null);
	let activeGrid = $state<GridStack | null>(null);
	let activeGridElement = $state<HTMLElement | null>(null);

	const activeLayout = $derived(
		workspace?.layouts.find((layout) => layout.id === workspace?.activeLayoutId) ?? null
	);

	function itemFromKey(all: MarketItem[], key: string | null): PickedMarketItem | null {
		if (!key) return null;
		const [kind, ...slugParts] = key.split(':');
		const slug = slugParts.join(':');
		if ((kind !== 'bazaar' && kind !== 'auctions') || !slug) return null;
		const match = all.find((item) => item.kind === kind && item.slug === slug);
		return match ? { slug: match.slug, name: match.name, kind: match.kind } : null;
	}

	function preferredItem(all: MarketItem[]): PickedMarketItem | null {
		const fromUrl = itemFromKey(all, page.url.searchParams.get('symbol'));
		if (fromUrl) return fromUrl;
		for (const slug of PREFERRED_SLUGS) {
			const match = all.find((item) => item.slug === slug);
			if (match) return { slug: match.slug, name: match.name, kind: match.kind };
		}
		const first = all[0];
		return first ? { slug: first.slug, name: first.name, kind: first.kind } : null;
	}

	function saveWorkspace(next: LegendWorkspaceState) {
		workspace = next;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {}
	}

	function updateLayouts(layouts: LegendLayout[]) {
		if (!workspace) return;
		saveWorkspace({ ...workspace, layouts });
	}

	function updateActiveLayout(update: (layout: LegendLayout) => LegendLayout) {
		if (!workspace) return;
		updateLayouts(
			workspace.layouts.map((layout) =>
				layout.id === workspace?.activeLayoutId ? update(layout) : layout
			)
		);
	}

	function updateWidget(widgetId: string, patch: Partial<LegendWidget>) {
		updateActiveLayout((layout) => ({
			...layout,
			widgets: layout.widgets.map((widget) =>
				widget.id === widgetId ? { ...widget, ...patch } : widget
			)
		}));
	}

	function syncSymbolUrl(item: PickedMarketItem) {
		if (!browser) return;
		const url = new URL(location.href);
		url.searchParams.set('symbol', marketItemKey(item));
		replaceState(url, {});
	}

	function selectForWidget(widgetId: string, item: PickedMarketItem) {
		if (!workspace) return;
		saveWorkspace({
			...workspace,
			layouts: broadcastLegendItem(workspace.layouts, widgetId, item)
		});
		syncSymbolUrl(item);
	}

	function selectGlobally(item: PickedMarketItem) {
		const source =
			activeLayout?.widgets.find((widget) => widget.linkGroup === 'green') ??
			activeLayout?.widgets[0];
		if (source) {
			selectForWidget(source.id, item);
			return;
		}
		if (!activeLayout) return;
		const widget = createLegendWidget('chart', item);
		updateActiveLayout((layout) => ({ ...layout, widgets: [...layout.widgets, widget] }));
		syncSymbolUrl(item);
		void registerWidget(widget);
	}

	function setWidgetLink(widgetId: string, group: LinkGroup) {
		updateWidget(widgetId, { linkGroup: group });
	}

	function geometryChanged(nodes: GridStackNode[]) {
		if (!workspace || nodes.length === 0) return;
		const positions = new Map(
			nodes.filter((node) => node.id).map((node) => [node.id as string, node])
		);
		updateActiveLayout((layout) => ({
			...layout,
			widgets: layout.widgets.map((widget) => {
				const node = positions.get(widget.id);
				if (!node) return widget;
				return {
					...widget,
					x: node.x ?? widget.x,
					y: node.y ?? widget.y,
					w: node.w ?? widget.w,
					h: node.h ?? widget.h
				};
			})
		}));
	}

	const gridItem: Action<HTMLElement, LegendWidget> = (node, widget) => {
		const apply = (value: LegendWidget) => {
			node.setAttribute('gs-id', value.id);
			node.setAttribute('gs-x', String(value.x));
			node.setAttribute('gs-y', String(value.y));
			node.setAttribute('gs-w', String(value.w));
			node.setAttribute('gs-h', String(value.h));
			node.setAttribute('gs-min-w', String(value.minW));
			node.setAttribute('gs-min-h', String(value.minH));
		};
		apply(widget);
		return { update: apply };
	};

	const gridCanvas: Action<HTMLElement> = (node) => {
		let grid: GridStack | null = null;
		let observer: ResizeObserver | null = null;
		let destroyed = false;

		void import('gridstack').then(({ GridStack }) => {
			if (destroyed || !node.isConnected) return;
			const cellHeight = () =>
				node.clientWidth < 720
					? 72
					: Math.max(52, Math.floor((node.parentElement?.clientHeight ?? 600) / 10));
			grid = GridStack.init(
				{
					column: 12,
					columnOpts: {
						breakpoints: [
							{ w: 720, c: 1, layout: 'list' },
							{ w: 1080, c: 6, layout: 'moveScale' }
						],
						layout: 'moveScale'
					},
					cellHeight: cellHeight(),
					margin: 5,
					animate: true,
					float: false,
					handle: '.legend-widget-handle',
					draggable: { cancel: '.legend-widget-control,button,input,a' },
					resizable: { handles: 'e,se,s,sw,w' }
				},
				node as GridItemHTMLElement
			);
			if (!grid) return;
			activeGrid = grid;
			activeGridElement = node;
			grid.on('change', (_event, changed) => geometryChanged(changed));
			observer = new ResizeObserver(() => grid?.cellHeight(cellHeight()));
			observer.observe(node.parentElement ?? node);
		});

		return {
			destroy() {
				destroyed = true;
				observer?.disconnect();
				if (activeGrid === grid) {
					activeGrid = null;
					activeGridElement = null;
				}
				grid?.destroy(false);
			}
		};
	};

	async function registerWidget(widget: LegendWidget) {
		await tick();
		const element = activeGridElement?.querySelector<GridItemHTMLElement>(
			`[data-widget-id="${widget.id}"]`
		);
		if (element && activeGrid && !element.gridstackNode) {
			activeGrid.makeWidget(element, {
				id: widget.id,
				autoPosition: true,
				w: widget.w,
				h: widget.h
			});
		}
	}

	function addWidget(type: LegendWidgetType) {
		if (!activeLayout) return;
		const item = activeLayout.widgets.find((widget) => widget.item)?.item ?? preferredItem(items);
		const widget = createLegendWidget(type, item);
		updateActiveLayout((layout) => ({ ...layout, widgets: [...layout.widgets, widget] }));
		addWidgetOpen = false;
		void registerWidget(widget);
	}

	function removeWidget(widgetId: string) {
		const element = activeGridElement?.querySelector<GridItemHTMLElement>(
			`[data-widget-id="${widgetId}"]`
		);
		if (element && activeGrid) activeGrid.removeWidget(element, false, false);
		updateActiveLayout((layout) => ({
			...layout,
			widgets: layout.widgets.filter((widget) => widget.id !== widgetId)
		}));
	}

	function switchLayout(layoutId: string) {
		if (!workspace || workspace.activeLayoutId === layoutId) return;
		saveWorkspace({ ...workspace, activeLayoutId: layoutId });
		addWidgetOpen = false;
		layoutMenuOpen = false;
	}

	function addLayout(preset: LegendPreset) {
		if (!workspace || workspace.layouts.length >= MAX_LAYOUTS) return;
		const item = activeLayout?.widgets.find((widget) => widget.item)?.item ?? preferredItem(items);
		const layout = createLegendLayout(preset, item);
		saveWorkspace({
			...workspace,
			activeLayoutId: layout.id,
			layouts: [...workspace.layouts, layout]
		});
		addLayoutOpen = false;
	}

	function renameLayout(layout: LegendLayout) {
		const name = prompt('Layout name', layout.name)?.trim();
		if (!name || !workspace) return;
		updateLayouts(
			workspace.layouts.map((candidate) =>
				candidate.id === layout.id ? { ...candidate, name: name.slice(0, 40) } : candidate
			)
		);
	}

	function moveLayout(targetId: string) {
		if (!workspace || !draggedLayoutId || draggedLayoutId === targetId) return;
		const layouts = [...workspace.layouts];
		const from = layouts.findIndex((layout) => layout.id === draggedLayoutId);
		const to = layouts.findIndex((layout) => layout.id === targetId);
		if (from < 0 || to < 0) return;
		const [moved] = layouts.splice(from, 1);
		layouts.splice(to, 0, moved);
		updateLayouts(layouts);
	}

	function duplicateLayout() {
		if (!workspace || !activeLayout || workspace.layouts.length >= MAX_LAYOUTS) return;
		const copy: LegendLayout = {
			...structuredClone(activeLayout),
			id: crypto.randomUUID(),
			name: `${activeLayout.name} copy`,
			widgets: activeLayout.widgets.map((widget) => ({ ...widget, id: crypto.randomUUID() }))
		};
		saveWorkspace({
			...workspace,
			activeLayoutId: copy.id,
			layouts: [...workspace.layouts, copy]
		});
		layoutMenuOpen = false;
	}

	function deleteLayout() {
		if (!workspace || workspace.layouts.length <= 1) return;
		const layouts = workspace.layouts.filter((layout) => layout.id !== workspace?.activeLayoutId);
		saveWorkspace({ ...workspace, activeLayoutId: layouts[0].id, layouts });
		layoutMenuOpen = false;
	}

	onMount(() => {
		void loadMarketIndex()
			.then((all) => {
				items = all;
				const initialItem = preferredItem(all);
				const restored = parseLegendWorkspace(localStorage.getItem(STORAGE_KEY));
				workspace = restored ?? createLegendWorkspace(initialItem);
				const urlItem = itemFromKey(all, page.url.searchParams.get('symbol'));
				if (urlItem && workspace) {
					const currentLayout = workspace.layouts.find(
						(layout) => layout.id === workspace?.activeLayoutId
					);
					const source =
						currentLayout?.widgets.find((widget) => widget.linkGroup === 'green') ??
						currentLayout?.widgets[0];
					if (source) {
						workspace = {
							...workspace,
							layouts: broadcastLegendItem(workspace.layouts, source.id, urlItem)
						};
					} else if (currentLayout) {
						workspace = {
							...workspace,
							layouts: workspace.layouts.map((layout) =>
								layout.id === currentLayout.id
									? { ...layout, widgets: [createLegendWidget('chart', urlItem)] }
									: layout
							)
						};
					}
				}
				if (workspace) saveWorkspace(workspace);
				ready = true;
			})
			.catch(() => {
				indexError = true;
				workspace = createLegendWorkspace(null);
				ready = true;
			});
	});
</script>

<SEO
	title="Legend Market Workspace"
	description="A customizable full-screen Hypixel Skyblock market workspace with linked charts, watchlists, order books, and price history."
	canonical="/legend"
/>

<div
	class="grid h-svh min-h-[520px] grid-rows-[48px_38px_minmax(0,1fr)] overflow-hidden bg-bg text-text"
>
	<header
		class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-subtle bg-surface/55 px-3 sm:gap-5 sm:px-4"
	>
		<div class="flex items-center gap-3">
			<a
				href="/"
				aria-label="Back to Skytrack"
				class="text-muted transition-colors hover:text-text"
			>
				<ArrowLeft size={15} strokeWidth={1.5} />
			</a>
			<a href="/legend" class="flex items-center gap-2 text-xs font-medium tracking-wide">
				<Logo size={15} />
				<span class="hidden sm:inline">Skytrack</span>
				<span
					class="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-accent uppercase"
					>Legend</span
				>
			</a>
		</div>
		<div class="mx-auto w-full max-w-md">
			<MarketSearch
				{items}
				placeholder={ready ? 'Search every bazaar and auction item' : 'Loading markets…'}
				disabled={!ready || indexError}
				compact
				onpick={selectGlobally}
			/>
		</div>
		<div class="flex items-center gap-3 text-muted">
			<span class="hidden font-mono text-[8px] tracking-widest uppercase md:inline"
				>{indexError ? 'Offline' : 'Autosaved'}</span
			>
			<span class="h-1.5 w-1.5 rounded-full {indexError ? 'bg-down' : 'bg-up'}"></span>
			<ThemeToggle />
		</div>
	</header>

	<nav
		class="flex min-w-0 items-center border-b border-subtle bg-surface/30 px-2"
		aria-label="Legend layouts"
	>
		<div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
			{#each workspace?.layouts ?? [] as layout (layout.id)}
				<button
					type="button"
					draggable="true"
					onclick={() => switchLayout(layout.id)}
					ondblclick={() => renameLayout(layout)}
					ondragstart={(event) => {
						draggedLayoutId = layout.id;
						event.dataTransfer?.setData('text/plain', layout.id);
						if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
					}}
					ondragover={(event) => event.preventDefault()}
					ondrop={(event) => {
						event.preventDefault();
						moveLayout(layout.id);
					}}
					ondragend={() => (draggedLayoutId = null)}
					aria-current={layout.id === workspace?.activeLayoutId ? 'page' : undefined}
					class="h-7 max-w-40 shrink-0 cursor-grab truncate rounded px-3 text-[10px] transition-colors active:cursor-grabbing {layout.id ===
					workspace?.activeLayoutId
						? 'bg-subtle text-text'
						: 'text-muted hover:bg-subtle/45 hover:text-text'}"
				>
					{layout.name}
				</button>
			{/each}
			<div class="relative shrink-0">
				<button
					type="button"
					onclick={() => (addLayoutOpen = !addLayoutOpen)}
					disabled={(workspace?.layouts.length ?? MAX_LAYOUTS) >= MAX_LAYOUTS}
					aria-label="Add layout"
					class="grid h-7 w-7 cursor-pointer place-items-center rounded text-muted hover:bg-subtle hover:text-text disabled:opacity-30"
				>
					<Plus size={13} strokeWidth={1.5} />
				</button>
				{#if addLayoutOpen}
					<div
						class="absolute top-8 left-0 z-50 w-72 rounded-md border border-subtle bg-surface p-2 shadow-xl"
					>
						<p class="px-2 py-1 font-mono text-[8px] tracking-widest text-muted uppercase">
							New layout
						</p>
						{#each PRESETS as preset (preset.id)}
							<button
								type="button"
								onclick={() => addLayout(preset.id)}
								class="flex w-full cursor-pointer items-center gap-3 rounded px-2 py-2 text-left hover:bg-subtle/60"
							>
								<preset.icon size={14} strokeWidth={1.5} class="shrink-0 text-muted" />
								<span
									><span class="block text-[10px]">{preset.label}</span><span
										class="block text-[9px] text-muted">{preset.description}</span
									></span
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="relative ml-2 shrink-0">
			<button
				type="button"
				onclick={() => (layoutMenuOpen = !layoutMenuOpen)}
				class="flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-[9px] text-muted hover:bg-subtle hover:text-text"
			>
				Layout <ChevronDown size={10} strokeWidth={1.5} />
			</button>
			{#if layoutMenuOpen}
				<div
					class="absolute top-8 right-0 z-50 w-40 rounded-md border border-subtle bg-surface p-1 shadow-xl"
				>
					<button
						type="button"
						onclick={duplicateLayout}
						class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-[10px] hover:bg-subtle/60 disabled:opacity-30"
						disabled={(workspace?.layouts.length ?? MAX_LAYOUTS) >= MAX_LAYOUTS}
					>
						<Copy size={11} strokeWidth={1.5} /> Duplicate
					</button>
					<button
						type="button"
						onclick={deleteLayout}
						class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-[10px] text-down hover:bg-subtle/60 disabled:opacity-30"
						disabled={(workspace?.layouts.length ?? 0) <= 1}
					>
						<Trash2 size={11} strokeWidth={1.5} /> Delete
					</button>
				</div>
			{/if}
		</div>

		<div class="relative ml-1 shrink-0">
			<button
				type="button"
				onclick={() => (addWidgetOpen = !addWidgetOpen)}
				class="flex h-7 cursor-pointer items-center gap-1.5 rounded bg-text px-2.5 text-[9px] font-medium text-bg hover:opacity-85"
			>
				<Plus size={11} strokeWidth={1.75} /> Add widget
			</button>
			{#if addWidgetOpen}
				<div
					class="absolute top-8 right-0 z-50 w-64 rounded-md border border-subtle bg-surface p-2 shadow-xl"
				>
					<p class="px-2 py-1 font-mono text-[8px] tracking-widest text-muted uppercase">Widgets</p>
					{#each WIDGET_OPTIONS as option (option.type)}
						<button
							type="button"
							onclick={() => addWidget(option.type)}
							class="flex w-full cursor-pointer items-center gap-3 rounded px-2 py-2 text-left hover:bg-subtle/60"
						>
							<option.icon size={14} strokeWidth={1.5} class="shrink-0 text-muted" />
							<span
								><span class="block text-[10px]">{option.label}</span><span
									class="block text-[9px] text-muted">{option.description}</span
								></span
							>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</nav>

	<main
		class="relative min-h-0 overflow-auto bg-[radial-gradient(circle,var(--color-subtle)_0.75px,transparent_0.75px)] [background-size:18px_18px]"
	>
		{#if !ready || !activeLayout}
			<div class="grid h-full place-items-center text-[10px] text-muted">Loading workspace…</div>
		{:else}
			{#key activeLayout.id}
				{#if activeLayout.widgets.length === 0}
					<div class="pointer-events-none absolute inset-0 z-10 grid place-items-center">
						<div
							class="pointer-events-auto rounded-lg border border-subtle bg-bg/90 p-6 text-center shadow-lg backdrop-blur"
						>
							<LayoutDashboard size={22} strokeWidth={1.25} class="mx-auto text-muted" />
							<p class="mt-3 text-xs">Build this layout from a blank canvas.</p>
							<button
								type="button"
								onclick={() => addWidget('chart')}
								class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded bg-text px-3 py-2 text-[10px] font-medium text-bg hover:opacity-85"
							>
								<Plus size={11} strokeWidth={1.75} /> Add a chart
							</button>
						</div>
					</div>
				{/if}
				<div class="grid-stack h-full min-h-full p-1" use:gridCanvas>
					{#each activeLayout.widgets as widget (widget.id)}
						<div class="grid-stack-item" data-widget-id={widget.id} use:gridItem={widget}>
							<div class="grid-stack-item-content">
								<LegendWidgetShell
									{widget}
									{items}
									searchable={widget.type !== 'watchlist'}
									onselect={(item) => selectForWidget(widget.id, item)}
									onlink={(group) => setWidgetLink(widget.id, group)}
									onremove={() => removeWidget(widget.id)}
								>
									{#if widget.type === 'chart'}
										<LegendChartWidget
											{widget}
											{items}
											onupdate={(patch) => updateWidget(widget.id, patch)}
										/>
									{:else if widget.type === 'watchlist'}
										<LegendWatchlistWidget
											{items}
											active={widget.item}
											onselect={(item) => selectForWidget(widget.id, item)}
										/>
									{:else if widget.type === 'snapshot'}
										<LegendSnapshotWidget {widget} />
									{:else if widget.type === 'order-book'}
										<LegendOrderBookWidget {widget} />
									{:else if widget.type === 'history'}
										<LegendHistoryWidget {widget} />
									{/if}
								</LegendWidgetShell>
							</div>
						</div>
					{/each}
				</div>
			{/key}
		{/if}
	</main>
</div>

<style>
	:global(.grid-stack > .grid-stack-item > .grid-stack-item-content) {
		overflow: visible;
	}

	:global(.grid-stack-placeholder > .placeholder-content) {
		border: 1px dashed var(--color-accent);
		border-radius: 0.375rem;
		background: color-mix(in oklab, var(--color-accent) 10%, transparent);
	}

	:global(.grid-stack-item.ui-draggable-dragging > .grid-stack-item-content),
	:global(.grid-stack-item.ui-resizable-resizing > .grid-stack-item-content) {
		z-index: 40;
		box-shadow: 0 16px 40px color-mix(in oklab, black 24%, transparent);
	}

	:global(.ui-resizable-handle) {
		opacity: 0;
		transition: opacity 120ms ease;
	}

	:global(.grid-stack-item:hover .ui-resizable-handle) {
		opacity: 1;
	}
</style>
