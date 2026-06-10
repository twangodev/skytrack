<script lang="ts">
	import './layout.css';
	import { dev } from '$app/environment';
	import { ModeWatcher } from 'mode-watcher';
	import { onNavigate } from '$app/navigation';
	import { websiteSchema } from '$lib/schema';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<ModeWatcher defaultMode="dark" disableHeadScriptInjection />
<svelte:head>
	{#if !dev}
		<!-- same analytics property the previous site reported to -->
		<script
			defer
			src="https://analytics.twango.dev/script.js"
			data-website-id="e592eb98-f273-4d02-82c4-9b58c67532de"
		></script>
	{/if}
	{@html `<script type="application/ld+json">${JSON.stringify(websiteSchema()).replace(/</g, '\\u003c')}${'</'}script>`}
</svelte:head>

<div class="flex min-h-svh flex-col bg-bg">
	<div
		class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-6 text-text antialiased sm:px-10"
	>
		<Header />
		<main class="flex flex-1 flex-col">
			{@render children()}
		</main>
		<Footer />
	</div>
</div>
