import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	BASE_SECTION_HEADER,
	compareSection,
	expectedBodyForLanguage,
	headerToLanguage,
	languageToHeader,
	parseSection,
	parseSections,
	resolveLanguageNames,
} from '../../src/templates/index.js';

describe('parseSection', () => {
	it('parses key=value lines into a Map', () => {
		const body = parseSection('indent_style = space\nindent_size = 2\n');
		assert.equal(body.size, 2);
		assert.equal(body.get('indent_style'), 'space');
		assert.equal(body.get('indent_size'), '2');
	});

	it('lowercases keys and trims values', () => {
		const body = parseSection('Indent_Style =   tab   \n');
		assert.equal(body.get('indent_style'), 'tab');
	});

	it('ignores comments and blank lines', () => {
		const body = parseSection('# a comment\n; another\n\nindent_size = 4\n');
		assert.equal(body.size, 1);
		assert.equal(body.get('indent_size'), '4');
	});

	it('ignores section headers inside the block', () => {
		const body = parseSection('[*.md]\nindent_size = 2\n');
		assert.equal(body.size, 1);
		assert.equal(body.get('indent_size'), '2');
	});

	it('tolerates missing whitespace around the equals sign', () => {
		const body = parseSection('indent_size=2\n');
		assert.equal(body.get('indent_size'), '2');
	});
});

describe('parseSection — malformed input', () => {
	it('keeps the key with an empty value when the value is missing', () => {
		const body = parseSection('indent_size =\n');
		assert.equal(body.get('indent_size'), '');
	});

	it('drops lines that have an equals sign but no key', () => {
		const body = parseSection('= 2\n');
		assert.equal(body.size, 0);
	});

	it('keeps everything after the first = when the value contains =', () => {
		const body = parseSection('foo = bar = baz\n');
		assert.equal(body.get('foo'), 'bar = baz');
	});

	it('lets a duplicate key overwrite the earlier value (last-write-wins)', () => {
		const body = parseSection('indent_size = 2\nindent_size = 4\n');
		assert.equal(body.size, 1);
		assert.equal(body.get('indent_size'), '4');
	});

	it('drops lines that lack an equals sign entirely', () => {
		const body = parseSection('this is not a key value pair\nindent_size = 2\n');
		assert.equal(body.size, 1);
		assert.equal(body.get('indent_size'), '2');
	});
});

describe('parseSections', () => {
	const SAMPLE = `root = true

[*]
indent_style = tab

[*.md]
indent_size = 2
`;

	it('detects root = true in the preamble', () => {
		assert.equal(parseSections(SAMPLE).hasRoot, true);
	});

	it('reports hasRoot=false when the preamble lacks root = true', () => {
		assert.equal(parseSections('[*]\nindent_style = space\n').hasRoot, false);
	});

	it('returns each section with its header and body', () => {
		const { sections } = parseSections(SAMPLE);
		assert.equal(sections.length, 2);
		assert.equal(sections[0].header, '[*]');
		assert.equal(sections[0].body.get('indent_style'), 'tab');
		assert.equal(sections[1].header, '[*.md]');
		assert.equal(sections[1].body.get('indent_size'), '2');
	});

	it('normalizes CRLF line endings', () => {
		const crlf = SAMPLE.replaceAll('\n', '\r\n');
		const { sections, hasRoot } = parseSections(crlf);
		assert.equal(hasRoot, true);
		assert.equal(sections.length, 2);
	});

	it('returns an empty list of sections for whitespace-only input', () => {
		const { sections, hasRoot } = parseSections('   \n\n');
		assert.equal(sections.length, 0);
		assert.equal(hasRoot, false);
	});
});

describe('parseSections — malformed input', () => {
	it('treats an unclosed [ line as preamble noise (no section opened)', () => {
		const { sections, hasRoot } = parseSections('[unclosed\nindent_size = 2\n');
		assert.equal(sections.length, 0);
		assert.equal(hasRoot, false);
	});

	it('accepts an empty header [] as its own section', () => {
		const { sections } = parseSections('[]\nfoo = bar\n');
		assert.equal(sections.length, 1);
		assert.equal(sections[0].header, '[]');
		assert.equal(sections[0].body.get('foo'), 'bar');
	});

	it('ignores garbage lines in the preamble without misclassifying them as root', () => {
		const { sections, hasRoot } = parseSections('garbage line\n[*]\nindent_size = 2\n');
		assert.equal(hasRoot, false);
		assert.equal(sections.length, 1);
	});

	it('does not confuse `root = false` with `root = true`', () => {
		assert.equal(parseSections('root = false\n[*]\n').hasRoot, false);
	});
});

