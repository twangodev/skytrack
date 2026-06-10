<script lang="ts">
	import { site } from '$lib/config';
</script>

<footer class="border-t border-subtle pt-5 text-xs leading-relaxed text-muted">
	<p>
		Not affiliated with Hypixel Inc. or Mojang. Market data from the official
		<a
			href="https://api.hypixel.net"
			class="underline decoration-subtle underline-offset-2 transition-colors hover:text-text"
			>Hypixel API</a
		>. View source on
		<a
			href={site.repo}
			class="underline decoration-subtle underline-offset-2 transition-colors hover:text-text"
			>GitHub</a
		>
		· built by
		<a
			href={site.author.url}
			class="underline decoration-subtle underline-offset-2 transition-colors hover:text-text"
			>{site.author.name}</a
		>.
	</p>
</footer>
