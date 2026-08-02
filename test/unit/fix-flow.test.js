import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguages, buildSectionDiffs, formatDiff, hasChanges } from '../../src/cli/fix-flow.js';
import { EMPTY_OVERRIDES, parseSections } from '../../src/templates/index.js';
import {
	BUILTIN_BASE_FILE,
	BUILTIN_BASE_BODY,
	JAVASCRIPT_SECTION,
	PYTHON_SECTION,
	withSection,
} from '../fixtures/editorconfig.js';

describe('detectLanguages', () => {
	it('returns an empty array for a base-only file', () => {
		const parsed = parseSections(BUILTIN_BASE_FILE);
		assert.deepStrictEqual(detectLanguages(parsed), []);
	});

	it('returns detected languages for known sections', () => {
		const text = withSection(BUILTIN_BASE_FILE, JAVASCRIPT_SECTION);
		const parsed = parseSections(text);
		assert.deepStrictEqual(detectLanguages(parsed), ['javascript']);
	});

	it('returns multiple detected languages in order', () => {
		const text = withSection(withSection(BUILTIN_BASE_FILE, JAVASCRIPT_SECTION), PYTHON_SECTION);
		const parsed = parseSections(text);
		assert.deepStrictEqual(detectLanguages(parsed), ['javascript', 'python']);
	});

	it('ignores unknown section headers', () => {
		const text = `${BUILTIN_BASE_FILE}\n[Cargo.toml]\nfoo = bar\n`;
		const parsed = parseSections(text);
		assert.deepStrictEqual(detectLanguages(parsed), []);
	});
});

describe('buildSectionDiffs — matching and missing sections', () => {
	it('returns all match for a correct base-only file', () => {
		const parsed = parseSections(BUILTIN_BASE_FILE);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		assert.ok(diffs.every((diff) => diff.status === 'match'));
	});

	it('detects missing sections', () => {
		const parsed = parseSections(BUILTIN_BASE_FILE);
		const diffs = buildSectionDiffs(parsed, ['javascript'], EMPTY_OVERRIDES);
		const jsDiff = diffs.find((diff) => diff.header === '[*.{js,jsx,ts,tsx,mjs,cjs}]');
		assert.ok(jsDiff, 'expected a diff entry for javascript');
		assert.equal(jsDiff.status, 'missing');
	});

	it('detects missing root = true', () => {
		const text = `[*]\n${BUILTIN_BASE_BODY}`;
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'mismatch');
		assert.equal(baseDiff.rootMissing, true);
	});

	it('reports match for an existing language that is already correct', () => {
		const text = withSection(BUILTIN_BASE_FILE, JAVASCRIPT_SECTION);
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, ['javascript'], EMPTY_OVERRIDES);
		const jsDiff = diffs.find((diff) => diff.header === '[*.{js,jsx,ts,tsx,mjs,cjs}]');
		assert.ok(jsDiff);
		assert.equal(jsDiff.status, 'match');
	});
});

describe('buildSectionDiffs — drift detection', () => {
	it('detects mismatch when a key is wrong', () => {
		const text = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'mismatch');
		assert.ok(baseDiff.keys.changed.some((change) => change.key === 'indent_size'));
	});

	it('reports added keys when a section is missing a canonical key', () => {
		// Remove a key that the base template expects
		const lines = BUILTIN_BASE_FILE.split('\n').filter((line) => !line.startsWith('spelling_language'));
		const text = lines.join('\n');
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'mismatch');
		assert.ok(baseDiff.keys.added.some((addition) => addition.key === 'spelling_language'));
	});

	it('reports removed keys when a section has an extra key', () => {
		const text = BUILTIN_BASE_FILE.replace('[*]\n', '[*]\nextra_key = extra_value\n');
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'mismatch');
		assert.ok(baseDiff.keys.removed.some((removal) => removal.key === 'extra_key'));
	});
});

