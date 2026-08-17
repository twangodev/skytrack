import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CRONS } from './crons';

// Strip JSONC comments without touching string contents (`"https://..."` must
// survive). wrangler.jsonc has no comments today; this keeps the test honest
// if one is ever added.
function stripJsonc(text: string): string {
	let out = '';
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			out += c;
			if (c === '\\') out += text[++i] ?? '';
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') {
			inString = true;
			out += c;
		} else if (c === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			out += '\n';
		} else if (c === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
			i++;
		} else {
			out += c;
		}
	}
	return out;
}

const config = JSON.parse(
	stripJsonc(readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8'))
) as { triggers: { crons: string[] } };

describe('CRONS', () => {
	// index.ts switches on these exact strings; a cron in wrangler.jsonc with no
	// matching case would throw "unknown cron" on every fire, and a case with no
	// trigger would silently never run.
	test('matches wrangler.jsonc triggers.crons exactly', () => {
		expect(new Set(config.triggers.crons)).toEqual(new Set(Object.values(CRONS)));
		expect(new Set(config.triggers.crons).size).toBe(3);
		expect(new Set(Object.values(CRONS)).size).toBe(3);
	});
});
