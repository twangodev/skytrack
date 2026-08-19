import nbt from 'prismarine-nbt';

export async function itemIdFromBytes(itemBytes: string): Promise<string | null> {
	try {
		const buf = Buffer.from(itemBytes, 'base64');
		const { parsed } = await nbt.parse(buf);
		const simple = nbt.simplify(parsed) as {
			i?: Array<{ tag?: { ExtraAttributes?: Record<string, unknown> } }>;
		};
		const extra = simple.i?.[0]?.tag?.ExtraAttributes;
		const id = extra?.id;
		if (typeof id !== 'string') return null;
		if (id === 'PET' && typeof extra?.petInfo === 'string') {
			const pet = JSON.parse(extra.petInfo) as { type?: string };
			if (pet.type) return `PET_${pet.type}`;
		}
		if (id === 'RUNE' && extra?.runes && typeof extra.runes === 'object') {
			const [runeKey] = Object.keys(extra.runes as object);
			if (runeKey) return `RUNE_${runeKey}`;
		}
		return id;
	} catch {
		return null;
	}
}
