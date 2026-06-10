<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { slugFromId } from '$lib/slug';

	// Shim for the pre-rewrite URL scheme: /advanced?product=ENCHANTED_DIAMOND.
	// Those URLs are indexed and pinned all over; forward them to the new pages.
	const target = $derived.by(() => {
		if (!browser) return null;
		const product = page.url.searchParams.get('product');
		return product ? `/bazaar/${slugFromId(product)}` : '/bazaar';
	});

	$effect(() => {
		if (target) location.replace(target);
	});
</script>

<svelte:head>
	<title>Skytrack</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<p class="text-sm text-muted">
	This page has moved. Continue to <a href="/bazaar" class="text-accent">the bazaar</a>.
</p>
