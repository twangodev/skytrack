export const BAZAAR_TAX = 0.0125;
/** outbid/undercut step the flip strategy assumes */
export const TICK = 0.1;

export interface FlipQuote {
	/** coins paid per item: buy order at instasell + tick */
	buyCost: number;
	/** coins earned per item after tax: sell offer at instabuy - tick */
	profit: number;
	marginPct: number;
}

/** Buy-order to sell-offer flip economics for one product. */
export function flipQuote(bp: number, sp: number): FlipQuote {
	const buyCost = sp + TICK;
	const profit = (bp - TICK) * (1 - BAZAAR_TAX) - buyCost;
	return { buyCost, profit, marginPct: (profit / buyCost) * 100 };
}

/**
 * Nearly every product has a paper-positive spread; wide spreads are exactly
 * what illiquid books look like. An opportunity worth flagging needs edge
 * (margin), velocity (weekly fills on the slower leg), and material total
 * upside. Calibrated against live data: roughly the top fifth of products.
 */
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
