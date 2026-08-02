// Smoke tests — lightweight liveness checks for every CLI entry point.
// Each test asserts only exit code (and optionally that stdout/stderr is non-empty).
// No deep output inspection — that's for integration and e2e tests.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-smoke-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function run(args) {
	return spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		cwd: state.workdir,
	});
}

function writeValid(languages = '') {
	const result = run(['--mode=write', `--path=${state.target}`, `--languages=${languages}`]);
	assert.equal(result.status, 0, `setup write failed: ${result.stderr}`);
}

// ──────────────────────────────────────────────────────
// Happy-path liveness (exit 0)
// ──────────────────────────────────────────────────────

describe('smoke: --help / --version', () => {
	it('--help exits 0', () => {
		assert.equal(run(['--help']).status, 0);
	});

	it('-h exits 0', () => {
		assert.equal(run(['-h']).status, 0);
	});

	it('--version exits 0 with non-empty stdout', () => {
		const result = run(['--version']);
		assert.equal(result.status, 0);
		assert.ok(result.stdout.trim().length > 0);
	});

	it('-v exits 0', () => {
		assert.equal(run(['-v']).status, 0);
	});
});

describe('smoke: --mode=write', () => {
	it('writes a fresh file and exits 0', () => {
		const result = run(['--mode=write', `--path=${state.target}`]);
		assert.equal(result.status, 0);
		assert.ok(existsSync(state.target));
	});

	it('writes with --languages=js,md and exits 0', () => {
		const result = run(['--mode=write', `--path=${state.target}`, '--languages=js,md']);
		assert.equal(result.status, 0);
		assert.ok(existsSync(state.target));
	});

	it('overwrites an existing file with --overwrite and exits 0', () => {
		writeFileSync(state.target, 'old content', 'utf8');
		const result = run(['--mode=write', `--path=${state.target}`, '--overwrite', '--languages=']);
		assert.equal(result.status, 0);
	});
});

describe('smoke: --mode=check', () => {
	it('checks a valid file and exits 0', () => {
		writeValid();
		assert.equal(run(['--mode=check', `--path=${state.target}`]).status, 0);
	});

	it('checks with --languages=js on a matching file and exits 0', () => {
		writeValid('js');
		assert.equal(run(['--mode=check', `--path=${state.target}`, '--languages=js']).status, 0);
	});

	it('checks with --strict on a clean file and exits 0', () => {
		writeValid();
		assert.equal(run(['--mode=check', `--path=${state.target}`, '--strict']).status, 0);
	});

	it('checks --recursive on a dir with a valid root and exits 0', () => {
		writeValid();
		assert.equal(run(['--mode=check', `--path=${state.workdir}`, '--recursive']).status, 0);
	});

	it('checks --json and exits 0 with JSON output', () => {
		writeValid();
		const result = run(['--mode=check', `--path=${state.target}`, '--json']);
		assert.equal(result.status, 0);
		assert.ok(result.stdout.trimStart().startsWith('{'));
	});

	it('checks --recursive --json and exits 0', () => {
		writeValid();
		assert.equal(run(['--mode=check', `--path=${state.workdir}`, '--recursive', '--json']).status, 0);
	});
});

describe('smoke: --mode=fix', () => {
	it('exits 0 on a correct file', () => {
		writeValid();
		assert.equal(run(['--mode=fix', `--path=${state.target}`]).status, 0);
	});

	it('fixes a tampered file with --overwrite and exits 0', () => {
		writeValid();
		const tampered = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');
		writeFileSync(state.target, tampered, 'utf8');
		assert.equal(run(['--mode=fix', `--path=${state.target}`, '--overwrite']).status, 0);
	});

	it('fixes with --languages=md --overwrite and exits 0', () => {
		writeValid();
		assert.equal(run(['--mode=fix', `--path=${state.target}`, '--languages=md', '--overwrite']).status, 0);
	});
});

// ──────────────────────────────────────────────────────
// Negative liveness (exit non-zero, doesn't crash)
// ──────────────────────────────────────────────────────

describe('smoke: invalid mode / flags', () => {
	it('--mode=bogus exits non-zero', () => {
		assert.notEqual(run(['--mode=bogus']).status, 0);
	});

	it('no --mode exits non-zero', () => {
		assert.notEqual(run([]).status, 0);
	});

	it('--unknown-flag exits non-zero', () => {
		assert.notEqual(run(['--unknown-flag']).status, 0);
	});
});

describe('smoke: write negative', () => {
	it('non-existent parent dir exits non-zero', () => {
		const target = join(state.workdir, 'no', 'such', 'dir', '.editorconfig');
		assert.notEqual(run(['--mode=write', `--path=${target}`]).status, 0);
	});

	it('--recursive rejected with non-zero', () => {
		assert.notEqual(run(['--mode=write', `--path=${state.target}`, '--recursive']).status, 0);
	});

	it('--json rejected with non-zero', () => {
		assert.notEqual(run(['--mode=write', `--path=${state.target}`, '--json']).status, 0);
	});

	it('--languages=foobar exits non-zero', () => {
		assert.notEqual(run(['--mode=write', `--path=${state.target}`, '--languages=foobar']).status, 0);
	});
});

describe('smoke: check negative', () => {
	it('non-existent file exits non-zero', () => {
		assert.notEqual(run(['--mode=check', `--path=${state.target}`]).status, 0);
	});

	it('--languages=foobar exits non-zero', () => {
		writeValid();
		assert.notEqual(run(['--mode=check', `--path=${state.target}`, '--languages=foobar']).status, 0);
	});
});

describe('smoke: fix negative', () => {
	it('non-existent file exits non-zero', () => {
		assert.notEqual(run(['--mode=fix', `--path=${state.target}`]).status, 0);
	});

	it('--recursive rejected with non-zero', () => {
		writeValid();
		assert.notEqual(run(['--mode=fix', `--path=${state.target}`, '--recursive']).status, 0);
	});

	it('--json rejected with non-zero', () => {
		writeValid();
		assert.notEqual(run(['--mode=fix', `--path=${state.target}`, '--json']).status, 0);
	});
});
