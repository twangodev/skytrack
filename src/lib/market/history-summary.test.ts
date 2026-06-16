import { describe, expect, test } from 'vitest';
import { summarizeHistory } from './history-summary';

const DAY = 86_400;

describe('summarizeHistory', () => {
	test('summarizes extremes and rolling windows', () => {
		const now = 1_800_000_000;
		const summary = summarizeHistory([
			{ t: now - 8 * DAY, value: 100 },
			{ t: now - 7 * DAY, value: 120 },
			{ t: now - DAY, value: 80 },
			{ t: now, value: 160 }
		]);

		expect(summary?.sampleCount).toBe(4);
		expect(summary?.firstTracked).toBe(now - 8 * DAY);
		expect(summary?.lastTracked).toBe(now);
		expect(summary?.low).toEqual({ t: now - DAY, value: 80 });
		expect(summary?.high).toEqual({ t: now, value: 160 });
		expect(summary?.day?.changePct).toBe(1);
		expect(summary?.week?.changePct).toBeCloseTo(1 / 3);
	});

	test('ignores invalid and zero values', () => {
		expect(
			summarizeHistory([
				{ t: 1, value: 0 },
				{ t: 2, value: Number.NaN },
				{ t: 3, value: 5 }
			])
		)?.toMatchObject({ sampleCount: 1, low: { t: 3, value: 5 } });
	});

	test('returns null for empty histories', () => {
		expect(summarizeHistory([])).toBeNull();
	});
});
