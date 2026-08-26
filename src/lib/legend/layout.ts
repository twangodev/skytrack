import type { PickedMarketItem } from '$lib/market/client';

export const MAX_LAYOUTS = 9;
export const STORAGE_KEY = 'skytrack:legend-workspace:v1';

export const LINK_GROUPS = ['green', 'blue', 'purple', 'orange'] as const;
export type LinkGroup = (typeof LINK_GROUPS)[number] | null;
export type LegendWidgetType = 'chart' | 'watchlist' | 'snapshot' | 'order-book' | 'history';

export interface LegendWidget {
	id: string;
	type: LegendWidgetType;
	title: string;
	linkGroup: LinkGroup;
	item: PickedMarketItem | null;
	x: number;
	y: number;
	w: number;
	h: number;
	minW: number;
	minH: number;
	style?: 'line' | 'candles';
	comparisons?: PickedMarketItem[];
}

export interface LegendLayout {
	id: string;
	name: string;
	icon: 'chart' | 'monitor' | 'bazaar' | 'custom';
	widgets: LegendWidget[];
}

export interface LegendWorkspaceState {
	version: 1;
	activeLayoutId: string;
	layouts: LegendLayout[];
}

export type LegendPreset = 'chart-spotlight' | 'market-monitor' | 'bazaar-desk' | 'blank';

const defaults: Record<
	LegendWidgetType,
	Pick<LegendWidget, 'title' | 'w' | 'h' | 'minW' | 'minH'>
> = {
	chart: { title: 'Chart', w: 8, h: 7, minW: 4, minH: 4 },
	watchlist: { title: 'Watchlist', w: 3, h: 8, minW: 2, minH: 3 },
	snapshot: { title: 'Snapshot', w: 4, h: 4, minW: 3, minH: 3 },
	'order-book': { title: 'Order book', w: 4, h: 5, minW: 3, minH: 4 },
	history: { title: 'Price history', w: 5, h: 5, minW: 3, minH: 3 }
};

