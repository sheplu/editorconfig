import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE, PYTHON_CHILD_FILE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-json-'));
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

function writeSubset(languages) {
	const result = runCli(['--mode=write', `--path=${state.target}`, `--languages=${languages}`]);
	assert.equal(result.status, 0, result.stderr);
}

describe('check --json', () => {
	it('emits valid JSON with ok=true on a passing file', () => {
		writeSubset('js,md');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--json']);
		assert.equal(checked.status, 0, checked.stderr);
		const payload = JSON.parse(checked.stdout);
		assert.equal(payload.mode, 'check');
		assert.equal(payload.preset, 'default');
		assert.equal(payload.ok, true);
		assert.equal(payload.path, state.target);
		assert.ok(Array.isArray(payload.sections));
		assert.ok(payload.sections.some((section) => section.header === '[*]'));
	});

	it('emits ok=false and exits non-zero on drift', () => {
		writeSubset('md');
		const original = readFileSync(state.target, 'utf8');
		writeFileSync(state.target, original.replace('indent_size = 2', 'indent_size = 99'), 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`, '--json']);
		assert.notEqual(checked.status, 0);
		const payload = JSON.parse(checked.stdout);
		assert.equal(payload.ok, false);
		assert.ok(payload.summary.failed > 0);
		assert.ok(payload.sections.some((section) => section.status === 'mismatch'));
	});

	it('produces no human-readable text alongside the JSON', () => {
		writeSubset('');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--json']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.doesNotMatch(checked.stdout, /PASS|Checking/u);
		// The whole stdout must parse as a single JSON document.
		assert.doesNotThrow(() => JSON.parse(checked.stdout));
	});

	it('rejects --json with --mode=write and writes nothing', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--json is only supported with --mode=check/u);
		assert.equal(existsSync(state.target), false);
	});
});

describe('check --recursive --json', () => {
	function writeFile(relPath, contents) {
		const full = join(state.workdir, relPath);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, contents, 'utf8');
	}

	it('reports every file as JSON with a root and a child entry', () => {
		writeFile('.editorconfig', BUILTIN_BASE_FILE);
		writeFile('pkg/.editorconfig', PYTHON_CHILD_FILE);

		const checked = runCli(['--mode=check', '--recursive', '--json', `--path=${state.workdir}`]);
		assert.equal(checked.status, 0, checked.stderr);
		const payload = JSON.parse(checked.stdout);
		assert.equal(payload.recursive, true);
		assert.equal(payload.preset, 'default');
		assert.equal(payload.ok, true);
		assert.equal(payload.files.length, 2);
		assert.deepEqual(payload.files.map((file) => file.role).toSorted(), ['child', 'root']);
	});

	it('flags a child that declares root=true as a cross-file failure', () => {
		writeFile('.editorconfig', BUILTIN_BASE_FILE);
		writeFile('pkg/.editorconfig', BUILTIN_BASE_FILE);

		const checked = runCli(['--mode=check', '--recursive', '--json', `--path=${state.workdir}`]);
		assert.notEqual(checked.status, 0);
		const payload = JSON.parse(checked.stdout);
		assert.equal(payload.ok, false);
		assert.ok(payload.crossFileIssues.some((issue) => issue.kind === 'child-root'));
	});

	it('emits an empty-but-valid JSON document when no files are found', () => {
		const checked = runCli(['--mode=check', '--recursive', '--json', `--path=${state.workdir}`]);
		assert.equal(checked.status, 0, checked.stderr);
		const payload = JSON.parse(checked.stdout);
		assert.equal(payload.ok, true);
		assert.equal(payload.preset, 'default');
		assert.deepEqual(payload.files, []);
		assert.deepEqual(payload.crossFileIssues, []);
	});
});
