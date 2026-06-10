// Weekly backup of the deployment-carried history state to a rolling
// GitHub release (tag: data-backup), via the REST API. Assets are named
// {date}-{file}.binpb and pruned to the newest KEEP dates.
// Env: GH_TOKEN (required), GITHUB_REPOSITORY (owner/repo), SITE_URL,
//      DRY_RUN=1 to skip all GitHub writes.
import { STATE_FILES } from '../src/lib/market/state';

const TAG = 'data-backup';
const KEEP_DATES = 8;
const SITE = process.env.SITE_URL ?? 'https://skytrack.twango.dev';
const REPO = process.env.GITHUB_REPOSITORY ?? 'twangodev/skytrack';
const TOKEN = process.env.GH_TOKEN;
const dryRun = process.env.DRY_RUN === '1';
const API = `https://api.github.com/repos/${REPO}`;

if (!TOKEN && !dryRun) {
	console.error('GH_TOKEN is required (or set DRY_RUN=1)');
	process.exit(1);
}

async function gh<T>(url: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...init.headers
		}
	});
	if (!res.ok)
		throw new Error(`${init.method ?? 'GET'} ${url} -> HTTP ${res.status}: ${await res.text()}`);
	// DELETE returns 204 with no body
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

interface Release {
	id: number;
	assets: { id: number; name: string }[];
}

async function ensureRelease(): Promise<Release> {
	try {
		return await gh<Release>(`${API}/releases/tags/${TAG}`);
	} catch (error) {
		// only a missing release warrants creating one — auth/rate-limit/5xx
		// failures must surface, not cascade into a confusing create attempt
		if (!String(error).includes('HTTP 404')) throw error;
		console.log(`release ${TAG} not found; creating`);
		return await gh<Release>(`${API}/releases`, {
			method: 'POST',
			body: JSON.stringify({
				tag_name: TAG,
				name: 'History backups',
				body: 'Rolling weekly backups of the deployment-carried market history. Restore: download the newest date’s files into static/data/state/ (dropping the date prefix) and run the pipeline.',
				make_latest: 'false'
			})
		});
	}
}

async function main() {
	const date = new Date().toISOString().slice(0, 10);

	// 1. download current state from the live site
	const files: { name: string; bytes: ArrayBuffer }[] = [];
	for (const { name } of STATE_FILES) {
		const res = await fetch(`${SITE}/data/state/${name}.binpb`);
		if (!res.ok) throw new Error(`live state missing: ${name}.binpb (HTTP ${res.status})`);
		files.push({ name, bytes: await res.arrayBuffer() });
	}
	console.log(`downloaded ${files.length} state files from ${SITE}`);

	if (dryRun) {
		console.log(`dry run: would upload ${files.map((f) => `${date}-${f.name}.binpb`).join(', ')}`);
		return;
	}

	// 2. upload date-prefixed assets (replacing same-day reruns)
	const release = await ensureRelease();
	for (const { name, bytes } of files) {
		const assetName = `${date}-${name}.binpb`;
		const existing = release.assets.find((a) => a.name === assetName);
		if (existing) {
			await gh(`${API}/releases/assets/${existing.id}`, { method: 'DELETE' }).catch(() => {});
		}
		await gh(
			`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${assetName}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/octet-stream' },
				body: bytes
			}
		);
		console.log(`uploaded ${assetName} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
	}

	// 3. prune to the newest KEEP_DATES dates
	const fresh = await gh<Release>(`${API}/releases/tags/${TAG}`);
	const dates = [...new Set(fresh.assets.map((a) => a.name.slice(0, 10)))].sort();
	const stale = new Set(dates.slice(0, Math.max(0, dates.length - KEEP_DATES)));
	for (const asset of fresh.assets) {
		if (!stale.has(asset.name.slice(0, 10))) continue;
		await gh(`${API}/releases/assets/${asset.id}`, { method: 'DELETE' });
		console.log(`pruned ${asset.name}`);
	}
	console.log('backup done');
}

await main();
