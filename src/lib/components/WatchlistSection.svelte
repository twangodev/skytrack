<script lang="ts">
	import { watchlist } from '$lib/watchlist.svelte';
</script>

{#if watchlist.items.length}
	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium text-muted">Watchlist</h2>
		<div class="grid gap-3 sm:grid-cols-3">
			{#each watchlist.items as item (`${item.kind}/${item.slug}`)}
				<a
					href="/{item.kind}/{item.slug}"
					class="flex flex-col gap-1 rounded-lg border border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent"
				>
					<span class="truncate text-sm">{item.name}</span>
					<span class="font-mono text-[10px] tracking-widest text-muted uppercase">{item.kind}</span
					>
				</a>
			{/each}
		</div>
	</section>
{/if}
