<script lang="ts">
	interface Props {
		tier: string;
	}

	const { tier }: Props = $props();

	// theme-aware tokens defined in layout.css
	const COLORS: Record<string, string> = {
		COMMON: 'var(--color-muted)',
		UNCOMMON: 'var(--rarity-uncommon)',
		RARE: 'var(--rarity-rare)',
		EPIC: 'var(--rarity-epic)',
		LEGENDARY: 'var(--rarity-legendary)',
		MYTHIC: 'var(--rarity-mythic)',
		DIVINE: 'var(--rarity-divine)',
		SPECIAL: 'var(--rarity-special)',
		VERY_SPECIAL: 'var(--rarity-special)'
	};

	const color = $derived(COLORS[tier] ?? 'var(--color-muted)');
	const label = $derived(tier.replaceAll('_', ' '));
</script>

<span class="font-mono text-[10px] tracking-widest uppercase" style="color: {color}">
	{label}
</span>
