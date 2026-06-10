import { describe, expect, test } from 'vitest';
import { formatCompact, formatPrice, formatRelativeTime, titleCase } from './format';

describe('formatCompact', () => {
	test('small numbers unchanged', () => expect(formatCompact(999)).toBe('999'));
	test('thousands', () => expect(formatCompact(1_234)).toBe('1.23K'));
	test('millions', () => expect(formatCompact(5_600_000)).toBe('5.6M'));
	test('billions', () => expect(formatCompact(12_345_678_901)).toBe('12.3B'));
	test('trims trailing zeros', () => expect(formatCompact(2_000)).toBe('2K'));
	test('rounds up across unit boundary', () => expect(formatCompact(1_999_999)).toBe('2M'));
	test('hundreds of a unit drop decimals', () => expect(formatCompact(123_456_789)).toBe('123M'));
	test('zero', () => expect(formatCompact(0)).toBe('0'));
});

describe('formatPrice', () => {
	test('coins with decimals', () => expect(formatPrice(8.9)).toBe('8.9'));
	test('integer coins grouped', () => expect(formatPrice(1234567)).toBe('1,234,567'));
	test('large prices grouped not compacted', () =>
		expect(formatPrice(123456789.5)).toBe('123,456,789.5'));
	test('drops .0', () => expect(formatPrice(12)).toBe('12'));
});

describe('formatRelativeTime', () => {
	test('just now', () => expect(formatRelativeTime(Date.now() - 10_000)).toBe('just now'));
	test('minutes ago', () =>
		expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5 minutes ago'));
	test('singular minute', () =>
		expect(formatRelativeTime(Date.now() - 61_000)).toBe('1 minute ago'));
	test('hours ago', () =>
		expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toBe('3 hours ago'));
	test('days ago', () =>
		expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('2 days ago'));
});

describe('titleCase', () => {
	test('product ids', () => expect(titleCase('ENCHANTED_DIAMOND')).toBe('Enchanted Diamond'));
	test('legacy colon ids', () => expect(titleCase('INK_SACK:3')).toBe('Ink Sack 3'));
});
