<script lang="ts">
	import './layout.css';
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
