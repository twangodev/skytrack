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

export interface PriceHistoryDatasetOptions {
	name: string;
	url: string;
	description: string;
	dataUrl: string;
	csvUrl: string;
	markdownUrl: string;
	dateModified?: string;
	variables: string[];
	temporalCoverage?: string;
}

export function priceHistoryDatasetSchema(opts: PriceHistoryDatasetOptions): object {
	return {
		'@context': 'https://schema.org',
		'@type': 'Dataset',
		name: opts.name,
		url: opts.url,
		description: opts.description,
		dateModified: opts.dateModified,
		...(opts.temporalCoverage && { temporalCoverage: opts.temporalCoverage }),
		isAccessibleForFree: true,
		creator: {
			'@type': 'Organization',
			name: site.title,
			url: site.url
		},
		includedInDataCatalog: {
			'@type': 'DataCatalog',
			name: `${site.title} Hypixel Skyblock market history`,
			url: `${site.url}/docs`
		},
		variableMeasured: opts.variables,
		distribution: [
			{
				'@type': 'DataDownload',
				contentUrl: opts.dataUrl,
				encodingFormat: 'application/json'
			},
			{
				'@type': 'DataDownload',
				contentUrl: opts.csvUrl,
				encodingFormat: 'text/csv'
			},
			{
				'@type': 'DataDownload',
				contentUrl: opts.markdownUrl,
				encodingFormat: 'text/markdown'
			}
		]
	};
}
