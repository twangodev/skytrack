import app from '../.svelte-kit/cloudflare/_worker.js';
import { handleScheduled, type Env } from '../workers/pipeline/src/index';

export default { ...app, scheduled: handleScheduled } satisfies ExportedHandler<Env>;
