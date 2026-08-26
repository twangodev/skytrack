<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { Search } from '@lucide/svelte';

	interface Props {
		query: string;
		placeholder: string;
	}

	let { query, placeholder }: Props = $props();
	let value = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		value = query;
	});

	function navigate() {
		if (timer) clearTimeout(timer);
		const url = new URL(window.location.href);
		const normalized = value.trim();
		if (normalized.length >= 2) url.searchParams.set('q', normalized);
		else url.searchParams.delete('q');
		url.searchParams.delete('page');
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function schedule() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(navigate, 250);
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<form onsubmit={(event) => (event.preventDefault(), navigate())}>
	<label class="flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-1.5">
		<Search size={14} strokeWidth={1.5} class="text-muted" aria-hidden="true" />
		<input
			type="search"
			aria-label={placeholder}
			{placeholder}
			bind:value
			oninput={schedule}
			class="w-48 bg-transparent text-sm outline-none placeholder:text-muted"
		/>
	</label>
</form>
