import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CRONS } from './crons';

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

type WranglerConfig = {
	triggers: { crons: string[] };
	compatibility_date: string;
	assets: { binding: string; directory: string };
};

const rootConfig = JSON.parse(
	stripJsonc(
		readFileSync(fileURLToPath(new URL('../../../wrangler.jsonc', import.meta.url)), 'utf8')
	)
) as WranglerConfig;

const pipelineConfig = JSON.parse(
	stripJsonc(readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8'))
) as { triggers?: { crons: string[] } };

const buildConfig = JSON.parse(
	stripJsonc(
		readFileSync(fileURLToPath(new URL('../../../wrangler.build.jsonc', import.meta.url)), 'utf8')
	)
) as WranglerConfig;

describe('CRONS', () => {
	test('matches root wrangler.jsonc triggers.crons exactly', () => {
		expect(new Set(rootConfig.triggers.crons)).toEqual(new Set(Object.values(CRONS)));
		expect(new Set(rootConfig.triggers.crons).size).toBe(3);
		expect(new Set(Object.values(CRONS)).size).toBe(3);
	});

	test('pipeline wrangler.jsonc has no triggers of its own', () => {
		expect(pipelineConfig.triggers).toBeUndefined();
	});
});

describe('wrangler.build.jsonc / wrangler.jsonc config drift', () => {
	test('assets.directory matches', () => {
		expect(buildConfig.assets.directory).toBe(rootConfig.assets.directory);
	});

	test('assets.binding matches', () => {
		expect(buildConfig.assets.binding).toBe(rootConfig.assets.binding);
	});

	test('compatibility_date matches', () => {
		expect(buildConfig.compatibility_date).toBe(rootConfig.compatibility_date);
	});
});
