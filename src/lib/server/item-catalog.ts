import catalog from './item-catalog.json';
import type { MarketKind } from '../market/client';

const items = new Map(
	catalog.map(([kind, slug, name, tier]) => [
		`${kind}:${slug}`,
		{ slug: slug!, name: name!, tier: tier ?? undefined }
	])
);

export function catalogItem(kind: MarketKind, slug: string) {
	return items.get(`${kind}:${slug}`);
}

export function catalogEntries(kind: MarketKind): { slug: string }[] {
	return catalog.filter(([market]) => market === kind).map(([, slug]) => ({ slug: slug! }));
}
