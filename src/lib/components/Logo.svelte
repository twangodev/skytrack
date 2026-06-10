<script lang="ts">
	interface Props {
		size?: number;
	}

	// the Skytrack mark - Minecraft stairs as a rising chart, with the next
	// step floating above. Keep in sync with static/favicon.svg and
	// scripts/generate-icons.ts. Drawn in currentColor.
	const { size = 16 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
	<path d="M4 28 V23 H10 V17 H16 V11 H22 V28 Z" />
	<rect x="24" y="4" width="5" height="5" />
</svg>
