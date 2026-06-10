import { expect, test } from 'vitest';
import { itemIdFromBytes } from './nbt';
import fixtures from './fixtures/auction-items.json';

test('decodes a regular item id from real item_bytes', async () => {
	expect(await itemIdFromBytes(fixtures.regular.bytes)).toBe(fixtures.regular.id);
	expect(fixtures.regular.id).toMatch(/^[A-Z0-9_]+$/);
});

test('decodes pets to synthetic PET_ ids', async () => {
	expect(fixtures.pet).not.toBeNull();
	expect(await itemIdFromBytes(fixtures.pet!.bytes)).toBe(fixtures.pet!.id);
	expect(fixtures.pet!.id).toMatch(/^PET_/);
});

test('garbage input resolves null', async () => {
	expect(await itemIdFromBytes('not base64 nbt at all')).toBeNull();
	expect(await itemIdFromBytes('')).toBeNull();
});
