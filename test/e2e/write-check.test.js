// E2E tests — write → check roundtrip workflows covering the core write + check lifecycle.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERRIDE_BASE_MARKDOWN } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-e2e-wc-'));
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

function runWrite(target, languages = '', ...extra) {
	return runCli(['--mode=write', `--path=${target}`, `--languages=${languages}`, ...extra]);
}

function runCheck(target, ...extra) {
	return runCli(['--mode=check', `--path=${target}`, ...extra]);
}

function assertPasses(result) {
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /PASS/u);
}

describe('e2e: write → check basic roundtrip', () => {
	it('base-only file passes check', () => {
		const written = runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		assert.equal(written.status, 0, written.stderr);

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('file with all languages passes check', () => {
		const allLangs = 'javascript,yaml,markdown,python,go,rust,terraform,json,toml,shell,makefile,dockerfile,html,css';
		const written = runCli(['--mode=write', `--path=${state.target}`, `--languages=${allLangs}`]);
		assert.equal(written.status, 0, written.stderr);

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('file with a subset of languages passes check', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js,py,go']);

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('check --languages passes when the written languages match exactly', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js,md']);

		const checked = runCli(['--mode=check', `--path=${state.target}`, '--languages=js,md']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('check --languages fails when the file has fewer than required', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js']);

		const checked = runCli(['--mode=check', `--path=${state.target}`, '--languages=js,md']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
		assert.match(checked.stdout, /\[\*\.md\] missing/u);
	});
});

describe('e2e: write → tamper → check detects drift', () => {
	it('changing a value makes check fail', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js']);
		const original = readFileSync(state.target, 'utf8');
		writeFileSync(state.target, original.replace('indent_size = 4', 'indent_size = 99'), 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});

	it('removing root = true makes check fail', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		const original = readFileSync(state.target, 'utf8');
		writeFileSync(state.target, original.replace('root = true\n\n', ''), 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /root = true/u);
	});

	it('adding an extra key makes check fail', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		appendFileSync(state.target, 'bogus = true\n', 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});

	it('adding an unknown section is warned but passes without --strict', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0);
		assert.match(checked.stdout, /PASS/u);
		assert.match(checked.stdout, /⚠️/u);
	});

	it('adding an unknown section fails with --strict', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`, '--strict']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});
});

describe('e2e: write → overwrite → check', () => {
	it('overwriting a file with different languages changes the content and check passes', () => {
		runWrite(state.target, 'js');
		const first = readFileSync(state.target, 'utf8');
		assert.match(first, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.doesNotMatch(first, /\[\*\.py\]/u);
		runWrite(state.target, 'py', '--overwrite');
		const second = readFileSync(state.target, 'utf8');
		assert.match(second, /\[\*\.py\]/u);
		assert.doesNotMatch(second, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assertPasses(runCheck(state.target));
	});
});

describe('e2e: write → check with --template', () => {
	it('write with template → check with same template passes', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, OVERRIDE_BASE_MARKDOWN, 'utf8');

		runCli(['--mode=write', `--path=${state.target}`, `--template=${templatePath}`, '--languages=md']);
		const checked = runCli(['--mode=check', `--path=${state.target}`, `--template=${templatePath}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});

	it('write with template → check without template fails (built-in mismatch)', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, OVERRIDE_BASE_MARKDOWN, 'utf8');

		runCli(['--mode=write', `--path=${state.target}`, `--template=${templatePath}`, '--languages=md']);
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});

	it('write without template → check with template fails', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, OVERRIDE_BASE_MARKDOWN, 'utf8');

		runCli(['--mode=write', `--path=${state.target}`, '--languages=md']);
		const checked = runCli(['--mode=check', `--path=${state.target}`, `--template=${templatePath}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /FAIL/u);
	});
});

describe('e2e: check --json pipeline', () => {
	it('write → check --json produces parseable JSON with ok=true', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js']);
		const result = runCli(['--mode=check', `--path=${state.target}`, '--json']);
		assert.equal(result.status, 0, result.stderr);

		const json = JSON.parse(result.stdout);
		assert.equal(json.ok, true);
		assert.equal(json.mode, 'check');
		assert.ok(Array.isArray(json.sections));
	});

	it('tampered file → check --json produces ok=false with section details', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js']);
		const original = readFileSync(state.target, 'utf8');
		writeFileSync(state.target, original.replace('indent_size = 4', 'indent_size = 2'), 'utf8');

		const result = runCli(['--mode=check', `--path=${state.target}`, '--json']);
		assert.notEqual(result.status, 0);

		const json = JSON.parse(result.stdout);
		assert.equal(json.ok, false);
		const mismatch = json.sections.find((section) => section.status === 'mismatch');
		assert.ok(mismatch, 'expected a mismatched section in JSON output');
	});
});
