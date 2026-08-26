import { describe, expect, test } from 'vitest';
import { filterByName, normalizeListQuery, paginateRows, parseListPage } from './list';

const rows = [{ name: 'Booster Cookie' }, { name: 'Enchanted Diamond' }, { name: 'Wheat' }];

describe('market list query parsing', () => {
	test('normalizes whitespace and invalid pages', () => {
		expect(normalizeListQuery('  wheat ')).toBe('wheat');
		expect(parseListPage(null)).toBe(1);
		expect(parseListPage('-2')).toBe(1);
		expect(parseListPage('3oops')).toBe(1);
		expect(parseListPage('3')).toBe(3);
	});

	test('keeps one-character queries inactive', () => {
		expect(filterByName(rows, 'w')).toBe(rows);
		expect(filterByName(rows, 'diamond')).toEqual([{ name: 'Enchanted Diamond' }]);
	});
});

describe('market list pagination', () => {
	test('returns the requested page and total', () => {
		expect(paginateRows([1, 2, 3, 4, 5], 2, 2)).toEqual({
			rows: [3, 4],
			page: 2,
			pageSize: 2,
			total: 5
		});
	});

	test('clamps pages after filtering', () => {
		expect(paginateRows([1, 2, 3], 99, 2)).toEqual({
			rows: [3],
			page: 2,
			pageSize: 2,
			total: 3
		});
	});
});
