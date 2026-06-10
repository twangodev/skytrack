import { z } from 'zod';

export const orderEntry = z.object({
	amount: z.number(),
	pricePerUnit: z.number(),
	orders: z.number()
});

export const quickStatus = z.object({
	buyPrice: z.number(),
	sellPrice: z.number(),
	buyVolume: z.number(),
	sellVolume: z.number(),
	buyMovingWeek: z.number(),
	sellMovingWeek: z.number(),
	buyOrders: z.number(),
	sellOrders: z.number()
});

export const bazaarProduct = z.object({
	product_id: z.string(),
	buy_summary: z.array(orderEntry),
	sell_summary: z.array(orderEntry),
	quick_status: quickStatus
});

export const bazaarResponse = z.object({
	success: z.literal(true),
	lastUpdated: z.number(),
	products: z.record(z.string(), bazaarProduct)
});

export const rawAuction = z.looseObject({
	uuid: z.string(),
	item_name: z.string(),
	tier: z.string(),
	starting_bid: z.number(),
	item_bytes: z.string(),
	bin: z.boolean().optional(),
	claimed: z.boolean().optional()
});

export const auctionsPage = z.looseObject({
	success: z.literal(true),
	page: z.number(),
	totalPages: z.number(),
	lastUpdated: z.number(),
	auctions: z.array(rawAuction)
});

export const resourceItem = z.looseObject({
	id: z.string(),
	name: z.string(),
	tier: z.string().optional(),
	category: z.string().optional(),
	npc_sell_price: z.number().optional()
});

export const itemsResponse = z.looseObject({
	success: z.literal(true),
	lastUpdated: z.number(),
	items: z.array(resourceItem)
});

export type OrderEntry = z.infer<typeof orderEntry>;
export type QuickStatus = z.infer<typeof quickStatus>;
export type BazaarProduct = z.infer<typeof bazaarProduct>;
export type BazaarResponse = z.infer<typeof bazaarResponse>;
export type RawAuction = z.infer<typeof rawAuction>;
export type ResourceItem = z.infer<typeof resourceItem>;
