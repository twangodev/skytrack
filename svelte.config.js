import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		// Root-domain deploy: emit absolute /_app/... asset URLs. Relative paths
		// (the default) are computed per page depth and race under prerender
		// concurrency, and would break the SPA 404.html fallback at deep paths.
		paths: {
			relative: false
		},
		prerender: {
			concurrency: 8
		}
	},
	preprocess: vitePreprocess()
};

export default config;
