import { expect, test } from 'vitest';
import { slugFromId, buildSlugMap } from './slug';

test('lowercases and hyphenates', () =>
	expect(slugFromId('ENCHANTED_DIAMOND')).toBe('enchanted-diamond'));
test('legacy colon ids', () => expect(slugFromId('INK_SACK:3')).toBe('ink-sack.3'));
test('buildSlugMap inverts', () => {
	const map = buildSlugMap(['ENCHANTED_DIAMOND', 'INK_SACK:3']);
	expect(map.get('enchanted-diamond')).toBe('ENCHANTED_DIAMOND');
	expect(map.get('ink-sack.3')).toBe('INK_SACK:3');
});
test('duplicate ids tolerated', () => {
	expect(() => buildSlugMap(['A_B', 'A_B'])).not.toThrow();
});
test('collision throws', () => {
	expect(() => buildSlugMap(['A_B', 'A-B'])).toThrow(/collision/);
});
