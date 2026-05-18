import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

function runCli(args) {
	return spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

describe('CLI --help', () => {
	it('prints the usage and exits 0', () => {
		const result = runCli(['--help']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^Usage: editorconfig/u);
		assert.match(result.stdout, /Commands:/u);
		assert.match(result.stdout, /-r, --recursive/u);
	});

	it('also accepts the short -h flag', () => {
		const result = runCli(['-h']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^Usage: editorconfig/u);
	});
});
