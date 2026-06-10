export function slugFromId(id: string): string {
	return id.toLowerCase().replaceAll('_', '-').replaceAll(':', '.');
}

export function buildSlugMap(ids: Iterable<string>): Map<string, string> {
	const map = new Map<string, string>();
	for (const id of ids) {
		const slug = slugFromId(id);
		const existing = map.get(slug);
		if (existing !== undefined && existing !== id) {
			throw new Error(`slug collision: ${existing} and ${id} both map to ${slug}`);
		}
		map.set(slug, id);
	}
	return map;
}
