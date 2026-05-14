import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-test-'));
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

describe('write mode CLI guard', () => {
	it('writes a fresh file without prompting', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`]);
		assert.equal(result.status, 0, result.stderr);
		assert.ok(existsSync(state.target));
	});

	it('refuses to overwrite an existing file in non-TTY without --overwrite', () => {
		writeFileSync(state.target, 'previous content', 'utf8');
		const result = runCli(['--mode=write', `--path=${state.target}`]);
		assert.notEqual(result.status, 0, 'expected non-zero exit when refusing to overwrite');
		assert.match(result.stderr, /--overwrite/u);
		assert.equal(readFileSync(state.target, 'utf8'), 'previous content', 'file should be untouched');
	});

	it('overwrites an existing file when --overwrite is passed', () => {
		writeFileSync(state.target, 'previous content', 'utf8');
		const result = runCli(['--mode=write', `--path=${state.target}`, '--overwrite']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(readFileSync(state.target, 'utf8'), /^root = true/u);
	});

	it('overwrites an existing file when -o short flag is passed', () => {
		writeFileSync(state.target, 'previous content', 'utf8');
		const result = runCli(['--mode=write', `--path=${state.target}`, '-o']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(readFileSync(state.target, 'utf8'), /^root = true/u);
	});
});

describe('write mode edge cases', () => {
	it('writes to a path containing spaces and unicode characters', () => {
		const parent = join(state.workdir, 'sub dir 🦊');
		mkdirSync(parent, { recursive: true });
		const target = join(parent, '.editorconfig');
		const result = runCli(['--mode=write', `--path=${target}`]);
		assert.equal(result.status, 0, result.stderr);
		assert.ok(existsSync(target), 'expected file to be created');
		assert.match(readFileSync(target, 'utf8'), /^root = true/u);
	});

	it('exits non-zero when the target parent directory does not exist', () => {
		const target = join(state.workdir, 'does-not-exist', '.editorconfig');
		const result = runCli(['--mode=write', `--path=${target}`]);
		assert.notEqual(result.status, 0, 'expected non-zero exit when parent dir is missing');
		assert.ok(!existsSync(target), 'file should not have been created');
	});
});
