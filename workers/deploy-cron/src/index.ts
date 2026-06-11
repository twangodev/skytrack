// Github's own cron scheduler silently drops */15 runs for hours at a time,
// so this worker dispatches the deploy workflow on a reliable schedule instead.
// Secret: GITHUB_PAT — fine-grained PAT with Actions read/write on the repo.
interface Env {
	GITHUB_PAT: string;
}

const REPO = 'twangodev/skytrack';
const WORKFLOW = 'deploy.yml';

export default {
	async scheduled(_controller, env): Promise<void> {
		const res = await fetch(
			`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.GITHUB_PAT}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					'User-Agent': 'skytrack-deploy-cron'
				},
				body: JSON.stringify({ ref: 'main', inputs: { data_only: 'true' } })
			}
		);
		if (res.status !== 204) {
			// throwing marks the cron invocation failed in the cloudflare dashboard
			throw new Error(`dispatch failed: HTTP ${res.status}: ${await res.text()}`);
		}
		console.log(JSON.stringify({ event: 'dispatched', workflow: WORKFLOW }));
	}
} satisfies ExportedHandler<Env>;
