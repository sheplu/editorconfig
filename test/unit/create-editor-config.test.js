import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEditorConfig } from '../../index.js';

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-unit-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('createEditorConfig', () => {
	it('writes the template to the given path', () => {
		createEditorConfig(state.target);
		assert.ok(existsSync(state.target), 'expected file to be created');
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /^root = true/u);
	});

	it('includes a language section when one is requested', () => {
		createEditorConfig(state.target, ['markdown']);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.md\]/u);
	});

	it('writes base only when no languages are requested', () => {
		createEditorConfig(state.target);
		const content = readFileSync(state.target, 'utf8');
		assert.doesNotMatch(content, /\[\*\.md\]/u);
		assert.doesNotMatch(content, /\[\*\.py\]/u);
	});

	it('overwrites an existing file when called directly', () => {
		writeFileSync(state.target, 'previous content', 'utf8');
		createEditorConfig(state.target);
		assert.notEqual(readFileSync(state.target, 'utf8'), 'previous content');
	});
});
