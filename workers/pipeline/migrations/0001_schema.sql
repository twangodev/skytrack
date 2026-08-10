-- Every item id ever tracked (bazaar products, auction items incl. synthetic
-- PET_/RUNE_ ids). UNIQUE(slug) is the cross-kind slug-collision guard that
-- emit() used to enforce by hand.
CREATE TABLE items (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	tier TEXT,
	category TEXT,
	npc REAL
);

-- History tiers: 0 = raw (5-min bazaar / ~3h auctions), 1 = hourly, 2 = daily.
-- PK (item, tier, t): INSERT OR IGNORE gives the same dedup/out-of-order
-- rejection appendSnapshot() did.
CREATE TABLE bazaar_points (
	item TEXT NOT NULL,
	tier INTEGER NOT NULL,
	t INTEGER NOT NULL,
	buy REAL NOT NULL,
	sell REAL NOT NULL,
	PRIMARY KEY (item, tier, t)
) WITHOUT ROWID;
CREATE INDEX bazaar_points_tier_t ON bazaar_points (tier, t);

CREATE TABLE auction_points (
	item TEXT NOT NULL,
	tier INTEGER NOT NULL,
	t INTEGER NOT NULL,
	lowest REAL NOT NULL,
	median REAL NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (item, tier, t)
) WITHOUT ROWID;
CREATE INDEX auction_points_tier_t ON auction_points (tier, t);

-- Current-market snapshots, one row per item (the old bazaar.json body is
-- ~800 KB — too close to D1's 1 MB row cap to store as one blob).
-- body: JSON of BazaarProductSnapshot / AuctionItemStats.
-- updated: unix seconds of the run that wrote it; stale rows are pruned daily.
CREATE TABLE bazaar_snapshot (
	item TEXT PRIMARY KEY,
	body TEXT NOT NULL,
	updated INTEGER NOT NULL
);
CREATE TABLE auction_snapshot (
	item TEXT PRIMARY KEY,
	body TEXT NOT NULL,
	updated INTEGER NOT NULL
);

-- 'bazaar_updated' / 'auctions_updated': lastUpdated in unix ms, as the
-- Hypixel API reports and today's JSON files carry.
CREATE TABLE meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