describe('compareSection', () => {
	it('returns ok when key sets and values match exactly', () => {
		const actual = new Map([['a', '1'], ['b', '2']]);
		const expected = new Map([['a', '1'], ['b', '2']]);
		assert.equal(compareSection(actual, expected).ok, true);
	});

	it('returns ok regardless of insertion order', () => {
		const actual = new Map([['b', '2'], ['a', '1']]);
		const expected = new Map([['a', '1'], ['b', '2']]);
		assert.equal(compareSection(actual, expected).ok, true);
	});

	it('returns not-ok when a value differs', () => {
		const actual = new Map([['a', '1']]);
		const expected = new Map([['a', '2']]);
		assert.equal(compareSection(actual, expected).ok, false);
	});

	it('returns not-ok when actual has extra keys', () => {
		const actual = new Map([['a', '1'], ['b', '2']]);
		const expected = new Map([['a', '1']]);
		assert.equal(compareSection(actual, expected).ok, false);
	});

	it('returns not-ok when actual is missing a key', () => {
		const actual = new Map([['a', '1']]);
		const expected = new Map([['a', '1'], ['b', '2']]);
		assert.equal(compareSection(actual, expected).ok, false);
	});

	it('returns ok when both maps are empty', () => {
		assert.equal(compareSection(new Map(), new Map()).ok, true);
	});

	it('compares values case-sensitively (catches a typo like Space vs space)', () => {
		const actual = new Map([['indent_style', 'Space']]);
		const expected = new Map([['indent_style', 'space']]);
		assert.equal(compareSection(actual, expected).ok, false);
	});

	it('treats whitespace-only differences in values as a mismatch', () => {
		// Note: parseSection trims values, so reaching this comparator with
		// " 2" vs "2" only happens when callers bypass the parser.
		const actual = new Map([['indent_size', ' 2']]);
		const expected = new Map([['indent_size', '2']]);
		assert.equal(compareSection(actual, expected).ok, false);
	});
});

describe('headerToLanguage / languageToHeader', () => {
	it('maps each canonical header back to its language name', () => {
		assert.equal(headerToLanguage('[*.md]'), 'markdown');
		assert.equal(headerToLanguage('[*.{js,jsx,ts,tsx,mjs,cjs}]'), 'javascript');
		assert.equal(headerToLanguage('[*.py]'), 'python');
	});

	it('returns no language for unknown headers', () => {
		assert.ok(!headerToLanguage('[*.weird]'));
	});

	it('does not match header strings that differ only in whitespace', () => {
		assert.ok(!headerToLanguage('[ *.md ]'));
	});

	it('does not match header strings that differ only in case', () => {
		assert.ok(!headerToLanguage('[*.MD]'));
	});

	it('does not match a header without surrounding brackets', () => {
		assert.ok(!headerToLanguage('*.md'));
	});

	it('languageToHeader returns the base header for "base"', () => {
		assert.equal(languageToHeader('base'), BASE_SECTION_HEADER);
	});

	it('languageToHeader returns the canonical header for known languages', () => {
		assert.equal(languageToHeader('python'), '[*.py]');
		assert.equal(languageToHeader('rust'), '[*.rs]');
	});
});

describe('expectedBodyForLanguage', () => {
	it('returns the parsed base body without `root = true`', () => {
		const body = expectedBodyForLanguage('base');
		assert.equal(body.has('root'), false, '`root` should not appear in the section body');
		assert.equal(body.get('indent_style'), 'tab');
	});

	it('returns the parsed body for a language template', () => {
		const body = expectedBodyForLanguage('markdown');
		assert.equal(body.get('indent_style'), 'space');
		assert.equal(body.get('indent_size'), '2');
		assert.equal(body.get('trim_trailing_whitespace'), 'false');
	});

	it('returns the override body when overrides define the language', () => {
		const overrides = {
			bodies: new Map([
				['javascript', new Map([['indent_style', 'space'], ['indent_size', '2']])],
			]),
			rawSections: new Map(),
			hasRoot: false,
		};
		const body = expectedBodyForLanguage('javascript', overrides);
		assert.equal(body.get('indent_style'), 'space');
		assert.equal(body.get('indent_size'), '2');
	});

	it('falls back to the built-in body when overrides do not define the language', () => {
		const overrides = {
			bodies: new Map([
				['javascript', new Map([['indent_style', 'space']])],
			]),
			rawSections: new Map(),
			hasRoot: false,
		};
		const body = expectedBodyForLanguage('markdown', overrides);
		assert.equal(body.get('indent_style'), 'space');
		assert.equal(body.get('indent_size'), '2');
		assert.equal(body.get('trim_trailing_whitespace'), 'false');
	});
});

describe('resolveLanguageNames', () => {
	it('resolves canonical names', () => {
		const out = resolveLanguageNames(['markdown', 'python']);
		assert.deepEqual(out, ['markdown', 'python']);
	});

	it('resolves aliases', () => {
		const out = resolveLanguageNames(['md', 'py']);
		assert.deepEqual(out, ['markdown', 'python']);
	});

	it('throws on unknown language', () => {
		assert.throws(() => resolveLanguageNames(['foobar']), /unknown language/u);
	});
});

describe('resolveLanguageNames — typos and edge inputs', () => {
	it('throws on a likely-typo of a real language', () => {
		assert.throws(() => resolveLanguageNames(['javascripts']), /unknown language: 'javascripts'/u);
	});

	it('rejects a name with surrounding whitespace (caller must pre-trim)', () => {
		assert.throws(() => resolveLanguageNames([' markdown ']), /unknown language/u);
	});

	it('rejects an empty-string entry', () => {
		assert.throws(() => resolveLanguageNames(['']), /unknown language/u);
	});

	it('reports the first unknown when several entries are passed', () => {
		assert.throws(
			() => resolveLanguageNames(['markdown', 'unknownish', 'python']),
			/unknown language: 'unknownish'/u,
		);
	});
});
