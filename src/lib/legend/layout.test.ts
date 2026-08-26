import { describe, expect, test } from 'vitest';
import {
	broadcastLegendItem,
	createLegendLayout,
	createLegendWorkspace,
	parseLegendWorkspace,
	type LegendWorkspaceState
} from './layout';

const wheat = { slug: 'wheat', name: 'Wheat', kind: 'bazaar' as const };
const diamond = {
	slug: 'enchanted-diamond',
	name: 'Enchanted Diamond',
	kind: 'bazaar' as const
};

describe('Legend layouts', () => {
	test('creates a chart spotlight with linked widgets', () => {
		const state = createLegendWorkspace(wheat);
		expect(state.layouts).toHaveLength(1);
		expect(state.layouts[0].widgets.map((widget) => widget.type)).toEqual([
			'chart',
			'snapshot',
			'watchlist'
		]);
		expect(state.layouts[0].widgets.every((widget) => widget.linkGroup === 'green')).toBe(true);
	});

	test('creates functional market-monitor geometry', () => {
		const layout = createLegendLayout('market-monitor', wheat);
		expect(layout.widgets).toHaveLength(5);
		expect(layout.widgets.every((widget) => widget.w >= widget.minW)).toBe(true);
		expect(layout.widgets.every((widget) => widget.h >= widget.minH)).toBe(true);
	});

	test('broadcasts a symbol to the same linked group across layouts', () => {
		const first = createLegendLayout('chart-spotlight', wheat);
		const second = createLegendLayout('blank', wheat);
		second.widgets = [
			{ ...first.widgets[0], id: 'linked', linkGroup: 'green' },
			{ ...first.widgets[1], id: 'unlinked', linkGroup: null }
		];
		const layouts = broadcastLegendItem([first, second], first.widgets[0].id, diamond);
		expect(layouts[0].widgets.every((widget) => widget.item?.slug === diamond.slug)).toBe(true);
		expect(layouts[1].widgets[0].item?.slug).toBe(diamond.slug);
		expect(layouts[1].widgets[1].item?.slug).toBe(wheat.slug);
	});
});

describe('parseLegendWorkspace', () => {
	test('round-trips a valid workspace', () => {
		const state = createLegendWorkspace(wheat);
		expect(parseLegendWorkspace(JSON.stringify(state))).toEqual(state);
	});

	test('falls back to the first layout when the active id is stale', () => {
		const state: LegendWorkspaceState = {
			...createLegendWorkspace(wheat),
			activeLayoutId: 'missing'
		};
		const parsed = parseLegendWorkspace(JSON.stringify(state));
		expect(parsed?.activeLayoutId).toBe(parsed?.layouts[0].id);
	});

	test('rejects malformed or unsupported saved state', () => {
		expect(parseLegendWorkspace('{')).toBeNull();
		expect(parseLegendWorkspace(JSON.stringify({ version: 2, layouts: [] }))).toBeNull();
	});
});
