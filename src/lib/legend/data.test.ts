import { describe, expect, test } from 'vitest';
import { withLiveSnapshot } from './data';
import type { LegendSeries } from '$lib/components/LegendChart.svelte';
import type { MarketSnapshotJson } from '$lib/market/client';

const bazaarSeries: LegendSeries = {
	key: 'bazaar:wheat',
	item: { slug: 'wheat', name: 'Wheat', kind: 'bazaar' },
	points: [[100, 10]],
	secondary: { label: 'Instasell', points: [[100, 9]] }
};

const bazaarSnapshot: MarketSnapshotJson = {
	name: 'Wheat',
	bazaar: {
		updatedAt: 200_000,
		live: true,
		snapshot: {
			qs: { bp: 12, sp: 11, bv: 1, sv: 1, bmw: 1, smw: 1, bo: 1, so: 1 },
			buy: [],
			sell: []
		}
	}
};

describe('withLiveSnapshot', () => {
	test('appends the latest primary and secondary Bazaar prices', () => {
		const series = withLiveSnapshot(bazaarSeries, bazaarSnapshot);
		expect(series.points).toEqual([
			[100, 10],
			[200, 12]
		]);
		expect(series.secondary?.points).toEqual([
			[100, 9],
			[200, 11]
		]);
	});

	test('does not append a snapshot older than history', () => {
		const series = withLiveSnapshot({ ...bazaarSeries, points: [[300, 13]] }, bazaarSnapshot);
		expect(series.points).toEqual([[300, 13]]);
	});
});
