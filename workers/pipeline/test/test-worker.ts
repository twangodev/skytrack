// Test-only entrypoint, used in place of ../src/index.ts (see the DEVIATION
// note in vitest.config.ts). pipeline.test.ts exercises src/db.ts directly
// and never dispatches through this handler.
export default {
	async fetch(): Promise<Response> {
		return new Response('test-worker stub - see src/index.ts for the real pipeline entrypoint');
	}
} satisfies ExportedHandler;
