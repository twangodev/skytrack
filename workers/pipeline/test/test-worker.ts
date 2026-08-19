export default {
	async fetch(): Promise<Response> {
		return new Response('test-worker stub - see src/index.ts for the real pipeline entrypoint');
	}
} satisfies ExportedHandler;
