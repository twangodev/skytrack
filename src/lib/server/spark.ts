const WEEK = 604_800;

/** thin the spark payload; ~24 points is plenty at sparkline size */
export function downsample(points: [number, number][], target = 24): [number, number][] {
	if (points.length <= target) return points;
	const step = (points.length - 1) / (target - 1);
	return Array.from({ length: target }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Trailing-7d sparkline values for listing tables: window relative to the
 * newest point, downsample to 12, drop timestamps, round to 4 sig figs.
 */
export function spark7d(points: [number, number][]): number[] {
	if (points.length === 0) return [];
	const cutoff = points[points.length - 1][0] - WEEK;
	const recent = points.filter(([t]) => t >= cutoff);
	if (recent.length < 2) return [];
	return downsample(recent, 12).map(([, v]) => Number(v.toPrecision(4)));
}
