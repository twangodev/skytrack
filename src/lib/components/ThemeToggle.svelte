<script lang="ts">
	import { toggleMode, mode } from 'mode-watcher';
	import { Sun, Moon } from '@lucide/svelte';

	const Icon = $derived(mode.current === 'light' ? Moon : Sun);
	const label = $derived(mode.current === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
</script>

<button
	type="button"
	onclick={toggleMode}
	title={label}
	aria-label={label}
	class="cursor-pointer transition-colors hover:text-text focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
>
	<Icon size={14} strokeWidth={1.5} />
</button>
