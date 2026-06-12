<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { formatPrice } from '$lib/format';

	interface Props {
		page: number;
		pageSize: number;
		total: number;
	}

	let { page = $bindable(), pageSize, total }: Props = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
	// clamp for display only; the prop is mutated solely by prev/next clicks
	const current = $derived(Math.min(Math.max(1, page), totalPages));
	const start = $derived(total === 0 ? 0 : (current - 1) * pageSize + 1);
	const end = $derived(Math.min(current * pageSize, total));

	const buttonClass =
		'flex cursor-pointer items-center gap-1 rounded-md border border-subtle bg-surface px-2.5 py-1 transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted';
</script>

{#if total > pageSize}
	<nav class="flex items-center justify-between gap-4 text-xs text-muted" aria-label="Pagination">
		<span class="whitespace-nowrap">
			{formatPrice(start)}–{formatPrice(end)} of {formatPrice(total)}
		</span>
		<div class="flex items-center gap-3">
			<button
				type="button"
				aria-label="Previous page"
				disabled={current <= 1}
				onclick={() => (page = current - 1)}
				class={buttonClass}
			>
				<ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
				Prev
			</button>
			<span class="whitespace-nowrap">
				page {formatPrice(current)} of {formatPrice(totalPages)}
			</span>
			<button
				type="button"
				aria-label="Next page"
				disabled={current >= totalPages}
				onclick={() => (page = current + 1)}
				class={buttonClass}
			>
				Next
				<ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
			</button>
		</div>
	</nav>
{/if}
