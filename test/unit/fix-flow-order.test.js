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


describe('buildSectionDiffs — missing root display (all base statuses)', () => {
	it('flags rootMissing on a matching base (status flips to mismatch)', () => {
		const parsed = parseSections(`[*]\n${BUILTIN_BASE_BODY}`);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.rootMissing, true);
		assert.equal(baseDiff.status, 'mismatch');
	});

	it('flags rootMissing on a mismatched base and keeps its key diff', () => {
		const tampered = BUILTIN_BASE_BODY.replace('indent_size = 4', 'indent_size = 2');
		const parsed = parseSections(`[*]\n${tampered}`);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.rootMissing, true);
		assert.equal(baseDiff.status, 'mismatch');
		assert.ok(baseDiff.keys.changed.length > 0, 'the key diff must survive the root flag');
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /\+ root = true \(missing preamble\)/u);
	});

	it('flags rootMissing on a missing base section', () => {
		const parsed = parseSections(`${PYTHON_SECTION}`);
		const diffs = buildSectionDiffs(parsed, ['python'], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'missing');
		assert.equal(baseDiff.rootMissing, true);
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /\+ root = true \(missing preamble\)/u);
	});
});

describe('buildSectionDiffs — stray preamble pairs', () => {
	it('reports non-root preamble pairs as removable stray entries', () => {
		const parsed = parseSections(`root = true\ncharset = latin1\n\n[*]\n${BUILTIN_BASE_BODY}`);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const stray = diffs.find((diff) => diff.status === 'stray');
		assert.ok(stray, 'expected a stray-preamble diff entry');
		assert.equal(stray.header, 'preamble');
		assert.deepEqual(stray.keys.removed, [{ key: 'charset', value: 'latin1' }]);
		assert.equal(hasChanges(diffs), true);
	});

	it('renders the stray pairs in the formatted diff', () => {
		const parsed = parseSections(`root = true\ncharset = latin1\n\n[*]\n${BUILTIN_BASE_BODY}`);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /preamble — stray pairs outside any section \(will be removed\)/u);
		assert.match(output, /- charset = latin1/u);
	});

	it('does not flag a preamble that only declares root', () => {
		const parsed = parseSections(`root = true\n\n[*]\n${BUILTIN_BASE_BODY}`);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		assert.equal(diffs.some((diff) => diff.status === 'stray'), false);
		assert.equal(hasChanges(diffs), false);
	});
});

describe('buildSectionDiffs — duplicate headers', () => {
	it('marks every occurrence of a duplicated header for consolidation', () => {
		const parsed = parseSections(`root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n${PYTHON_SECTION}\n${PYTHON_SECTION}`);
		const diffs = buildSectionDiffs(parsed, ['python'], EMPTY_OVERRIDES);
		const duplicates = diffs.filter((diff) => diff.duplicate);
		assert.equal(duplicates.length, 2, 'both [*.py] occurrences must be flagged');
		for (const diff of duplicates) {
			assert.equal(diff.status, 'mismatch');
			assert.equal(diff.bodyMatches, false, 'duplicates must never be preserved verbatim');
		}
		assert.equal(hasChanges(diffs), true);
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /duplicate header \(will be consolidated/u);
	});

	it('leaves unique sections untouched by duplicate detection', () => {
		const parsed = parseSections(`root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n${PYTHON_SECTION}`);
		const diffs = buildSectionDiffs(parsed, ['python'], EMPTY_OVERRIDES);
		assert.equal(diffs.some((diff) => diff.duplicate), false);
	});
});
