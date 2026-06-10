import type { Handle } from '@sveltejs/kit';
import { createInitialModeExpression } from 'mode-watcher';

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%modewatcher.snippet%', createInitialModeExpression({ defaultMode: 'dark' }))
	});
};
