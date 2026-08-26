import type { LegendSeries } from '$lib/components/LegendChart.svelte';
import { marketItemKey, type PickedMarketItem } from '$lib/market/client';
import { mergedSeries, type ItemSeriesJson } from '$lib/market/series';

export function legendSeries(item: PickedMarketItem, json: ItemSeriesJson): LegendSeries {
	const merged = mergedSeries(json, item.kind);
	return {
		key: marketItemKey(item),
		item,
		points: merged.map(([timestamp, primary]) => [timestamp, primary]),
		secondary: {
			label: item.kind === 'bazaar' ? 'Instasell' : 'Median BIN',
			points: merged.map(([timestamp, , secondary]) => [timestamp, secondary])
		}
	};
}

export const primaryMetric = (item: PickedMarketItem): string =>
	item.kind === 'bazaar' ? 'Instabuy' : 'Lowest BIN';

export const secondaryMetric = (item: PickedMarketItem): string =>
	item.kind === 'bazaar' ? 'Instasell' : 'Median BIN';
