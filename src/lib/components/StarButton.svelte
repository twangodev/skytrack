<script lang="ts">
	import { Star } from '@lucide/svelte';
	import { watchlist, type WatchedItem } from '$lib/watchlist.svelte';

	const { kind, slug, name }: WatchedItem = $props();

	const watched = $derived(watchlist.has(kind, slug));
	const label = $derived(watched ? 'Remove from watchlist' : 'Add to watchlist');
</script>

<button
	type="button"
	onclick={() => watchlist.toggle({ kind, slug, name })}
	title={label}
	aria-label={label}
	class="cursor-pointer self-center text-muted transition-colors hover:text-text focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
>
	<Star size={16} strokeWidth={1.5} class={watched ? 'fill-current text-accent' : undefined} />
</button>
