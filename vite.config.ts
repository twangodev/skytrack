import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Market snapshots are gitignored build inputs; fetch them if missing so a
// fresh checkout can build. The fetch script no-ops when data is fresh.
function ensureMarketData(): Plugin {
	return {
		name: 'ensure-market-data',
		buildStart() {
			if (!existsSync('src/lib/data/bazaar.json')) {
				execSync('bun scripts/fetch-data.ts', { stdio: 'inherit' });
			}
		}
	};
}

export default defineConfig({
	plugins: [ensureMarketData(), tailwindcss(), sveltekit()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
	}
});
