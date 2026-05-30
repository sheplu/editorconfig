import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

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

describe('CLI --version', () => {
	it('prints the package version and exits 0', () => {
		const result = runCli(['--version']);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), pkg.version);
	});

	it('also accepts the short -v flag', () => {
		const result = runCli(['-v']);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), pkg.version);
	});
});
