import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

// Only public metadata is needed at build time; no D1 credentials or price snapshots.
const path = new URL('../src/lib/server/item-catalog.json', import.meta.url);
const row = z.tuple([
	z.enum(['bazaar', 'auctions']),
	z.string().min(1),
	z.string().min(1),
	z.string().nullable()
]);
const existing = z.array(row).parse(JSON.parse(await readFile(path, 'utf8')));
const response = await fetch('https://skytrack.twango.dev/search-index.json', {
	signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
const index = z
	.array(
		z.object({
			kind: z.enum(['bazaar', 'auctions']),
			slug: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
			name: z.string().min(1),
			tier: z.string().nullish()
		})
	)
	.min(1)
	.parse(await response.json());
// Keep historical items even when they have no active listings in this snapshot.
const merged = new Map(existing.map((item) => [`${item[0]}:${item[1]}`, item]));
for (const item of index) {
	const key = `${item.kind}:${item.slug}`;
	merged.set(key, [item.kind, item.slug, item.name, item.tier ?? merged.get(key)?.[3] ?? null]);
}
const sorted = [...merged.values()].sort((a, b) =>
	`${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`)
);
await writeFile(path, `${JSON.stringify(sorted, null, '\t')}\n`);
console.log(`Prepared ${sorted.length} item pages`);
