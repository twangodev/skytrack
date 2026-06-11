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
