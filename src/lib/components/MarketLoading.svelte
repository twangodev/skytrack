<script lang="ts">
	const { failed = false, onretry }: { failed?: boolean; onretry?: () => void } = $props();
</script>

<div
	class="flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border border-subtle bg-surface px-4 text-sm text-muted"
>
	<p role="status">{failed ? 'Market data is temporarily unavailable.' : 'Loading market data…'}</p>
	{#if failed && onretry}
		<button
			type="button"
			onclick={onretry}
			class="cursor-pointer underline underline-offset-2 hover:text-text">Try again</button
		>
	{/if}
	<noscript
		>Enable JavaScript to view current prices and charts, or use the data links below.</noscript
	>
</div>
