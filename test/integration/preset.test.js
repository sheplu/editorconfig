import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './template-helpers.js';
import {
	BUILTIN_BASE_FILE,
	MINIMAL_BASE_FILE,
	PYTHON_CHILD_FILE,
} from '../fixtures/editorconfig.js';

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-preset-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('write --preset', () => {
	it('minimal write emits only the universal base keys', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--languages=', '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(state.target, 'utf8'), MINIMAL_BASE_FILE);
	});

	it('minimal write trims the javascript and python sections', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--languages=js,py', '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(content, /\[\*\.py\]/u);
		assert.doesNotMatch(content, /quote_type|max_line_length/u);
	});

	it('write without --preset uses the default preset', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--languages=']);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(state.target, 'utf8'), BUILTIN_BASE_FILE);
	});

	it('normalizes the preset name case', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--languages=', '--preset=MINIMAL']);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(state.target, 'utf8'), MINIMAL_BASE_FILE);
	});

	it('rejects an unknown preset, lists the available ones, and writes nothing', () => {
		const result = runCli(['--mode=write', `--path=${state.target}`, '--preset=bogus']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown preset: 'bogus'/u);
		assert.match(result.stderr, /Available: default, minimal/u);
		assert.equal(existsSync(state.target), false);
	});
});

describe('check --preset', () => {
	it('a minimal file passes check with --preset=minimal', () => {
		writeFileSync(state.target, MINIMAL_BASE_FILE, 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`, '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /PASS/u);
	});

	it('a minimal file fails the default check', () => {
		writeFileSync(state.target, MINIMAL_BASE_FILE, 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /FAIL/u);
	});

	it('a default file fails check with --preset=minimal', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`, '--preset=minimal']);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /FAIL/u);
	});

	it('check --json reports the chosen preset', () => {
		writeFileSync(state.target, MINIMAL_BASE_FILE, 'utf8');
		const result = runCli(['--mode=check', `--path=${state.target}`, '--preset=minimal', '--json']);
		assert.equal(result.status, 0, result.stderr);
		const payload = JSON.parse(result.stdout);
		assert.equal(payload.preset, 'minimal');
		assert.equal(payload.ok, true);
	});
});

describe('check --preset --recursive', () => {
	function writeFile(relPath, contents) {
		const full = join(state.workdir, relPath);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, contents, 'utf8');
	}

	it('validates a monorepo root against the minimal preset', () => {
		writeFile('.editorconfig', MINIMAL_BASE_FILE);
		writeFile('pkg/.editorconfig', PYTHON_CHILD_FILE);
		const result = runCli(['--mode=check', '--recursive', `--path=${state.workdir}`, '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /PASS/u);
	});

	it('fails the recursive check when the preset does not match the root', () => {
		writeFile('.editorconfig', MINIMAL_BASE_FILE);
		writeFile('pkg/.editorconfig', PYTHON_CHILD_FILE);
		const result = runCli(['--mode=check', '--recursive', `--path=${state.workdir}`]);
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /FAIL/u);
	});

	it('recursive --json carries the chosen preset', () => {
		writeFile('.editorconfig', MINIMAL_BASE_FILE);
		const result = runCli(['--mode=check', '--recursive', '--json', `--path=${state.workdir}`, '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		const payload = JSON.parse(result.stdout);
		assert.equal(payload.preset, 'minimal');
		assert.equal(payload.ok, true);
	});
});

describe('fix --preset', () => {
	it('fix --overwrite converts a default file to the minimal preset', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const fixed = runCli(['--mode=fix', `--path=${state.target}`, '--preset=minimal', '--overwrite']);
		assert.equal(fixed.status, 0, fixed.stderr);
		assert.equal(readFileSync(state.target, 'utf8'), MINIMAL_BASE_FILE);
		const checked = runCli(['--mode=check', `--path=${state.target}`, '--preset=minimal']);
		assert.equal(checked.status, 0, checked.stderr);
	});

	it('fix reports nothing to do when the file already matches the preset', () => {
		writeFileSync(state.target, MINIMAL_BASE_FILE, 'utf8');
		const result = runCli(['--mode=fix', `--path=${state.target}`, '--preset=minimal']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Nothing to fix\./u);
	});
});

describe('--preset with --template', () => {
	const TEMPLATE = `root = true

[*]
indent_style = space
indent_size = 2
`;

	it('template sections override the minimal baseline', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, TEMPLATE, 'utf8');
		const written = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--languages=',
			'--preset=minimal',
			`--template=${templatePath}`,
		]);
		assert.equal(written.status, 0, written.stderr);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /indent_style = space\nindent_size = 2/u);
		assert.doesNotMatch(content, /charset/u);
		const checked = runCli([
			'--mode=check',
			`--path=${state.target}`,
			'--preset=minimal',
			`--template=${templatePath}`,
		]);
		assert.equal(checked.status, 0, checked.stderr);
		assert.match(checked.stdout, /PASS/u);
	});
});
