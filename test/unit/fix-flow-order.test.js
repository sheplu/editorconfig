import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSectionDiffs, formatDiff, hasChanges } from '../../src/cli/fix-flow.js';
import { EMPTY_OVERRIDES, parseSections } from '../../src/templates/index.js';
import {
	BUILTIN_BASE_BODY,
	BUILTIN_BASE_FILE,
	PYTHON_SECTION,
} from '../fixtures/editorconfig.js';

describe('buildSectionDiffs — section order', () => {
	it('treats a base section after a language section as a change', () => {
		const text = `root = true\n\n${PYTHON_SECTION}\n[*]\n${BUILTIN_BASE_BODY}`;
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.outOfOrder, true);
		assert.equal(baseDiff.status, 'mismatch');
		assert.equal(baseDiff.bodyMatches, true, 'the body itself still matches');
		assert.equal(hasChanges(diffs), true);
	});

	it('mentions the reordering in the formatted diff', () => {
		const text = `root = true\n\n${PYTHON_SECTION}\n[*]\n${BUILTIN_BASE_BODY}`;
		const diffs = buildSectionDiffs(parseSections(text), [], EMPTY_OVERRIDES);
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /section order will be normalized/u);
	});

	it('does not flag the canonical order', () => {
		const text = `root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n${PYTHON_SECTION}`;
		const diffs = buildSectionDiffs(parseSections(text), [], EMPTY_OVERRIDES);
		assert.equal(hasChanges(diffs), false);
	});
});

describe('buildSectionDiffs — invalid lines', () => {
	it('reports invalid lines as a removable diff entry', () => {
		const text = `${BUILTIN_BASE_FILE}[unclosed\n`;
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const invalidDiff = diffs.find((diff) => diff.status === 'invalid');
		assert.ok(invalidDiff, 'expected an invalid-lines diff entry');
		assert.equal(invalidDiff.lines.length, 1);
		assert.equal(invalidDiff.lines[0].text, '[unclosed');
		assert.equal(hasChanges(diffs), true);
	});

	it('renders invalid lines in the formatted diff', () => {
		const text = `${BUILTIN_BASE_FILE}[unclosed\n`;
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /invalid \(will be removed\)/u);
		assert.match(output, /- line \d+: \[unclosed/u);
	});
});

