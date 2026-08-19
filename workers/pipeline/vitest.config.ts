import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
			return {
				main: './test/test-worker.ts',
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: { bindings: { TEST_MIGRATIONS: migrations } }
			};
		})
	],
	test: {
		include: ['test/**/*.test.ts'],
		setupFiles: ['./test/apply-migrations.ts']
	}
});