let fallbackId = 0;
export function legendId(prefix: string): string {
	const uuid = globalThis.crypto?.randomUUID?.();
	return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${fallbackId++}`;
}

export function createLegendWidget(
	type: LegendWidgetType,
	item: PickedMarketItem | null,
	overrides: Partial<LegendWidget> = {}
): LegendWidget {
	return {
		id: legendId('widget'),
		type,
		...defaults[type],
		linkGroup: type === 'history' ? null : 'green',
		item,
		x: 0,
		y: 0,
		style: type === 'chart' ? 'line' : undefined,
		comparisons: type === 'chart' ? [] : undefined,
		...overrides
	};
}

export function createLegendLayout(
	preset: LegendPreset,
	item: PickedMarketItem | null,
	name?: string
): LegendLayout {
	const id = legendId('layout');
	if (preset === 'blank') {
		return { id, name: name ?? 'Untitled layout', icon: 'custom', widgets: [] };
	}
	if (preset === 'market-monitor') {
		return {
			id,
			name: name ?? 'Market monitor',
			icon: 'monitor',
			widgets: [
				createLegendWidget('watchlist', item, { x: 0, y: 0, w: 3, h: 10 }),
				createLegendWidget('chart', item, { x: 3, y: 0, w: 5, h: 5 }),
				createLegendWidget('snapshot', item, { x: 8, y: 0, w: 4, h: 5 }),
				createLegendWidget('history', item, {
					x: 3,
					y: 5,
					w: 5,
					h: 5,
					linkGroup: 'green'
				}),
				createLegendWidget('order-book', item, { x: 8, y: 5, w: 4, h: 5 })
			]
		};
	}
	if (preset === 'bazaar-desk') {
		return {
			id,
			name: name ?? 'Bazaar desk',
			icon: 'bazaar',
			widgets: [
				createLegendWidget('watchlist', item, { x: 0, y: 0, w: 3, h: 10 }),
				createLegendWidget('chart', item, { x: 3, y: 0, w: 6, h: 6 }),
				createLegendWidget('snapshot', item, { x: 9, y: 0, w: 3, h: 6 }),
				createLegendWidget('order-book', item, { x: 3, y: 6, w: 5, h: 4 }),
				createLegendWidget('history', item, {
					x: 8,
					y: 6,
					w: 4,
					h: 4,
					linkGroup: 'green'
				})
			]
		};
	}
	return {
		id,
		name: name ?? 'Chart spotlight',
		icon: 'chart',
		widgets: [
			createLegendWidget('chart', item, { x: 0, y: 0, w: 9, h: 10 }),
			createLegendWidget('snapshot', item, { x: 9, y: 0, w: 3, h: 5 }),
			createLegendWidget('watchlist', item, { x: 9, y: 5, w: 3, h: 5 })
		]
	};
}

export function createLegendWorkspace(item: PickedMarketItem | null): LegendWorkspaceState {
	const layout = createLegendLayout('chart-spotlight', item);
	return { version: 1, activeLayoutId: layout.id, layouts: [layout] };
}

export function broadcastLegendItem(
	layouts: LegendLayout[],
	sourceWidgetId: string,
	item: PickedMarketItem
): LegendLayout[] {
	const source = layouts
		.flatMap((layout) => layout.widgets)
		.find((widget) => widget.id === sourceWidgetId);
	if (!source) return layouts;
	return layouts.map((layout) => ({
		...layout,
		widgets: layout.widgets.map((widget) =>
			widget.id === sourceWidgetId ||
			(source.linkGroup !== null && widget.linkGroup === source.linkGroup)
				? { ...widget, item }
				: widget
		)
	}));
}

const widgetTypes = new Set<LegendWidgetType>([
	'chart',
	'watchlist',
	'snapshot',
	'order-book',
	'history'
]);
const groups = new Set<LinkGroup>([...LINK_GROUPS, null]);

function validItem(value: unknown): value is PickedMarketItem | null {
	if (value === null) return true;
	if (typeof value !== 'object' || value === null) return false;
	const item = value as Partial<PickedMarketItem>;
	return (
		typeof item.slug === 'string' &&
		typeof item.name === 'string' &&
		(item.kind === 'bazaar' || item.kind === 'auctions')
	);
}

function validWidget(value: unknown): value is LegendWidget {
	if (typeof value !== 'object' || value === null) return false;
	const widget = value as Partial<LegendWidget>;
	const comparisonsValid =
		widget.comparisons === undefined ||
		(Array.isArray(widget.comparisons) &&
			widget.comparisons.every((item) => validItem(item) && item !== null));
	return (
		typeof widget.id === 'string' &&
		typeof widget.type === 'string' &&
		widgetTypes.has(widget.type as LegendWidgetType) &&
		typeof widget.title === 'string' &&
		groups.has(widget.linkGroup as LinkGroup) &&
		validItem(widget.item) &&
		comparisonsValid &&
		[widget.x, widget.y, widget.w, widget.h, widget.minW, widget.minH].every(
			(value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
		)
	);
}

export function parseLegendWorkspace(raw: string | null): LegendWorkspaceState | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<LegendWorkspaceState>;
		if (parsed.version !== 1 || !Array.isArray(parsed.layouts) || parsed.layouts.length === 0) {
			return null;
		}
		const layouts = parsed.layouts
			.slice(0, MAX_LAYOUTS)
			.filter((layout): layout is LegendLayout => {
				if (typeof layout !== 'object' || layout === null) return false;
				const candidate = layout as Partial<LegendLayout>;
				return (
					typeof candidate.id === 'string' &&
					typeof candidate.name === 'string' &&
					(candidate.icon === 'chart' ||
						candidate.icon === 'monitor' ||
						candidate.icon === 'bazaar' ||
						candidate.icon === 'custom') &&
					Array.isArray(candidate.widgets) &&
					candidate.widgets.every(validWidget)
				);
			});
		if (layouts.length === 0) return null;
		const requested = parsed.activeLayoutId;
		const activeLayoutId = layouts.some((layout) => layout.id === requested)
			? (requested as string)
			: layouts[0].id;
		return { version: 1, activeLayoutId, layouts };
	} catch {
		return null;
	}
}
