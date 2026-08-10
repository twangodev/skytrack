// DEVIATION from the brief: in @cloudflare/vitest-pool-workers 0.21,
// `cloudflare:test`'s `env` export is typed as `Cloudflare.Env` (a global
// namespace, normally produced by `wrangler types`), not the old
// `declare module 'cloudflare:test' { interface ProvidedEnv }` pattern. This
// file must stay import/export-free (a global script, not a module) so the
// `declare namespace` below augments the ambient global scope rather than a
// module-local one - matching cloudflare/workers-sdk's own vitest-pool-workers
// D1 fixture.
declare namespace Cloudflare {
	interface Env {
		DB: import('@cloudflare/workers-types').D1Database;
		TEST_MIGRATIONS: import('@cloudflare/workers-types').D1Migration[];
	}
}
