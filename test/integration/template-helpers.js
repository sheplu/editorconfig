import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export { TWO_SPACE_BASE_FILE as TWO_SPACE_BASE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

export function runCli(args) {
	return spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}
