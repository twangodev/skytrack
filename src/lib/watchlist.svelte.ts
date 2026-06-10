export type WatchedItem = { kind: 'bazaar' | 'auctions'; slug: string; name: string };

const STORAGE_KEY = 'skytrack:watchlist';

function load(): WatchedItem[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

let items = $state<WatchedItem[]>(load());

function persist(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
	} catch {
		// storage may be unavailable (private mode, quota) - keep in-memory state
	}
}

export const watchlist = {
	get items(): WatchedItem[] {
		return items;
	},
	has(kind: WatchedItem['kind'], slug: string): boolean {
		return items.some((i) => i.kind === kind && i.slug === slug);
	},
	toggle(item: WatchedItem): void {
		if (this.has(item.kind, item.slug)) {
			items = items.filter((i) => !(i.kind === item.kind && i.slug === item.slug));
		} else {
			items = [...items, item];
		}
		persist();
	}
};
