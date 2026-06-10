<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
	<p class="font-mono text-4xl text-muted">{page.status}</p>
	<p class="text-sm text-muted">
		{page.status === 404
			? "This item isn't tracked here."
			: (page.error?.message ?? 'Something went wrong.')}
	</p>
	<a href="/" class="text-sm text-accent transition-colors hover:underline">Back to SkyTrack</a>
</div>
