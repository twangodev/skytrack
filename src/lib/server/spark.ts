/** thin the spark payload; ~24 points is plenty at sparkline size */
export function downsample(points: [number, number][], target = 24): [number, number][] {
	if (points.length <= target) return points;
	const step = (points.length - 1) / (target - 1);
	return Array.from({ length: target }, (_, i) => points[Math.round(i * step)]);
}
