// SPIKE: verify prismarine-nbt decodes real auction item_bytes under workerd.
// Replaced by the real pipeline in a later task.
import { itemIdFromBytes } from '../../../src/lib/hypixel/nbt';
import fixtures from '../../../src/lib/hypixel/fixtures/auction-items.json';

export default {
	async fetch(): Promise<Response> {
		const regular = await itemIdFromBytes(fixtures.regular.bytes);
		const pet = fixtures.pet ? await itemIdFromBytes(fixtures.pet.bytes) : null;
		const garbage = await itemIdFromBytes('not base64 nbt at all');
		return Response.json({ regular, pet, garbage });
	}
} satisfies ExportedHandler;
