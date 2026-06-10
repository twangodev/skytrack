<script lang="ts">
	import { site } from '$lib/config';
	import Logo from './Logo.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
</script>

<header class="flex items-center justify-between gap-4">
	<a
		href="/"
		class="flex items-center gap-1.5 text-sm tracking-wide transition-colors hover:text-accent"
	>
		<Logo size={15} />
		{site.title}
	</a>
	<nav class="flex items-center gap-4 text-sm text-muted">
		<a href="/bazaar" class="transition-colors hover:text-text">bazaar</a>
		<a href="/auctions" class="transition-colors hover:text-text">auctions</a>
		<a href="/flips" class="transition-colors hover:text-text">flips</a>
		<a href="/movers" class="transition-colors hover:text-text">movers</a>
		<a href="/compare" class="transition-colors hover:text-text">compare</a>
		<ThemeToggle />
	</nav>
</header>
