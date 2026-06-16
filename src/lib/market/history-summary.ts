export interface HistoryValuePoint {
	t: number;
	value: number;
}

export interface HistoryExtreme {
	t: number;
	value: number;
}

export interface HistoryWindow {
	seconds: number;
	startAt: number;
	endAt: number;
	start: number;
	end: number;
	change: number;
	changePct: number;
}

export interface HistorySummary {
	sampleCount: number;
	firstTracked: number;
	lastTracked: number;
	low: HistoryExtreme;
	high: HistoryExtreme;
	day: HistoryWindow | null;
	week: HistoryWindow | null;
}

const DAY = 86_400;
const WEEK = 7 * DAY;

function windowSummary(points: HistoryValuePoint[], seconds: number): HistoryWindow | null {
	const end = points[points.length - 1];
	const cutoff = end.t - seconds;
	const start = points.find((point) => point.t >= cutoff) ?? points[0];
	if (start.t === end.t || start.value <= 0) return null;
	return {
		seconds,
		startAt: start.t,
		endAt: end.t,
		start: start.value,
		end: end.value,
		change: end.value - start.value,
		changePct: (end.value - start.value) / start.value
	};
}

export function summarizeHistory(points: HistoryValuePoint[]): HistorySummary | null {
	const clean = points
		.filter((point) => Number.isFinite(point.t) && Number.isFinite(point.value) && point.value > 0)
		.toSorted((a, b) => a.t - b.t);
	if (clean.length === 0) return null;

	let low = clean[0];
	let high = clean[0];
	for (const point of clean) {
		if (point.value < low.value) low = point;
		if (point.value > high.value) high = point;
	}

	return {
		sampleCount: clean.length,
		firstTracked: clean[0].t,
		lastTracked: clean[clean.length - 1].t,
		low,
		high,
		// windowSummary already returns null when the series can't span the window.
		day: windowSummary(clean, DAY),
		week: windowSummary(clean, WEEK)
	};
}
