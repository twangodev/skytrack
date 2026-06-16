import { popularBazaarItems } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ examples: popularBazaarItems(6) });
