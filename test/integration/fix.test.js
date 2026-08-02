import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE, OVERRIDE_BASE_MARKDOWN } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-fix-'));
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

describe('fix mode — nothing to fix', () => {
	it('prints nothing to fix when the file already matches', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Nothing to fix/u);
	});
});

describe('fix mode — applying fixes with --overwrite', () => {
	it('fixes a mismatched file and exits 0', () => {
		const tampered = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');
		writeFileSync(state.target, tampered, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite']);
		assert.equal(result.status, 0, result.stderr);

		// Verify the file was fixed by running check
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});

	it('fixes a file missing root = true', () => {
		const noRoot = BUILTIN_BASE_FILE.replace('root = true\n\n', '');
		writeFileSync(state.target, noRoot, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite']);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /^root = true/u);
	});

	it('adds a missing language section when --languages is passed', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite', '--languages=js']);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
	});
});

describe('fix mode — non-TTY without --overwrite', () => {
	it('exits non-zero when differences exist and no --overwrite', () => {
		const tampered = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');
		writeFileSync(state.target, tampered, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--overwrite/u);
	});
});

describe('fix mode — error cases', () => {
	it('errors when the file does not exist', () => {
		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /does not exist/u);
	});

	it('rejects --recursive', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--recursive']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--recursive/u);
	});

	it('rejects --json', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--json']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--json/u);
	});
});

describe('fix mode — diff output', () => {
	it('shows the diff for mismatched keys', () => {
		const tampered = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');
		writeFileSync(state.target, tampered, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.match(result.stdout, /❌ \[\*\] — mismatch/u);
		assert.match(result.stdout, /- indent_size = 2/u);
		assert.match(result.stdout, /\+ indent_size = 4/u);
	});

	it('shows missing sections in the diff', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--languages=md']);
		assert.match(result.stdout, /➕ \[\*\.md\] — missing/u);
	});

	it('shows unknown sections in the diff', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`]);
		assert.match(result.stdout, /⚠️\s+\[Cargo\.toml\] — unknown/u);
	});
});

describe('fix mode — --template interaction', () => {
	it('fixes a file to match a custom template override', () => {
		// Write with the built-in template — base indent_size = 4
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');

		// Create a custom template that overrides base to indent_size = 2
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, OVERRIDE_BASE_MARKDOWN, 'utf8');

		// Fix with the template — should detect mismatch and rewrite
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite', `--template=${templatePath}`]);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /mismatch/u);

		// Check with same template should now pass
		const checked = runCli(['--mode=check', `--path=${state.target}`, `--template=${templatePath}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});
});

describe('fix mode — language preservation', () => {
	it('preserves existing languages when adding new ones via --languages', () => {
		// Write with js+md
		runCli(['--mode=write', `--path=${state.target}`, '--languages=js,md']);
		const before = readFileSync(state.target, 'utf8');
		assert.match(before, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(before, /\[\*\.md\]/u);

		// Fix with --languages=py — should add python, keep js+md
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite', '--languages=py']);
		assert.equal(result.status, 0, result.stderr);

		const after = readFileSync(state.target, 'utf8');
		assert.match(after, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u, 'js should be preserved');
		assert.match(after, /\[\*\.md\]/u, 'md should be preserved');
		assert.match(after, /\[\*\.py\]/u, 'py should be added');
	});
});

describe('fix mode — unknown language', () => {
	it('errors cleanly on --languages=foobar', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--overwrite', '--languages=foobar']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language/u);
	});
});
