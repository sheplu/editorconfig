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
		assert.match(readFileSync(state.target, 'utf8'), /^root = true/u);
	});

	it('overwrites an existing file when called directly', () => {
		writeFileSync(state.target, 'previous content', 'utf8');
		createEditorConfig(state.target);
		assert.notEqual(readFileSync(state.target, 'utf8'), 'previous content');
	});
});
