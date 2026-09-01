export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

const DAY = 86_400;

export const RAW_SLICE = 35 * DAY;

export interface ItemSeriesJson {
	bazaar?: { raw: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

const CSV_HEADER = [
	'timestamp',
	'datetime',
	'market',
	'tier',
	'buy',
	'sell',
	'lowest_bin',
	'median_bin',
	'listings'
] as const;

type CsvRow = {
	timestamp: number;
	market: 'bazaar' | 'auctions';
	tier: 'raw' | 'hourly' | 'daily';
	values: (string | number)[];
};

const csvCell = (value: string | number): string => {
	const text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function itemSeriesCsv(json: ItemSeriesJson): string {
	const rows: CsvRow[] = [];
	const addBazaar = (tier: CsvRow['tier'], points: BazaarTuple[]) => {
		for (const [timestamp, buy, sell] of points) {
			rows.push({
				timestamp,
				market: 'bazaar',
				tier,
				values: [
					timestamp,
					new Date(timestamp * 1000).toISOString(),
					'bazaar',
					tier,
					buy,
					sell,
					'',
					'',
					''
				]
			});
		}
	};
	const addAuctions = (tier: CsvRow['tier'], points: AuctionTuple[]) => {
		for (const [timestamp, lowest, median, listings] of points) {
			rows.push({
				timestamp,
				market: 'auctions',
				tier,
				values: [
					timestamp,
					new Date(timestamp * 1000).toISOString(),
					'auctions',
					tier,
					'',
					'',
					lowest,
					median,
					listings
				]
			});
		}
	};

	if (json.bazaar) {
		addBazaar('daily', json.bazaar.daily);
		addBazaar('hourly', json.bazaar.hourly);
		addBazaar('raw', json.bazaar.raw);
	}
	if (json.auctions) {
		addAuctions('daily', json.auctions.daily);
		addAuctions('raw', json.auctions.raw);
	}

	rows.sort(
		(a, b) =>
			a.timestamp - b.timestamp || a.market.localeCompare(b.market) || a.tier.localeCompare(b.tier)
	);
	return [CSV_HEADER, ...rows.map((row) => row.values)]
		.map((row) => row.map(csvCell).join(','))
		.join('\r\n')
		.concat('\r\n');
}

export function mergedSeries(
	json: ItemSeriesJson,
	kind: 'bazaar' | 'auctions'
): [number, number, number][] {
	if (kind === 'bazaar') {
		const tiers = json.bazaar;
		if (!tiers) return [];
		return [...tiers.daily, ...tiers.hourly, ...tiers.raw]
			.map(([t, b, s]) => [t, b, s] as [number, number, number])
			.sort((a, b) => a[0] - b[0]);
	}
	const tiers = json.auctions;
	if (!tiers) return [];
	return [...tiers.daily, ...tiers.raw]
		.map(([t, l, m]) => [t, l, m] as [number, number, number])
		.sort((a, b) => a[0] - b[0]);
}
