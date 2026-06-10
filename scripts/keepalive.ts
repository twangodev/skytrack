// Github disables cron schedules after 60 days without repo activity;
// re-enabling the workflow resets that timer. Replaces the third-party
// keepalive action, which github blocked for tos reasons.
// Env: GH_TOKEN (required), GITHUB_REPOSITORY (owner/repo).
const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY ?? 'twangodev/skytrack';
const WORKFLOW = 'deploy.yml';

if (!TOKEN) {
	console.error('GH_TOKEN is required');
	process.exit(1);
}

const res = await fetch(
	`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/enable`,
	{
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	}
);

if (!res.ok) {
	console.error(`keepalive failed: HTTP ${res.status}: ${await res.text()}`);
	process.exit(1);
}
console.log(`keepalive: ${WORKFLOW} re-enabled, inactivity timer reset`);
