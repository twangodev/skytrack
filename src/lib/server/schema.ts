import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AuctionItemStats, BazaarProductSnapshot } from '$lib/market/aggregate';

export const items = sqliteTable('items', {
	id: text('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	tier: text('tier'),
	category: text('category'),
	npc: real('npc')
});

export const bazaarPoints = sqliteTable(
	'bazaar_points',
	{
		item: text('item').notNull(),
		tier: integer('tier').notNull(),
		t: integer('t').notNull(),
		buy: real('buy').notNull(),
		sell: real('sell').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.item, table.tier, table.t] }),
		index('bazaar_points_tier_t').on(table.tier, table.t)
	]
);

export const auctionPoints = sqliteTable(
	'auction_points',
	{
		item: text('item').notNull(),
		tier: integer('tier').notNull(),
		t: integer('t').notNull(),
		lowest: real('lowest').notNull(),
		median: real('median').notNull(),
		count: integer('count').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.item, table.tier, table.t] }),
		index('auction_points_tier_t').on(table.tier, table.t)
	]
);

export const bazaarSnapshots = sqliteTable('bazaar_snapshot', {
	item: text('item').primaryKey(),
	body: text('body', { mode: 'json' }).$type<BazaarProductSnapshot>().notNull(),
	updated: integer('updated').notNull()
});

export const auctionSnapshots = sqliteTable('auction_snapshot', {
	item: text('item').primaryKey(),
	body: text('body', { mode: 'json' }).$type<AuctionItemStats>().notNull(),
	updated: integer('updated').notNull()
});

export const marketSnapshotShards = sqliteTable(
	'market_snapshot_shards',
	{
		market: text('market', { enum: ['bazaar', 'auctions'] }).notNull(),
		shard: integer('shard').notNull(),
		updated: integer('updated').notNull(),
		body: text('body', { mode: 'json' }).$type<Record<string, unknown>>().notNull()
	},
	(table) => [primaryKey({ columns: [table.market, table.shard] })]
);

export const marketDayShards = sqliteTable(
	'market_day_shards',
	{
		market: text('market', { enum: ['bazaar', 'auctions'] }).notNull(),
		day: integer('day').notNull(),
		shard: integer('shard').notNull(),
		updated: integer('updated').notNull(),
		version: integer('version').notNull().default(0),
		body: text('body', { mode: 'json' }).$type<Record<string, unknown>>().notNull()
	},
	(table) => [primaryKey({ columns: [table.market, table.day, table.shard] })]
);

export const marketItemDays = sqliteTable(
	'market_item_days',
	{
		market: text('market', { enum: ['bazaar', 'auctions'] }).notNull(),
		item: text('item').notNull(),
		day: integer('day').notNull(),
		firstT: integer('first_t').notNull(),
		lastT: integer('last_t').notNull(),
		firstValue: real('first_value').notNull(),
		lastValue: real('last_value').notNull(),
		body: text('body', { mode: 'json' }).$type<unknown[]>().notNull()
	},
	(table) => [
		primaryKey({ columns: [table.market, table.item, table.day] }),
		index('market_item_days_market_day').on(table.market, table.day, table.item)
	]
);

export const metadata = sqliteTable('meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
