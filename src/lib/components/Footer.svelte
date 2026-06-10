<script lang="ts">
	import { SiGithub } from '@icons-pack/svelte-simple-icons';
	import { site } from '$lib/config';
</script>

<footer
	class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-subtle pt-5 text-xs leading-relaxed text-muted"
>
	<p>
		Not affiliated with Hypixel Inc. or Mojang. Market data from the official
		<a
			href="https://api.hypixel.net"
			class="underline decoration-subtle underline-offset-2 transition-colors hover:text-text"
			>Hypixel API</a
		>.
	</p>
	<div class="flex items-center gap-3">
		<a
			href={site.repo}
			title="Source on GitHub"
			aria-label="Source on GitHub"
			class="transition-colors hover:text-text"
		>
			<SiGithub size={14} />
		</a>
		<a
			href={site.author.url}
			title="twango.dev"
			aria-label="twango.dev"
			class="font-mono transition-colors hover:text-text"
		>
			td.
		</a>
	</div>
</footer>
