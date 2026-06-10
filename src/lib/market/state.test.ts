import { describe, expect, test } from 'vitest';
import {
	encodeStateFile,
	decodeStateFile,
	appendSnapshot,
	rollup,
	validateGrowth,
	stateStats,
	emptyState,
	totalPoints,
	RAW_WINDOW,
	HOURLY_WINDOW,
	type MarketState,
	type BazaarPoint
} from './state';

describe('proto round-trip', () => {
	test('bazaar points survive', () => {
		const points = [
			{ t: 1781000000, b: 1276.8, s: 1256.7 },
			{ t: 1781000900, b: 1277.0, s: 1255.0 }
		];
		const file = encodeStateFile('bazaar', 'raw', new Map([['ENCHANTED_DIAMOND', points]]));
		const back = decodeStateFile(file);
		expect(back.kind).toBe('bazaar');
		expect(back.tier).toBe('raw');
		expect(back.items.get('ENCHANTED_DIAMOND')).toEqual(points);
	});

	test('auction points with >430M prices survive', () => {
		const points = [{ t: 1781000000, l: 530_000_000, m: 1_381_500_000, c: 32 }];
		const file = encodeStateFile('auctions', 'raw', new Map([['HYPERION', points]]));
		expect(decodeStateFile(file).items.get('HYPERION')).toEqual(points);
	});

	test('empty file', () => {
		const file = encodeStateFile('bazaar', 'daily', new Map());
		expect(decodeStateFile(file).items.size).toBe(0);
	});

	test('random series round-trip', () => {
		const points = Array.from({ length: 500 }, (_, i) => ({
			t: 1781000000 + i * 900 + Math.floor(Math.random() * 60),
			b: Math.round(Math.random() * 1e10) / 10,
			s: Math.round(Math.random() * 1e10) / 10
		}));
		const file = encodeStateFile('bazaar', 'raw', new Map([['X', points]]));
		expect(decodeStateFile(file).items.get('X')).toEqual(points);
	});
});

const DAY = 86_400;
const HOUR = 3_600;

function stateWithBazaarRaw(points: Record<string, BazaarPoint[]>): MarketState {
	const state = emptyState();
	for (const [id, list] of Object.entries(points)) state.bazaar.raw.set(id, list);
	return state;
}

describe('appendSnapshot', () => {
	test('appends in order and dedups identical timestamps', () => {
		const state = emptyState();
		appendSnapshot(state, 'bazaar', new Map([['A', { t: 100, b: 1, s: 0.5 }]]));
		appendSnapshot(state, 'bazaar', new Map([['A', { t: 100, b: 1, s: 0.5 }]]));
		appendSnapshot(state, 'bazaar', new Map([['A', { t: 200, b: 2, s: 1 }]]));
		expect(state.bazaar.raw.get('A')).toEqual([
			{ t: 100, b: 1, s: 0.5 },
			{ t: 200, b: 2, s: 1 }
		]);
	});
});

