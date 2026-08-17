import { requireDb, popularBazaarItems } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	return { examples: await popularBazaarItems(db, 6) };
};
