// E2E tests — monorepo recursive workflows: write root + children → check --recursive roundtrips.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-e2e-rec-'));
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

function writeAt(dir, languages = '') {
	const target = join(dir, '.editorconfig');
	const result = runCli(['--mode=write', `--path=${target}`, `--languages=${languages}`]);
	assert.equal(result.status, 0, `setup write at ${target} failed: ${result.stderr}`);
	return target;
}

function writeChildConfig(parentDir, relativePath, content) {
	const childDir = join(parentDir, relativePath);
	mkdirSync(childDir, { recursive: true });
	writeFileSync(join(childDir, '.editorconfig'), content, 'utf8');
	return childDir;
}

function parseJsonResult(result) {
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout);
}

describe('e2e: monorepo root-only recursive check', () => {
	it('passes when only a root .editorconfig exists', () => {
		writeAt(state.workdir);

		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});
});

describe('e2e: monorepo root + child recursive check', () => {
	it('passes with a valid root and a non-conflicting child', () => {
		writeAt(state.workdir, 'js');
		writeChildConfig(state.workdir, 'packages/api', '[*.py]\nindent_style = space\nindent_size = 4\nmax_line_length = 88\n');
		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('fails when a child declares root = true', () => {
		writeAt(state.workdir);
		writeChildConfig(state.workdir, 'packages/lib', 'root = true\n\n[*]\nindent_style = tab\n');
		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});

	it('warns on redundant values in a child', () => {
		writeAt(state.workdir);
		writeChildConfig(state.workdir, 'packages/app', '[*]\nindent_style = tab\n');
		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive']);
		assert.equal(checked.status, 0);
		assert.match(checked.stdout, /redundant/u);
	});

	it('warns on contradictions in a child', () => {
		writeAt(state.workdir);
		writeChildConfig(state.workdir, 'packages/ui', '[*]\nindent_style = space\n');
		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive']);
		assert.equal(checked.status, 0);
		assert.match(checked.stdout, /contradicts/u);
	});
});

describe('e2e: monorepo recursive JSON output', () => {
	it('produces parseable JSON with file entries for root + child', () => {
		writeAt(state.workdir, 'js');
		writeChildConfig(state.workdir, 'packages/lib', '[*.py]\nindent_style = space\n');
		const result = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive', '--json']);
		const json = parseJsonResult(result);
		assert.equal(json.ok, true);
		assert.equal(json.recursive, true);
		assert.ok(json.files.length >= 2, 'expected at least root + child entries');
		assert.ok(json.files.some((file) => file.role === 'root'));
		assert.ok(json.files.some((file) => file.role === 'child'));
	});

	it('reports child-root failure in JSON cross-file issues', () => {
		writeAt(state.workdir);
		writeChildConfig(state.workdir, 'sub', 'root = true\n\n[*]\nindent_style = tab\n');
		const result = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive', '--json']);
		assert.notEqual(result.status, 0);
		const json = JSON.parse(result.stdout);
		assert.equal(json.ok, false);
		assert.ok(json.crossFileIssues.some((issue) => issue.kind === 'child-root'));
	});
});

describe('e2e: monorepo recursive with --languages', () => {
	it('--languages applies only to root, child passes without those sections', () => {
		writeAt(state.workdir, 'js,md');

		const childDir = join(state.workdir, 'packages', 'core');
		mkdirSync(childDir, { recursive: true });
		writeFileSync(join(childDir, '.editorconfig'), '[*.py]\nindent_style = space\n', 'utf8');

		// --languages=js,md is enforced on root only
		const checked = runCli(['--mode=check', `--path=${state.workdir}`, '--recursive', '--languages=js,md']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});
});

describe('e2e: monorepo empty directory', () => {
	it('reports no files found when directory has no .editorconfig', () => {
		const emptyDir = join(state.workdir, 'empty');
		mkdirSync(emptyDir, { recursive: true });

		const checked = runCli(['--mode=check', `--path=${emptyDir}`, '--recursive']);
		assert.equal(checked.status, 0);
		assert.match(checked.stdout, /No .editorconfig files found/u);
	});
});
