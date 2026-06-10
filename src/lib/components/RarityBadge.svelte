<script lang="ts">
	interface Props {
		tier: string;
	}

	const { tier }: Props = $props();

	// Skyblock rarity colors, slightly desaturated to sit in the warm palette
	const COLORS: Record<string, string> = {
		COMMON: 'var(--color-muted)',
		UNCOMMON: '#5fa463',
		RARE: '#4d7fd1',
		EPIC: '#9a5bbd',
		LEGENDARY: '#d1953c',
		MYTHIC: '#c95bb7',
		DIVINE: '#4cb5c4',
		SPECIAL: '#c45959',
		VERY_SPECIAL: '#c45959'
	};

	const color = $derived(COLORS[tier] ?? 'var(--color-muted)');
	const label = $derived(tier.replaceAll('_', ' '));
</script>

<span
	class="font-mono text-[10px] tracking-widest uppercase"
	style="color: {color}"
>
	{label}
</span>
