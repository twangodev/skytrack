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

// Production runs everything (HTTP + crons) on skytrack-site, configured by
// the ROOT wrangler.jsonc; workers/pipeline/wrangler.jsonc is local-dev/tests
// only and must carry no triggers, or crons could silently fork again.
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

// wrangler.build.jsonc is the adapter-facing config (@sveltejs/adapter-cloudflare
// emits its worker to *its* main, so it can't share the root config - see
// wrangler.jsonc's top comment). Its assets block and compatibility_date must
// stay in lockstep with the root config's by hand; this guards that seam.
const buildConfig = JSON.parse(
	stripJsonc(
		readFileSync(fileURLToPath(new URL('../../../wrangler.build.jsonc', import.meta.url)), 'utf8')
	)
) as WranglerConfig;

describe('CRONS', () => {
	// index.ts switches on these exact strings; a cron in wrangler.jsonc with no
	// matching case would throw "unknown cron" on every fire, and a case with no
	// trigger would silently never run.
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
	// The two configs are edited by hand and can't share one file (see
	// wrangler.jsonc's top comment); a mismatch here means the deployed
	// worker's assets binding/directory or compatibility date would silently
	// diverge from what the adapter built against.
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
