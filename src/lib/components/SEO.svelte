<script lang="ts">
	import { site } from '$lib/config';

	interface Props {
		title?: string;
		description?: string;
		canonical?: `/${string}` | '/';
		/** markdown alternate of this page */
		markdown?: `/${string}`;
		jsonLd?: object | object[];
	}

	const { title, description = site.description, canonical, markdown, jsonLd }: Props = $props();

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
	{#if markdown}
		<link rel="alternate" type="text/markdown" href="{site.url}{markdown}" />
	{/if}
	<meta property="og:site_name" content={site.title} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="{site.url}/icon-512.png" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:image" content="{site.url}/icon-512.png" />
	{#each schemas as schema (schema)}
		{@html `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}${'</'}script>`}
	{/each}
</svelte:head>
