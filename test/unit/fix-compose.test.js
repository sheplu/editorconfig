import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSectionDiffs, composeFixedContent, formatDiff } from '../../src/cli/fix-flow.js';
import { composeEditorConfig, EMPTY_OVERRIDES, parseSections } from '../../src/templates/index.js';
import {
	BUILTIN_BASE_BODY,
	BUILTIN_BASE_FILE,
	PYTHON_SECTION,
} from '../fixtures/editorconfig.js';

function compose(text, targetLanguages = [], overrides = EMPTY_OVERRIDES) {
	const parsed = parseSections(text);
	const diffs = buildSectionDiffs(parsed, targetLanguages, overrides);
	return composeFixedContent({ parsed, diffs, targetLanguages, overrides });
}

describe('composeFixedContent — canonical input', () => {
	it('reproduces composeEditorConfig byte-for-byte on a canonical file', () => {
		const canonical = composeEditorConfig(['python']);
		assert.equal(compose(canonical, ['python']), canonical);
	});
});

describe('composeFixedContent — comment preservation', () => {
	it('keeps comments inside sections whose body already matches', () => {
		const text = `root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n[*.py]\n# team policy: black defaults\nindent_style = space\nindent_size = 4\nmax_line_length = 88\n`;
		const fixed = compose(text, ['python']);
		assert.match(fixed, /# team policy: black defaults/u);
	});

	it('keeps preamble comments and emits exactly one root declaration', () => {
		const text = `# managed by platform team\nroot = true\n\n[*]\n${BUILTIN_BASE_BODY}`;
		const fixed = compose(text);
		assert.match(fixed, /^# managed by platform team\nroot = true\n\n\[\*\]\n/u);
		assert.equal(fixed.match(/^root = /gmu).length, 1);
	});

	it('drops comments of a regenerated (mismatched) section', () => {
		const tamperedBase = BUILTIN_BASE_BODY.replace('indent_size = 4', 'indent_size = 2');
		const text = `root = true\n\n[*]\n# stale note\n${tamperedBase}`;
		const fixed = compose(text);
		assert.doesNotMatch(fixed, /# stale note/u);
		assert.match(fixed, /indent_size = 4/u);
	});

	it('collapses duplicate root declarations into one', () => {
		const text = `root = false\nroot = true\n\n[*]\n${BUILTIN_BASE_BODY}`;
		const fixed = compose(text);
		assert.equal(fixed.match(/^root = /gmu).length, 1);
		assert.match(fixed, /^root = true\n/u);
	});
});

describe('composeFixedContent — structural repairs', () => {
	it('reorders [*] before language sections while preserving raw bodies', () => {
		const text = `root = true\n\n${PYTHON_SECTION}\n[*]\n# base comment\n${BUILTIN_BASE_BODY}`;
		const fixed = compose(text, ['python']);
		assert.ok(fixed.indexOf('[*]') < fixed.indexOf('[*.py]'), '[*] must come first');
		assert.match(fixed, /# base comment/u, 'the matching base body must be preserved verbatim');
	});

	it('adds root = true when the preamble lacks it', () => {
		const text = `[*]\n${BUILTIN_BASE_BODY}`;
		assert.match(compose(text), /^root = true\n/u);
	});

	it('drops unknown sections entirely', () => {
		const text = `${BUILTIN_BASE_FILE}\n[Cargo.toml]\nfoo = bar\n`;
		assert.doesNotMatch(compose(text), /Cargo\.toml/u);
	});

	it('strips invalid lines from an otherwise matching preserved section', () => {
		const text = `${BUILTIN_BASE_FILE}[unclosed\n`;
		const fixed = compose(text);
		assert.doesNotMatch(fixed, /\[unclosed/u);
		assert.match(fixed, /indent_style = tab/u);
	});

	it('regenerates a missing base section from the template', () => {
		const text = `root = true\n\n${PYTHON_SECTION}`;
		const fixed = compose(text, ['python']);
		assert.match(fixed, /\[\*\]\nindent_style = tab/u);
	});
});

describe('formatDiff — dropped comments disclosure', () => {
	it('lists comments that a regenerated section will lose', () => {
		const diffs = [{
			header: '[*]',
			status: 'mismatch',
			keys: { removed: [], added: [], changed: [{ key: 'indent_size', from: '2', to: '4' }] },
			droppedComments: ['# team policy'],
		}];
		const output = formatDiff(diffs, '.editorconfig');
		assert.match(output, /- # team policy \(comment will be removed\)/u);
	});
});

describe('composeFixedContent — stray preamble pairs', () => {
	it('removes non-root preamble pairs from the output', () => {
		const text = `root = true\ncharset = utf-8\n\n[*]\n${BUILTIN_BASE_BODY}`;
		const fixed = compose(text);
		assert.match(fixed, /^root = true\n\n\[\*\]\n/u, 'the preamble must contain only root = true');
		const preamble = fixed.slice(0, fixed.indexOf('[*]'));
		assert.doesNotMatch(preamble, /charset/u, 'no stray pair may remain in the preamble');
	});
});

describe('composeFixedContent — duplicate headers', () => {
	it('consolidates identical duplicate sections into one canonical section', () => {
		const text = `root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n${PYTHON_SECTION}\n${PYTHON_SECTION}`;
		const fixed = compose(text, ['python']);
		assert.equal(fixed.match(/^\[\*\.py\]$/gmu).length, 1, 'exactly one [*.py] section');
	});

	it('regenerates a duplicated header from the template rather than picking one raw block', () => {
		const tampered = PYTHON_SECTION.replace('[*.py]\n', '[*.py]\nbogus_key = keepme\n');
		const text = `root = true\n\n[*]\n${BUILTIN_BASE_BODY}\n${tampered}\n${PYTHON_SECTION}`;
		const fixed = compose(text, ['python']);
		assert.equal(fixed.match(/^\[\*\.py\]$/gmu).length, 1);
		assert.doesNotMatch(fixed, /bogus_key/u);
		assert.match(fixed, /max_line_length = 88/u, 'the canonical python body must be emitted');
	});
});
