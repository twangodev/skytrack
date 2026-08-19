export const BAZAAR_TAX = 0.0125;
export const TICK = 0.1;

export interface FlipQuote {
	buyCost: number;
	profit: number;
	marginPct: number;
}

export function flipQuote(bp: number, sp: number): FlipQuote {
	const buyCost = sp + TICK;
	const profit = (bp - TICK) * (1 - BAZAAR_TAX) - buyCost;
	return { buyCost, profit, marginPct: (profit / buyCost) * 100 };
}

export const OPPORTUNITY = {
	minMarginPct: 2,
	minWeeklyFills: 50_000,
	minWeeklyPotential: 50_000_000
} as const;

export function isFlipOpportunity(quote: FlipQuote, weeklyFills: number): boolean {
	return (
		quote.profit > 0 &&
		quote.marginPct >= OPPORTUNITY.minMarginPct &&
		weeklyFills >= OPPORTUNITY.minWeeklyFills &&
		quote.profit * weeklyFills >= OPPORTUNITY.minWeeklyPotential
	);
}
