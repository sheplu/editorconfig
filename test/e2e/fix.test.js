// E2E tests — end-to-end user workflows that exercise write → tamper → fix → check roundtrips.
// These complement integration tests by verifying the full tool chain in realistic scenarios.

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
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-e2e-'));
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

function runCheckStrict(target) {
	return runCheck(target, '--strict');
}

function runFix(target, ...extra) {
	return runCli(['--mode=fix', `--path=${target}`, ...extra]);
}

function runWriteTemplate(target, templatePath, languages) {
	return runWrite(target, languages, `--template=${templatePath}`);
}

function runCheckTemplate(target, templatePath) {
	return runCheck(target, `--template=${templatePath}`);
}

function runFixTemplate(target, templatePath) {
	return runFix(target, '--overwrite', `--template=${templatePath}`);
}

function assertPasses(result) {
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /PASS/u);
}

function assertFails(result) {
	assert.notEqual(result.status, 0);
}

function tamperValue(target, from, to) {
	const original = readFileSync(target, 'utf8');
	writeFileSync(target, original.replace(from, to), 'utf8');
}

function removeLinesStartingWith(target, prefix) {
	const original = readFileSync(target, 'utf8');
	const lines = original.split('\n').filter((line) => !line.startsWith(prefix));
	writeFileSync(target, lines.join('\n'), 'utf8');
}

describe('e2e: write → tamper → fix → check roundtrip', () => {
	it('fixes a corrupted indent_size and check passes afterward', () => {
		assert.equal(runWrite(state.target, 'js,md').status, 0);
		tamperValue(state.target, 'indent_size = 4', 'indent_size = 99');
		assertFails(runCheck(state.target));
		const fixed = runFix(state.target, '--overwrite');
		assert.equal(fixed.status, 0, fixed.stderr);
		assert.match(fixed.stdout, /mismatch/u);
		assertPasses(runCheck(state.target));
	});

	it('fixes a file with a removed key and check passes afterward', () => {
		runWrite(state.target, '');
		removeLinesStartingWith(state.target, 'spelling_language');
		assertFails(runCheck(state.target));
		const fixed = runFix(state.target, '--overwrite');
		assert.equal(fixed.status, 0, fixed.stderr);
		assertPasses(runCheck(state.target));
	});

	it('fixes a file with an extra key and check passes afterward', () => {
		runWrite(state.target, '');
		appendFileSync(state.target, 'bogus_key = bogus_value\n', 'utf8');
		assertFails(runCheck(state.target));
		const fixed = runFix(state.target, '--overwrite');
		assert.equal(fixed.status, 0, fixed.stderr);
		const content = readFileSync(state.target, 'utf8');
		assert.doesNotMatch(content, /bogus_key/u);
		assertPasses(runCheck(state.target));
	});
});

describe('e2e: fix adds missing language sections', () => {
	it('adds a language requested via --languages and check --languages passes', () => {
		// Write base only
		runCli(['--mode=write', `--path=${state.target}`, '--languages=']);

		// Check with --languages=js should fail (js missing)
		const checkBefore = runCli(['--mode=check', `--path=${state.target}`, '--languages=js']);
		assert.notEqual(checkBefore.status, 0);

		// Fix with --languages=js
		const fixed = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite', '--languages=js']);
		assert.equal(fixed.status, 0, fixed.stderr);
		assert.match(fixed.stdout, /missing/u);

		// Check with --languages=js should now pass
		const checkAfter = runCli(['--mode=check', `--path=${state.target}`, '--languages=js']);
		assert.equal(checkAfter.status, 0, checkAfter.stderr);
		assert.match(checkAfter.stdout, /PASS/u);
	});
});

describe('e2e: fix removes unknown sections', () => {
	it('strips an unknown section and check --strict passes afterward', () => {
		runWrite(state.target, '');
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');
		assertFails(runCheckStrict(state.target));
		const fixed = runFix(state.target, '--overwrite');
		assert.equal(fixed.status, 0, fixed.stderr);
		assert.match(fixed.stdout, /unknown/u);
		const content = readFileSync(state.target, 'utf8');
		assert.doesNotMatch(content, /Cargo\.toml/u);
		assertPasses(runCheckStrict(state.target));
	});
});

describe('e2e: fix on an already-correct file is a no-op', () => {
	it('does not modify the file when nothing needs fixing', () => {
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js,md']);
		const before = readFileSync(state.target, 'utf8');

		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.equal(result.status, 0);
		assert.match(result.stdout, /Nothing to fix/u);

		const after = readFileSync(state.target, 'utf8');
		assert.equal(before, after);
	});
});

describe('e2e: fix with missing root = true', () => {
	it('restores root = true and check passes afterward', () => {
		runWrite(state.target, '');
		tamperValue(state.target, 'root = true\n\n', '');
		const checkBefore = runCheck(state.target);
		assertFails(checkBefore);
		assert.match(checkBefore.stdout, /root = true/u);
		const fixed = runFix(state.target, '--overwrite');
		assert.equal(fixed.status, 0, fixed.stderr);
		assertPasses(runCheck(state.target));
	});
});

describe('e2e: fix with --template roundtrip', () => {
	it('write with template → tamper → fix with template → check with template passes', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, OVERRIDE_BASE_MARKDOWN, 'utf8');
		assert.equal(runWriteTemplate(state.target, templatePath, 'md').status, 0);
		assertPasses(runCheckTemplate(state.target, templatePath));
		tamperValue(state.target, 'indent_size = 2', 'indent_size = 8');
		assertFails(runCheckTemplate(state.target, templatePath));
		const fixed = runFixTemplate(state.target, templatePath);
		assert.equal(fixed.status, 0, fixed.stderr);
		assertPasses(runCheckTemplate(state.target, templatePath));
	});
});

describe('e2e: fix preserves existing sections when adding languages', () => {
	it('keeps js and md when fixing with --languages=py', () => {
		runWrite(state.target, 'js,md');
		const fixed = runFix(state.target, '--overwrite', '--languages=py');
		assert.equal(fixed.status, 0, fixed.stderr);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\]/u, 'base should be present');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u, 'js should be preserved');
		assert.match(content, /\[\*\.md\]/u, 'md should be preserved');
		assert.match(content, /\[\*\.py\]/u, 'py should be added');
		assertPasses(runCheck(state.target, '--languages=js,md,py'));
	});
});
