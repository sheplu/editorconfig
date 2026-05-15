import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, TWO_SPACE_BASE } from './template-helpers.js';

const state = { workdir: '', target: '', template: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-template-'));
	state.target = join(state.workdir, '.editorconfig');
	state.template = join(state.workdir, 'team.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('--template — write mode', () => {
	it('emits the override [*] body when the template redefines base', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
		]);
		assert.equal(result.status, 0, result.stderr);
		const written = readFileSync(state.target, 'utf8');
		assert.match(written, /^root = true\n/u);
		assert.match(written, /\n\[\*\]\nindent_style = space\nindent_size = 2\n/u);
	});

	it('falls back to the built-in language sections when the template only overrides base', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
			'--languages=js',
		]);
		assert.equal(result.status, 0, result.stderr);
		const written = readFileSync(state.target, 'utf8');
		assert.ok(written.includes('[*.{js,jsx,ts,tsx,mjs,cjs}]'));
		assert.match(written, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = tab\n/u);
	});

	it('emits the override JS body when the template redefines javascript', () => {
		writeFileSync(state.template, `[*.{js,jsx,ts,tsx,mjs,cjs}]
indent_style = space
indent_size = 2
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
		assert.match(written, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = space\nindent_size = 2\nquote_type = double\n/u);
	});
});

describe('--template — check mode', () => {
	it('PASSes when the file matches the override', () => {
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
		]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});

	it('FAILs when the file matches the built-in but not the override', () => {
		writeFileSync(state.template, TWO_SPACE_BASE, 'utf8');
		const written = runCli(['--mode=write', `--path=${state.target}`]);
		assert.equal(written.status, 0, written.stderr);

		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			`--template=${state.template}`,
		]);
		assert.notEqual(checked.status, 0);
		assert.match(checked.stdout, /\bFAIL\b/u);
		assert.match(checked.stdout, /❌\s+\[\*\]/u);
	});
});

describe('--template — special characters in path', () => {
	it('loads a template from a path containing spaces and unicode characters', () => {
		const parent = join(state.workdir, 'team config 🦊');
		mkdirSync(parent, { recursive: true });
		const templatePath = join(parent, 'team.editorconfig');
		writeFileSync(templatePath, TWO_SPACE_BASE, 'utf8');

		const writeResult = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${templatePath}`,
		]);
		assert.equal(writeResult.status, 0, writeResult.stderr);
		assert.match(readFileSync(state.target, 'utf8'), /\[\*\]\nindent_style = space\nindent_size = 2\n/u);

		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			`--template=${templatePath}`,
		]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /\bPASS\b/u);
	});
});

describe('--template — invalid value', () => {
	it('exits non-zero when the template path does not exist', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${join(state.workdir, 'missing.editorconfig')}`,
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /does not exist/u);
	});

	it('exits non-zero with a distinct message when --template is given an empty value', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--template=',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--template requires a path/u);
		assert.doesNotMatch(result.stderr, /does not exist/u);
	});

	it('exits non-zero with parseArgs message when --template is passed without an argument', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--template',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /argument missing/u);
	});
});

describe('--template — invalid content', () => {
	it('exits non-zero when the template has an unknown header', () => {
		writeFileSync(state.template, `root = true

[*]
indent_style = space
indent_size = 2

[*.proto]
indent_style = space
`, 'utf8');
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			`--template=${state.template}`,
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown header '\[\*\.proto\]'/u);
	});
});
