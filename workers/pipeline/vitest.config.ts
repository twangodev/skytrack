// DEVIATION from the brief: installed @cloudflare/vitest-pool-workers is
// 0.21.0, which targets vitest 4 and dropped the `/config` subpath +
// defineWorkersConfig entirely (see its dist/codemods/vitest-v3-to-v4.mjs).
// The replacement is a `cloudflareTest(options)` Vite plugin fed into a
// plain vitest/config defineConfig. readD1Migrations + setupFiles +
// TEST_MIGRATIONS binding are unchanged from the brief.
//
// `main` is also overridden to a trivial test-only worker instead of
// inheriting wrangler.jsonc's real `src/index.ts`. Reason: this pool loads
// whatever `main` resolves to into the SAME runtime for every test file, and
// src/index.ts statically imports hypixel/nbt.ts -> prismarine-nbt ->
// protodef -> readable-stream, which this pool's CJS/ESM interop shim cannot
// load (`TypeError: Cannot redefine property: Symbol(nodejs.util.promisify.
// custom)`, thrown just from requiring protodef, independent of whether
// itemIdFromBytes is ever called). Keeping src/index.ts's import static (as
// the brief specifies) matters for production: prismarine-nbt's
// ProtoDefCompiler calls eval() at module top level, which workerd only
// permits during a Worker's startup phase (`allow_eval_during_startup`,
// default-on since compatibility_date 2025-06-01) - not during request
// handling. pipeline.test.ts only exercises src/db.ts directly and never
// dispatches through the worker, so swapping `main` for a stub is safe here.
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
