import type { LegendSeries } from '$lib/components/LegendChart.svelte';
import { marketItemKey, type MarketSnapshotJson, type PickedMarketItem } from '$lib/market/client';
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

const withLatestPoint = (points: [number, number][], point: [number, number]) => {
	const last = points.at(-1);
	if (!last || point[0] > last[0]) return [...points, point];
	if (point[0] === last[0]) return [...points.slice(0, -1), point];
	return points;
};

export function withLiveSnapshot(
	series: LegendSeries,
	snapshot: MarketSnapshotJson | null
): LegendSeries {
	let timestamp: number;
	let primary: number;
	let secondary: number;
	if (series.item.kind === 'bazaar') {
		const market = snapshot?.bazaar;
		if (!market) return series;
		timestamp = Math.floor(market.updatedAt / 1000);
		primary = market.snapshot.qs.bp;
		secondary = market.snapshot.qs.sp;
	} else {
		const market = snapshot?.auctions;
		if (!market) return series;
		timestamp = Math.floor(market.updatedAt / 1000);
		primary = market.snapshot.lowestBin;
		secondary = market.snapshot.medianBin;
	}

	return {
		...series,
		points: withLatestPoint(series.points, [timestamp, primary]),
		secondary: series.secondary
			? {
					...series.secondary,
					points: withLatestPoint(series.secondary.points, [timestamp, secondary])
				}
			: undefined
	};
}

export const primaryMetric = (item: PickedMarketItem): string =>
	item.kind === 'bazaar' ? 'Instabuy' : 'Lowest BIN';

export const secondaryMetric = (item: PickedMarketItem): string =>
	item.kind === 'bazaar' ? 'Instasell' : 'Median BIN';
