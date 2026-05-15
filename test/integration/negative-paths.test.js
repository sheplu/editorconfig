import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-neg-'));
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

describe('CLI argument errors', () => {
	it('rejects an unknown long flag with a clean message', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--lang=js']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Unknown option '--lang'/u);
		assert.match(result.stderr, /--help/u);
	});

	it('reports a non-unknown-option parseArgs error verbatim, without the "See --help." suffix', () => {
		// Passing a value to a boolean flag triggers ERR_PARSE_ARGS_INVALID_OPTION_VALUE — the fallback branch in formatCliError.
		const result = runCli(['--mode=write', `--path=${state.target}`, '--overwrite=value']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /does not take an argument/u);
		assert.doesNotMatch(result.stderr, /See --help/u);
	});

	it('rejects an unknown short flag', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '-X']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Unknown/u);
	});

	it('reports "invalid command" for an unknown --mode value', () => {
		const result = runCli(['--mode=writte', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /invalid command/u);
	});

	it('reports "invalid command" when --mode is omitted', () => {
		const result = runCli([`--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /invalid command/u);
	});
});

describe('check mode — file not found', () => {
	it('exits non-zero with a clean message when --path does not exist', () => {
		const result = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /does not exist/u);
		assert.doesNotMatch(result.stderr, /ENOENT/u);
	});
});

describe('check mode — empty file', () => {
	it('FAILs with "missing base section" on an empty file', () => {
		writeFileSync(state.target, '', 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /\bFAIL\b/u);
		assert.match(result.stdout, /\[\*\] missing/u);
	});

	it('FAILs on a whitespace-only file', () => {
		writeFileSync(state.target, '   \n\n  \n', 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /\[\*\] missing/u);
	});
});

describe('--languages parsing — input forgiveness', () => {
	it('lowercases and trims tokens (e.g. " JS , Md ")', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages= JS , Md ',
		]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(content, /\[\*\.md\]/u);
	});

	it('drops empty tokens like in "js,,md"', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=js,,md',
		]);
		assert.equal(result.status, 0, result.stderr);

		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(content, /\[\*\.md\]/u);
	});
});

describe('--languages parsing — typos and bad input', () => {
	it('reports the bad token when only one of several is unknown', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=js,foobar,md',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language: 'foobar'/u);
	});

	it('reports the typo even when sandwiched between valid aliases', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=md,javascripts,py',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language: 'javascripts'/u);
	});

	it('rejects a single unknown token even when the rest is empty', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=,foo,',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language: 'foo'/u);
	});
});

describe('--strict only matters for check mode', () => {
	it('does not affect --mode=write (writes successfully, exit 0)', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=',
			'--strict',
		]);
		assert.equal(result.status, 0, result.stderr);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /^root = true/u);
	});
});
