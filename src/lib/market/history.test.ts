import { describe, expect, test } from 'vitest';
import {
	encodeNdjson,
	decodeNdjson,
	dayKey,
	compactBazaarDay,
	compactAuctionDay,
	selectStale,
	type BazaarRow,
	type AuctionRow
} from './history';

describe('ndjson codec', () => {
	test('roundtrip', () => {
		const rows: BazaarRow[] = [
			{ t: 1, p: 'A', b: 1.5, s: 1.2 },
			{ t: 2, p: 'B', b: 10, s: 9 }
		];
		expect(decodeNdjson<BazaarRow>(encodeNdjson(rows))).toEqual(rows);
	});

	test('decode skips blank lines', () => {
		expect(decodeNdjson('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
	});
});

describe('dayKey', () => {
	test('utc date from unix seconds', () => {
		// 2026-06-10T00:00:30Z
		expect(dayKey(1781049630)).toBe('2026-06-10');
	});
});

describe('compactBazaarDay', () => {
	test('per-product medians', () => {
		const rows: BazaarRow[] = [
			{ t: 1, p: 'A', b: 1, s: 0.5 },
			{ t: 2, p: 'A', b: 3, s: 1.5 },
			{ t: 3, p: 'A', b: 2, s: 1 },
			{ t: 1, p: 'B', b: 10, s: 9 }
		];
		const out = compactBazaarDay('2026-06-01', rows);
		expect(out).toContainEqual({ d: '2026-06-01', p: 'A', b: 2, s: 1 });
		expect(out).toContainEqual({ d: '2026-06-01', p: 'B', b: 10, s: 9 });
		expect(out).toHaveLength(2);
	});
});

describe('compactAuctionDay', () => {
	test('median prices, max count', () => {
		const rows: AuctionRow[] = [
			{ t: 1, i: 'A', l: 100, m: 200, c: 5 },
			{ t: 2, i: 'A', l: 120, m: 240, c: 9 },
			{ t: 3, i: 'A', l: 110, m: 220, c: 7 }
		];
		const out = compactAuctionDay('2026-06-01', rows);
		expect(out).toEqual([{ d: '2026-06-01', i: 'A', l: 110, m: 220, c: 9 }]);
	});
});

describe('selectStale', () => {
	test('keeps last 7 days and daily.ndjson', () => {
		const files = [
			'daily.ndjson',
			'2026-06-01.ndjson',
			'2026-06-03.ndjson',
			'2026-06-05.ndjson',
			'2026-06-09.ndjson'
		];
		expect(selectStale(files, '2026-06-10')).toEqual(['2026-06-01.ndjson']);
	});

	test('boundary: exactly 7 days old is kept', () => {
		expect(selectStale(['2026-06-03.ndjson'], '2026-06-10')).toEqual([]);
		expect(selectStale(['2026-06-02.ndjson'], '2026-06-10')).toEqual(['2026-06-02.ndjson']);
	});
});
