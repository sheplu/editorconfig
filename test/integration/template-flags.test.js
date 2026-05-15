import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, TWO_SPACE_BASE } from './template-helpers.js';

const state = { workdir: '', target: '', template: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-template-flags-'));
	state.target = join(state.workdir, '.editorconfig');
	state.template = join(state.workdir, 'team.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('-t short flag', () => {
	it('write with -t emits the override base body', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const result = runCli(['--mode=write', `--path=${state.target}`, '-t', state.template]);
		assert.equal(result.status, 0, result.stderr);
		const written = readFileSync(state.target, 'utf8');
		assert.match(written, /^root = true\n/u);
		assert.match(written, /\n\[\*\]\nindent_style = space\nindent_size = 2\n/u);
	});

	it('check with -t PASSes when the file matches the override', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const written = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'-t', state.template,
		]);
		assert.equal(written.status, 0, written.stderr);
		const checked = runCli(['--mode=check', `--path=${state.target}`, '-t', state.template]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});
});

describe('--template + --languages — write', () => {
	it('emits override for the specified language and base from the template', () => {
		writeFileSync(state.template, `root = true

[*]
indent_style = space
indent_size = 2

[*.{js,jsx,ts,tsx,mjs,cjs}]
indent_style = space
indent_size = 4
quote_type = double
`, 'utf8');
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--languages=js',
		]);
		assert.equal(result.status, 0, result.stderr);
		const written = readFileSync(state.target, 'utf8');
		assert.match(written, /\[\*\]\nindent_style = space\nindent_size = 2\n/u);
		assert.match(written, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = space\nindent_size = 4\nquote_type = double\n/u);
	});
});

describe('--template + --languages — check missing', () => {
	it('FAILs when --languages requires a section that is missing from the file', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const written = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
		]);
		assert.equal(written.status, 0, written.stderr);
		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--languages=js',
		]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\] missing/u);
	});
});

describe('--template + --languages — fallback', () => {
	it('PASSes when an override-driven file satisfies a non-overridden required language', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const writeResult = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--languages=md',
		]);
		assert.equal(writeResult.status, 0, writeResult.stderr);
		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--languages=md',
		]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});
});

describe('--template + --strict', () => {
	it('FAILs strict mode when an unknown section is present in the target file', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const writeResult = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
		]);
		assert.equal(writeResult.status, 0, writeResult.stderr);
		writeFileSync(
			state.target,
			`${readFileSync(state.target, 'utf8')}\n[Cargo.toml]\nfoo = bar\n`,
			'utf8',
		);
		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--strict',
		]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /⚠️\s+\[Cargo\.toml\]/u);
	});
});
