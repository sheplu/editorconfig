import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-fix-eol-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function runCli(args) {
	return spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

describe('fix mode — line endings', () => {
	it('preserves CRLF line endings when fixing a drifted CRLF file', () => {
		const tampered = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2').replaceAll('\n', '\r\n');
		writeFileSync(state.target, tampered, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite']);
		assert.equal(result.status, 0, result.stderr);

		const fixed = readFileSync(state.target, 'utf8');
		assert.doesNotMatch(fixed, /(?<!\r)\n/u, 'every line break must stay CRLF');
		assert.match(fixed, /indent_size = 4\r\n/u, 'the drift is fixed');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
	});
});
