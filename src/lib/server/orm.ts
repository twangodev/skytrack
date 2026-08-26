import type { D1Database } from '@cloudflare/workers-types';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type D1Client = Pick<D1Database, 'prepare' | 'batch'>;
export type SkytrackDatabase = DrizzleD1Database<typeof schema>;

export function useDrizzle(client: D1Client): SkytrackDatabase {
	// D1 sessions expose the same prepare/batch contract as the database binding.
	// Drizzle's public type has not yet widened to D1DatabaseSession, so keep the
	// compatibility cast at this adapter boundary.
	return drizzle(client as D1Database, { schema });
}
