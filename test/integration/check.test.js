import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_BODY } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-check-'));
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
	const result = runCli([
		'--mode=write',
		`--path=${state.target}`,
		`--languages=${languages}`,
	]);
	assert.equal(result.status, 0, result.stderr);
}

describe('check (inferred mode) — happy paths', () => {
	it('PASSes a subset write', () => {
		writeSubset('js,md');
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});

	it('PASSes a base-only file', () => {
		writeSubset('');
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});
});

describe('check (inferred mode) — body tampering', () => {
	it('FAILs when a known section body is corrupted', () => {
		writeSubset('md');
		// Replace the whole [*.md] body with a wrong indent_size.
		const original = readFileSync(state.target, 'utf8');
		const tampered = original.replace('indent_size = 2', 'indent_size = 99');
		writeFileSync(state.target, tampered, 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /❌\s+\[\*\.md\]/u);
	});

	it('PASSes when the file is whitespace-tweaked but semantically equivalent', () => {
		writeSubset('md');
		// Reorder keys, drop spaces around equals, add comments and blank lines.
		const tweaked = `root = true

[*]
indent_style=tab
indent_size = 4
tab_width = 4
end_of_line=lf
charset = utf-8
spelling_language=en
# a comment
trim_trailing_whitespace=true
insert_final_newline = true
quote_type=single
spaces_around_operators=true

[*.md]
trim_trailing_whitespace = false
indent_size = 2
indent_style = space
`;
		writeFileSync(state.target, tweaked, 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});
});

describe('check (inferred mode) — base requirements', () => {
	it('FAILs when [*] is missing', () => {
		writeFileSync(state.target, 'root = true\n\n[*.md]\nindent_size = 2\nindent_style = space\ntrim_trailing_whitespace = false\n', 'utf8');
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /\[\*\] missing/u);
	});

	it('FAILs when root = true is missing', () => {
		writeFileSync(state.target, `[*]\n${BUILTIN_BASE_BODY}`, 'utf8');
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /missing 'root = true'/u);
	});
});

describe('check (inferred mode) — unknown headers', () => {
	it('warns and PASSes when a custom header is present (no --strict)', () => {
		writeSubset('');
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');
		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
		assert.match(checked.stdout, /⚠️\s+\[Cargo\.toml\]/u);
	});

	it('FAILs on a custom header when --strict is passed', () => {
		writeSubset('');
		appendFileSync(state.target, '\n[Cargo.toml]\nfoo = bar\n', 'utf8');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--strict']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /⚠️\s+\[Cargo\.toml\]/u);
	});
});

describe('check (--languages mode)', () => {
	it('PASSes when the file matches the requested set exactly', () => {
		writeSubset('js,md');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--languages=js,md']);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});

	it('FAILs when an expected section is missing', () => {
		writeSubset('md');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--languages=js,md']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\] missing/u);
	});

	it('errors out on an unknown language in --languages', () => {
		writeSubset('');
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--languages=foobar']);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stderr, /unknown language: 'foobar'/u);
	});
});
