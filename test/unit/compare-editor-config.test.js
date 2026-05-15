import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareEditorConfig, NO_LANGUAGE_FILTER } from '../../src/check.js';
import { parseSection } from '../../src/templates/index.js';
import {
	BUILTIN_BASE_FILE,
	TWO_SPACE_BASE_BODY,
	TWO_SPACE_BASE_FILE,
} from '../fixtures/editorconfig.js';

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-compare-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function overridesWithBase(body) {
	return {
		bodies: new Map([['base', parseSection(body)]]),
		rawSections: new Map(),
		hasRoot: true,
	};
}

describe('compareEditorConfig — overrides match', () => {
	it('reports match when the file matches the override base body', () => {
		writeFileSync(state.target, TWO_SPACE_BASE_FILE, 'utf8');
		const overrides = overridesWithBase(TWO_SPACE_BASE_BODY);
		const report = compareEditorConfig(state.target, NO_LANGUAGE_FILTER, overrides);
		assert.deepEqual(report.baseIssues, []);
		assert.equal(report.results.length, 1);
		assert.equal(report.results[0].header, '[*]');
		assert.equal(report.results[0].status, 'match');
	});
});

describe('compareEditorConfig — overrides mismatch', () => {
	it('reports mismatch when the file matches built-in but not the override', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const overrides = overridesWithBase(TWO_SPACE_BASE_BODY);
		const report = compareEditorConfig(state.target, NO_LANGUAGE_FILTER, overrides);
		assert.equal(report.results[0].status, 'mismatch');
	});
});

describe('compareEditorConfig — overrides fallback', () => {
	it('falls back to built-in expectations for languages not in overrides', () => {
		const file = `${BUILTIN_BASE_FILE}
[*.md]
indent_style = space
indent_size = 2
trim_trailing_whitespace = false
`;
		writeFileSync(state.target, file, 'utf8');
		const overrides = {
			bodies: new Map([
				['javascript', new Map([['indent_style', 'space']])],
			]),
			rawSections: new Map(),
			hasRoot: false,
		};
		const report = compareEditorConfig(state.target, NO_LANGUAGE_FILTER, overrides);
		const mdResult = report.results.find((entry) => entry.header === '[*.md]');
		assert.equal(mdResult.status, 'match');
	});
});
