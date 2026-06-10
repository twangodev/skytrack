<script lang="ts">
	import { formatRelativeTime } from '$lib/format';

	interface Props {
		at: number;
		live?: boolean;
	}

	const { at, live = false }: Props = $props();

	// re-render the relative label periodically
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	const label = $derived.by(() => {
		void now; // re-derive when the clock ticks
		return formatRelativeTime(at);
	});
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
	{#if live}
		<span class="relative flex size-1.5" aria-hidden="true">
			<span class="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60"></span>
			<span class="relative inline-flex size-1.5 rounded-full bg-up"></span>
		</span>
		<span class="text-up">live</span>
	{/if}
	<span>updated {label}</span>
</span>
