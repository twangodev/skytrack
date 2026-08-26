export const MARKET_PAGE_SIZE = 100;

export function normalizeListQuery(value: string | null): string {
	return value?.trim() ?? '';
}

export function parseListPage(value: string | null): number {
	const page = Number(value);
	return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function filterByName<T extends { name: string }>(rows: T[], query: string): T[] {
	if (query.length < 2) return rows;
	const needle = query.toLowerCase();
	return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

export function paginateRows<T>(
	rows: T[],
	requestedPage: number,
	pageSize = MARKET_PAGE_SIZE
): { rows: T[]; page: number; pageSize: number; total: number } {
	const total = rows.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const page = Math.min(Math.max(1, requestedPage), totalPages);
	const start = (page - 1) * pageSize;
	return { rows: rows.slice(start, start + pageSize), page, pageSize, total };
}
