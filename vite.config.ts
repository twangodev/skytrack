import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		// number-flow gates its custom-element base class on esm-env's BROWSER
		// (`BROWSER ? HTMLElement : class {}`). Kit leaves plain-JS deps external
		// in the SSR output, so wrangler's esbuild would resolve that import with
		// the `browser` condition and the worker would throw "HTMLElement is not
		// defined" at module load. Inlining lets Vite resolve esm-env for SSR.
		noExternal: ['number-flow']
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']
	}
});
