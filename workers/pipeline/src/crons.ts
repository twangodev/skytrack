// The three cron expressions, in one place. Kept import-free so it can be
// loaded outside workerd (the root vitest suite reads it to compare against
// wrangler.jsonc); pulling in index.ts would drag prismarine-nbt along.
export const CRONS = {
	bazaar: '*/5 * * * *',
	auctions: '10 */3 * * *',
	maintenance: '30 4 * * *'
} as const;
