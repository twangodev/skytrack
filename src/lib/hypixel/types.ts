import { z } from 'zod';

const orderEntry = z.object({
	amount: z.number(),
	pricePerUnit: z.number(),
	orders: z.number()
});

const quickStatus = z.object({
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

const rawAuction = z.object({
	uuid: z.string(),
	item_name: z.string(),
	tier: z.string(),
	starting_bid: z.number(),
	item_bytes: z.string(),
	bin: z.boolean().optional(),
	claimed: z.boolean().optional()
});

export const auctionsPage = z.object({
	success: z.literal(true),
	page: z.number(),
	totalPages: z.number(),
	lastUpdated: z.number(),
	auctions: z.array(rawAuction)
});

const resourceItem = z.object({
	id: z.string(),
	name: z.string(),
	tier: z.string().optional(),
	category: z.string().optional(),
	npc_sell_price: z.number().optional()
});

export const itemsResponse = z.object({
	success: z.literal(true),
	lastUpdated: z.number(),
	items: z.array(resourceItem)
});

type OrderEntry = z.infer<typeof orderEntry>;
type QuickStatus = z.infer<typeof quickStatus>;
export type BazaarProduct = z.infer<typeof bazaarProduct>;
type BazaarResponse = z.infer<typeof bazaarResponse>;
export type RawAuction = z.infer<typeof rawAuction>;
type ResourceItem = z.infer<typeof resourceItem>;
