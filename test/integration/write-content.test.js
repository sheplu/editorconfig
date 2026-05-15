import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const ALL_LANGUAGES = [
	'javascript', 'yaml', 'markdown', 'python', 'go', 'rust',
	'terraform', 'json', 'toml', 'shell', 'makefile', 'dockerfile',
	'html', 'css',
];

const TEMPLATE_HEADERS = [
	'[*]',
	'[*.{js,jsx,ts,tsx,mjs,cjs}]',
	'[*.{yml,yaml}]',
	'[*.md]',
	'[*.py]',
	'[*.go]',
	'[*.rs]',
	'[*.{tf,tfvars}]',
	'[*.json]',
	'[*.toml]',
	'[*.{sh,bash,zsh}]',
	'[{Makefile,GNUmakefile,makefile,*.mk}]',
	'[{Dockerfile,Dockerfile.*,*.dockerfile}]',
	'[*.{html,htm}]',
	'[*.{css,scss,sass,less}]',
];

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-content-'));
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

describe('write mode content (full template)', () => {
	it('produces a file containing every template header when all languages are passed', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--languages=${ALL_LANGUAGES.join(',')}`,
		]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.ok(content.startsWith('root = true\n'), 'must start with `root = true`');
		assert.match(content, /[^\n]\n$/u, 'must end with exactly one newline');

		for (const header of TEMPLATE_HEADERS) {
			assert.ok(content.includes(header), `expected header "${header}" in output`);
		}
	});
});

describe('write mode content (selection)', () => {
	it('writes base only when --languages is empty', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.ok(content.startsWith('root = true\n'));
		assert.match(content, /[^\n]\n$/u);
		assert.ok(content.includes('[*]'));
		for (const header of TEMPLATE_HEADERS.filter((entry) => entry !== '[*]')) {
			assert.ok(!content.includes(header), `did not expect "${header}" in base-only output`);
		}
	});

	it('writes only the requested languages', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=js,md',
		]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.ok(content.includes('[*]'));
		assert.ok(content.includes('[*.{js,jsx,ts,tsx,mjs,cjs}]'));
		assert.ok(content.includes('[*.md]'));
		assert.ok(!content.includes('[*.py]'));
		assert.ok(!content.includes('[*.go]'));
	});

	it('resolves aliases like ts and py', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=ts,py',
		]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.ok(content.includes('[*.{js,jsx,ts,tsx,mjs,cjs}]'));
		assert.ok(content.includes('[*.py]'));
	});
});

describe('write mode content (non-TTY default)', () => {
	it('writes base only when stdin is not a TTY and --languages is omitted', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.ok(content.startsWith('root = true\n'));
		for (const header of TEMPLATE_HEADERS.filter((entry) => entry !== '[*]')) {
			assert.ok(!content.includes(header));
		}
	});

});

describe('write mode content (errors)', () => {
	it('exits non-zero with a helpful error on unknown language', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=foobar',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language: 'foobar'/u);
		assert.match(result.stderr, /Available:/u);
	});
});

describe('check mode round-trip', () => {
	it('reports PASS for a file written with all languages', () => {
		const written = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--languages=${ALL_LANGUAGES.join(',')}`,
		]);
		assert.equal(written.status, 0, written.stderr);

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
		assert.match(checked.stdout, /✅/u);
	});

	it('reports FAIL with exit 1 when a section body is corrupted', () => {
		const written = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--languages=${ALL_LANGUAGES.join(',')}`,
		]);
		assert.equal(written.status, 0, written.stderr);

		appendFileSync(state.target, 'tampered = true\n', 'utf8');

		const checked = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /❌/u);
	});
});
