import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
	decodeNdjson,
	type BazaarRow,
	type AuctionRow,
	type BazaarDailyRow,
	type AuctionDailyRow
} from '$lib/market/history';
import type { BazaarProductSnapshot, AuctionItemStats } from '$lib/market/aggregate';
import { buildSlugMap } from '$lib/slug';

export interface ItemMeta {
	name: string;
	tier?: string;
	category?: string;
	npc?: number;
}

export interface BazaarFile {
	lastUpdated: number;
	products: Record<string, BazaarProductSnapshot>;
}

export interface AuctionsFile {
	lastUpdated: number;
	items: Record<string, AuctionItemStats>;
}

export type BazaarHistoryPoint = { t: number; b: number; s: number };
export type AuctionHistoryPoint = { t: number; l: number; m: number; c: number };

const DATA_DIR = 'src/lib/data';
const HISTORY_DIR = 'data/history';

// Module-level caches: ~4k prerendered pages hit these loaders; parse once.
const cache = new Map<string, unknown>();

function cached<T>(key: string, compute: () => T): T {
	if (!cache.has(key)) cache.set(key, compute());
	return cache.get(key) as T;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const loadItems = () => cached('items', () => readJson<Record<string, ItemMeta>>(`${DATA_DIR}/items.json`));
export const loadBazaar = () => cached('bazaar', () => readJson<BazaarFile>(`${DATA_DIR}/bazaar.json`));
export const loadAuctions = () => cached('auctions', () => readJson<AuctionsFile>(`${DATA_DIR}/auctions.json`));

export const bazaarSlugMap = () =>
	cached('bazaarSlugs', () => buildSlugMap(Object.keys(loadBazaar().products)));
export const auctionSlugMap = () =>
	cached('auctionSlugs', () => buildSlugMap(Object.keys(loadAuctions().items)));

function readHistoryRows<T>(kind: 'bazaar' | 'auctions'): { daily: T[]; recent: T[] } {
	return cached(`history:${kind}`, () => {
		const dir = `${HISTORY_DIR}/${kind}`;
		if (!existsSync(dir)) return { daily: [] as T[], recent: [] as T[] };
		const daily: T[] = [];
		const recent: T[] = [];
		for (const name of readdirSync(dir).sort()) {
			if (!name.endsWith('.ndjson')) continue;
			const rows = decodeNdjson<T>(readFileSync(`${dir}/${name}`, 'utf8'));
			(name === 'daily.ndjson' ? daily : recent).push(...rows);
		}
		return { daily, recent };
	});
}

const NOON_UTC = 12 * 3600;
const dateToT = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) + NOON_UTC;

function groupHistory<Row, Daily, Point>(
	kind: 'bazaar' | 'auctions',
	idOfRow: (r: Row) => string,
	idOfDaily: (r: Daily) => string,
	pointOfRow: (r: Row) => Point,
	pointOfDaily: (r: Daily) => Point
): Map<string, Point[]> {
	return cached(`grouped:${kind}`, () => {
		const { daily, recent } = readHistoryRows<unknown>(kind);
		const map = new Map<string, Point[]>();
		const push = (id: string, point: Point) => {
			const list = map.get(id) ?? [];
			list.push(point);
			map.set(id, list);
		};
		for (const row of daily as Daily[]) push(idOfDaily(row), pointOfDaily(row));
		for (const row of recent as Row[]) push(idOfRow(row), pointOfRow(row));
		return map;
	});
}

export function bazaarHistory(productId: string): BazaarHistoryPoint[] {
	return (
		groupHistory<BazaarRow, BazaarDailyRow, BazaarHistoryPoint>(
			'bazaar',
			(r) => r.p,
			(r) => r.p,
			(r) => ({ t: r.t, b: r.b, s: r.s }),
			(r) => ({ t: dateToT(r.d), b: r.b, s: r.s })
		).get(productId) ?? []
	);
}

export function auctionHistory(itemId: string): AuctionHistoryPoint[] {
	return (
		groupHistory<AuctionRow, AuctionDailyRow, AuctionHistoryPoint>(
			'auctions',
			(r) => r.i,
			(r) => r.i,
			(r) => ({ t: r.t, l: r.l, m: r.m, c: r.c }),
			(r) => ({ t: dateToT(r.d), l: r.l, m: r.m, c: r.c })
		).get(itemId) ?? []
	);
}
