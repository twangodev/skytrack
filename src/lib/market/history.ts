import { median } from './aggregate';

export type BazaarRow = { t: number; p: string; b: number; s: number };
export type AuctionRow = { t: number; i: string; l: number; m: number; c: number };
export type BazaarDailyRow = { d: string; p: string; b: number; s: number };
export type AuctionDailyRow = { d: string; i: string; l: number; m: number; c: number };

export function encodeNdjson(rows: object[]): string {
	return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

export function decodeNdjson<T>(text: string): T[] {
	return text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as T);
}

export function dayKey(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = grouped.get(k) ?? [];
		list.push(row);
		grouped.set(k, list);
	}
	return grouped;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function compactBazaarDay(date: string, rows: BazaarRow[]): BazaarDailyRow[] {
	return [...groupBy(rows, (r) => r.p)].map(([p, list]) => ({
		d: date,
		p,
		b: round1(median(list.map((r) => r.b))),
		s: round1(median(list.map((r) => r.s)))
	}));
}

export function compactAuctionDay(date: string, rows: AuctionRow[]): AuctionDailyRow[] {
	return [...groupBy(rows, (r) => r.i)].map(([i, list]) => ({
		d: date,
		i,
		l: Math.round(median(list.map((r) => r.l))),
		m: Math.round(median(list.map((r) => r.m))),
		c: Math.max(...list.map((r) => r.c))
	}));
}

/** Day files older than keepDays (by filename date) — never daily.ndjson. */
export function selectStale(fileNames: string[], today: string, keepDays = 7): string[] {
	const cutoffMs = Date.parse(`${today}T00:00:00Z`) - keepDays * 86_400_000;
	return fileNames
		.filter((name) => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(name))
		.filter((name) => Date.parse(`${name.slice(0, 10)}T00:00:00Z`) < cutoffMs)
		.sort();
}