describe('rollup', () => {
	test('raw older than RAW_WINDOW becomes hourly medians', () => {
		const now = 1781000000;
		const oldHour = now - RAW_WINDOW - 10 * DAY;
		const base = Math.floor(oldHour / HOUR) * HOUR;
		const state = stateWithBazaarRaw({
			A: [
				{ t: base + 60, b: 1, s: 0.5 },
				{ t: base + 120, b: 3, s: 1.5 },
				{ t: base + 180, b: 2, s: 1 },
				{ t: now, b: 9, s: 8 } // fresh, stays raw
			]
		});
		rollup(state, now);
		expect(state.bazaar.raw.get('A')).toEqual([{ t: now, b: 9, s: 8 }]);
		expect(state.bazaar.hourly.get('A')).toEqual([{ t: base, b: 2, s: 1 }]);
	});

	test('hourly older than HOURLY_WINDOW becomes daily medians', () => {
		const now = 1781000000;
		const oldDay = now - HOURLY_WINDOW - 10 * DAY;
		const dayBase = Math.floor(oldDay / DAY) * DAY;
		const state = emptyState();
		state.bazaar.hourly.set('A', [
			{ t: dayBase + HOUR, b: 10, s: 5 },
			{ t: dayBase + 2 * HOUR, b: 30, s: 15 },
			{ t: dayBase + 3 * HOUR, b: 20, s: 10 }
		]);
		rollup(state, now);
		expect(state.bazaar.hourly.get('A') ?? []).toEqual([]);
		expect(state.bazaar.daily.get('A')).toEqual([{ t: dayBase, b: 20, s: 10 }]);
	});

	test('incremental runs preserve the bucket median (no last-sample overwrite)', () => {
		// the same hour spilled across two consecutive runs must produce the
		// same hourly median as spilling it all at once
		const HOURLY_CUTOVER = RAW_WINDOW;
		const base = Math.floor(1781000000 / HOUR) * HOUR;
		const points = [
			{ t: base + 300, b: 1, s: 0.5 },
			{ t: base + 900, b: 9, s: 8 },
			{ t: base + 1500, b: 2, s: 1 }
		];
		const incremental = stateWithBazaarRaw({ A: [...points] });
		// run 1: cutoff lands mid-hour - nothing may spill yet
		rollup(incremental, base + 900 + HOURLY_CUTOVER);
		expect(incremental.bazaar.hourly.get('A') ?? []).toEqual([]);
		expect(incremental.bazaar.raw.get('A')).toHaveLength(3);
		// run 2: the hour is complete - all three points spill together
		rollup(incremental, base + HOUR + HOURLY_CUTOVER);
		expect(incremental.bazaar.hourly.get('A')).toEqual([{ t: base, b: 2, s: 1 }]);
	});

	test('auction raw rolls straight to daily with max count', () => {
		const now = 1781000000;
		const oldDay = now - RAW_WINDOW - 10 * DAY;
		const dayBase = Math.floor(oldDay / DAY) * DAY;
		const state = emptyState();
		state.auctions.raw.set('H', [
			{ t: dayBase + HOUR, l: 100, m: 200, c: 5 },
			{ t: dayBase + 4 * HOUR, l: 120, m: 240, c: 9 },
			{ t: dayBase + 8 * HOUR, l: 110, m: 220, c: 7 }
		]);
		rollup(state, now);
		expect(state.auctions.raw.get('H') ?? []).toEqual([]);
		expect(state.auctions.daily.get('H')).toEqual([{ t: dayBase, l: 110, m: 220, c: 9 }]);
	});
});

describe('validateGrowth', () => {
	const prev = stateWithBazaarRaw({
		A: Array.from({ length: 100 }, (_, i) => ({ t: 1000 + i, b: 1, s: 1 }))
	});

	test('rejects shrunken state', () => {
		const next = stateWithBazaarRaw({
			A: Array.from({ length: 50 }, (_, i) => ({ t: 1000 + i, b: 1, s: 1 }))
		});
		expect(() => validateGrowth(stateStats(prev), next)).toThrow(/shrank/);
	});

	test('rejects timestamp regression', () => {
		const next = stateWithBazaarRaw({
			A: Array.from({ length: 100 }, (_, i) => ({ t: 500 + i, b: 1, s: 1 }))
		});
		expect(() => validateGrowth(stateStats(prev), next)).toThrow(/regressed/);
	});

	test('accepts grown state', () => {
		const next = stateWithBazaarRaw({
			A: Array.from({ length: 101 }, (_, i) => ({ t: 1000 + i, b: 1, s: 1 }))
		});
		expect(() => validateGrowth(stateStats(prev), next)).not.toThrow();
	});

	test('tolerates tiny shrink within 2%', () => {
		// one point lost from the front; latest timestamp unchanged
		const next = stateWithBazaarRaw({
			A: Array.from({ length: 99 }, (_, i) => ({ t: 1001 + i, b: 1, s: 1 }))
		});
		expect(() => validateGrowth(stateStats(prev), next)).not.toThrow();
	});

	test('totalPoints counts across kinds and tiers', () => {
		expect(totalPoints(prev)).toBe(100);
	});
});
