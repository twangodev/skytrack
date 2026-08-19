import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	kit: { adapter: adapter({ config: 'wrangler.build.jsonc' }) },
	preprocess: vitePreprocess()
};

export default config;
