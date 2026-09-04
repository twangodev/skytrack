-- Lossless, write-efficient market storage. Current snapshots are split into
-- a handful of bounded rows. Intraday history is accumulated in market/day
-- shards, then transposed into one item/day row without dropping samples.
CREATE TABLE market_snapshot_shards (
	market TEXT NOT NULL CHECK (market IN ('bazaar', 'auctions')),
	shard INTEGER NOT NULL,
	updated INTEGER NOT NULL,
	body TEXT NOT NULL,
	PRIMARY KEY (market, shard)
) WITHOUT ROWID;

CREATE TABLE market_day_shards (
	market TEXT NOT NULL CHECK (market IN ('bazaar', 'auctions')),
	day INTEGER NOT NULL,
	shard INTEGER NOT NULL,
	updated INTEGER NOT NULL,
	version INTEGER NOT NULL DEFAULT 0,
	body TEXT NOT NULL,
	PRIMARY KEY (market, day, shard)
) WITHOUT ROWID;

CREATE TABLE market_item_days (
	market TEXT NOT NULL CHECK (market IN ('bazaar', 'auctions')),
	item TEXT NOT NULL,
	day INTEGER NOT NULL,
	first_t INTEGER NOT NULL,
	last_t INTEGER NOT NULL,
	first_value REAL NOT NULL,
	last_value REAL NOT NULL,
	body TEXT NOT NULL,
	PRIMARY KEY (market, item, day)
) WITHOUT ROWID;
CREATE INDEX market_item_days_market_day ON market_item_days (market, day, item);