describe('buildSectionDiffs — unknown and combined drift', () => {
	it('detects unknown sections', () => {
		const text = `${BUILTIN_BASE_FILE}\n[Cargo.toml]\nfoo = bar\n`;
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const unknownDiff = diffs.find((diff) => diff.header === '[Cargo.toml]');
		assert.ok(unknownDiff);
		assert.equal(unknownDiff.status, 'unknown');
	});

	it('reports changed, added, and removed keys in the same section', () => {
		// Tamper base: change indent_size, remove spelling_language, add bogus_key
		const text = BUILTIN_BASE_FILE
			.replace('indent_size = 4', 'indent_size = 2')
			.split('\n')
			.filter((line) => !line.startsWith('spelling_language'))
			.join('\n')
			.replace('[*]\n', '[*]\nbogus_key = bogus\n');
		const parsed = parseSections(text);
		const diffs = buildSectionDiffs(parsed, [], EMPTY_OVERRIDES);
		const baseDiff = diffs.find((diff) => diff.header === '[*]');
		assert.equal(baseDiff.status, 'mismatch');
		assert.ok(baseDiff.keys.changed.length > 0, 'expected changed keys');
		assert.ok(baseDiff.keys.added.length > 0, 'expected added keys');
		assert.ok(baseDiff.keys.removed.length > 0, 'expected removed keys');
	});
});

describe('hasChanges', () => {
	it('returns false when all diffs are match', () => {
		const diffs = [{ status: 'match' }, { status: 'match' }];
		assert.equal(hasChanges(diffs), false);
	});

	it('returns true when a mismatch exists', () => {
		const diffs = [{ status: 'match' }, { status: 'mismatch' }];
		assert.equal(hasChanges(diffs), true);
	});

	it('returns true when a missing section exists', () => {
		const diffs = [{ status: 'match' }, { status: 'missing' }];
		assert.equal(hasChanges(diffs), true);
	});

	it('returns true when an unknown section exists', () => {
		const diffs = [{ status: 'match' }, { status: 'unknown' }];
		assert.equal(hasChanges(diffs), true);
	});
});

describe('formatDiff — headings and status lines', () => {
	it('includes the file path in the heading', () => {
		const diffs = [{ header: '[*]', status: 'mismatch', keys: { changed: [], added: [], removed: [] } }];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /Fixing \.editorconfig/u);
	});

	it('shows mismatch with key diffs', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: {
				changed: [{ key: 'indent_size', from: '2', to: '4' }],
				added: [],
				removed: [],
			},
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /❌ \[\*\] — mismatch/u);
		assert.match(output, /- indent_size = 2/u);
		assert.match(output, /\+ indent_size = 4/u);
	});

	it('shows missing sections', () => {
		const diffs = [{ header: '[*.md]', status: 'missing' }];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /➕ \[\*\.md\] — missing \(will be added\)/u);
	});

	it('shows unknown sections', () => {
		const diffs = [{ header: '[Cargo.toml]', status: 'unknown' }];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /⚠️\s+\[Cargo\.toml\] — unknown \(will be removed\)/u);
	});

	it('omits sections with match status', () => {
		const diffs = [
			{ header: '[*]', status: 'match' },
			{ header: '[*.md]', status: 'missing' },
		];
		const output = formatDiff(diffs, '.editorconfig');
		assert.doesNotMatch(output, /\[\*\] — match/u);
		assert.match(output, /\[\*\.md\]/u);
	});
});

describe('formatDiff — key diffs', () => {
	it('shows added keys with a + prefix', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: {
				changed: [],
				added: [{ key: 'spelling_language', value: 'en' }],
				removed: [],
			},
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /\+ spelling_language = en/u);
	});

	it('shows removed keys with a - prefix', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: {
				changed: [],
				added: [],
				removed: [{ key: 'extra_key', value: 'extra_value' }],
			},
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /- extra_key = extra_value/u);
	});

	it('shows all three key diff types together', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: {
				changed: [{ key: 'indent_size', from: '2', to: '4' }],
				added: [{ key: 'charset', value: 'utf8' }],
				removed: [{ key: 'bogus', value: 'val' }],
			},
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /- indent_size = 2/u);
		assert.match(output, /\+ indent_size = 4/u);
		assert.match(output, /\+ charset = utf8/u);
		assert.match(output, /- bogus = val/u);
	});
});

describe('formatDiff — root note', () => {
	it('shows root = true missing note', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: { changed: [], added: [], removed: [] },
			rootMissing: true,
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /root = true \(missing preamble\)/u);
	});
});
