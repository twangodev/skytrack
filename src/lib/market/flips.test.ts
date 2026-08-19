import { describe, expect, test } from 'vitest';
import { flipQuote, isFlipOpportunity, BAZAAR_TAX, TICK } from './flips';

describe('flipQuote', () => {
	test('wide spread is profitable', () => {
		const quote = flipQuote(1000, 900);
		expect(quote.buyCost).toBeCloseTo(900.1);
		expect(quote.profit).toBeCloseTo((1000 - TICK) * (1 - BAZAAR_TAX) - 900.1);
		expect(quote.profit).toBeGreaterThan(0);
		expect(quote.marginPct).toBeCloseTo((quote.profit / 900.1) * 100);
	});

	test('tight spread loses to tax and ticks', () => {
		const quote = flipQuote(100.5, 100);
		expect(quote.profit).toBeLessThan(0);
	});

	test('matches the previous inline screener math', () => {
		const quote = flipQuote(1331.7, 1262.3);
		expect(quote.profit).toBeCloseTo((1331.7 - 0.1) * 0.9875 - 1262.4);
	});
});

describe('isFlipOpportunity', () => {
	test('rejects paper spreads on dead books', () => {
		const quote = flipQuote(1500, 1000);
		expect(quote.marginPct).toBeGreaterThan(40);
		expect(isFlipOpportunity(quote, 1_000)).toBe(false);
	});

	test('rejects sub-margin churn', () => {
		const quote = flipQuote(101.5, 100);
		expect(isFlipOpportunity(quote, 50_000_000)).toBe(false);
	});

	test('accepts edge with velocity', () => {
		const quote = flipQuote(1100, 1000);
		expect(isFlipOpportunity(quote, 1_000_000)).toBe(true);
	});

	test('rejects tiny totals even when margin and fills clear their floors', () => {
		const quote = flipQuote(11, 10);
		expect(isFlipOpportunity(quote, 55_000)).toBe(false);
	});
});
