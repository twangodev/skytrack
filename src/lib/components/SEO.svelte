<script lang="ts">
	import { site } from '$lib/config';

	interface Props {
		title?: string;
		description?: string;
		canonical?: `/${string}` | '/';
		jsonLd?: object | object[];
	}

	const { title, description = site.description, canonical, jsonLd }: Props = $props();

	const fullTitle = $derived(title ? `${title} · ${site.title}` : site.title);

	const schemas = $derived(jsonLd === undefined ? [] : Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	{#if canonical}
		<link rel="canonical" href="{site.url}{canonical === '/' ? '' : canonical}" />
		<meta property="og:url" content="{site.url}{canonical === '/' ? '' : canonical}" />
	{/if}
	<meta property="og:site_name" content={site.title} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	{#each schemas as schema (schema)}
		{@html `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}${'</'}script>`}
	{/each}
</svelte:head>
