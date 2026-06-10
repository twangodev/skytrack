import type { WithContext, WebSite, BreadcrumbList, ItemPage } from 'schema-dts';
import { site } from '$lib/config';

export function websiteSchema(): WithContext<WebSite> {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: site.title,
		url: site.url,
		description: site.description,
		potentialAction: {
			'@type': 'SearchAction',
			target: `${site.url}/?q={search_term_string}`,
			// @ts-expect-error query-input is required by Google but missing from schema-dts
			'query-input': 'required name=search_term_string'
		}
	};
}

export interface BreadcrumbItem {
	name: string;
	url: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): WithContext<BreadcrumbList> {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: item.url
		}))
	};
}

export interface ItemPageOptions {
	name: string;
	url: string;
	description: string;
}

export function itemPageSchema(opts: ItemPageOptions): WithContext<ItemPage> {
	return {
		'@context': 'https://schema.org',
		'@type': 'ItemPage',
		name: opts.name,
		url: opts.url,
		description: opts.description,
		isPartOf: {
			'@type': 'WebSite',
			name: site.title,
			url: site.url
		}
	};
}
