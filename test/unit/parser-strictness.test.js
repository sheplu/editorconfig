import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseSectionOutOfOrder, parseSection, parseSections } from '../../src/templates/index.js';

describe('baseSectionOutOfOrder', () => {
	it('flags a known language section that precedes [*]', () => {
		const { sections } = parseSections('root = true\n\n[*.md]\nindent_size = 2\n\n[*]\nindent_style = tab\n');
		assert.equal(baseSectionOutOfOrder(sections), true);
	});
	it('accepts the canonical order ([*] first)', () => {
		const { sections } = parseSections('root = true\n\n[*]\nindent_style = tab\n\n[*.md]\nindent_size = 2\n');
		assert.equal(baseSectionOutOfOrder(sections), false);
	});
	it('ignores unknown sections that precede [*]', () => {
		const { sections } = parseSections('root = true\n\n[Cargo.toml]\nfoo = bar\n\n[*]\nindent_style = tab\n');
		assert.equal(baseSectionOutOfOrder(sections), false);
	});
	it('returns false when there is no [*] section', () => {
		const { sections } = parseSections('root = true\n\n[*.md]\nindent_size = 2\n');
		assert.equal(baseSectionOutOfOrder(sections), false);
	});
	it('flags a later duplicate [*] that follows a language section', () => {
		const { sections } = parseSections('root = true\n\n[*]\nindent_style = tab\n\n[*.md]\nindent_size = 2\n\n[*]\nindent_size = 4\n');
		assert.equal(baseSectionOutOfOrder(sections), true);
	});
	it('accepts duplicate [*] sections that all precede language sections', () => {
		const { sections } = parseSections('root = true\n\n[*]\nindent_style = tab\n\n[*]\nindent_size = 4\n\n[*.md]\nindent_size = 2\n');
		assert.equal(baseSectionOutOfOrder(sections), false);
	});
});

describe('parseSection — value normalization', () => {
	it('lowercases values of the standard case-insensitive keys', () => {
		const body = parseSection('indent_style = TAB\nend_of_line = LF\ncharset = LATIN1\n');
		assert.equal(body.get('indent_style'), 'tab');
		assert.equal(body.get('end_of_line'), 'lf');
		assert.equal(body.get('charset'), 'latin1');
	});
	it('lowercases boolean values of trim_trailing_whitespace and insert_final_newline', () => {
		const body = parseSection('trim_trailing_whitespace = TRUE\ninsert_final_newline = False\n');
		assert.equal(body.get('trim_trailing_whitespace'), 'true');
		assert.equal(body.get('insert_final_newline'), 'false');
	});
	it('lowercases indent_size values (numbers are unaffected, `TAB` is normalized)', () => {
		const body = parseSection('indent_size = TAB\n');
		assert.equal(body.get('indent_size'), 'tab');
	});
	it('preserves the case of values for non-standard keys', () => {
		const body = parseSection('quote_type = Single\nspelling_language = EN\n');
		assert.equal(body.get('quote_type'), 'Single');
		assert.equal(body.get('spelling_language'), 'EN');
	});
});

describe('parseSections — root precedence', () => {
	it('lets a later root = false override an earlier root = true', () => {
		assert.equal(parseSections('root = true\nroot = false\n\n[*]\n').hasRoot, false);
	});
	it('lets a later root = true override an earlier root = false', () => {
		assert.equal(parseSections('root = false\nroot = true\n\n[*]\n').hasRoot, true);
	});
	it('matches root case-insensitively in key and value', () => {
		assert.equal(parseSections('ROOT = TRUE\n\n[*]\n').hasRoot, true);
	});
	it('treats an invalid final root value as not root', () => {
		assert.equal(parseSections('root = true\nroot = maybe\n\n[*]\n').hasRoot, false);
	});
});

describe('parseSections — diagnostics', () => {
	it('reports no diagnostics for a well-formed file', () => {
		const { diagnostics } = parseSections('root = true\n\n# comment\n[*]\nindent_style = tab\n');
		assert.deepEqual(diagnostics, []);
	});
	it('flags an unclosed section header with its line number', () => {
		const { diagnostics } = parseSections('root = true\n\n[unclosed\n');
		assert.deepEqual(diagnostics, [{ line: 3, text: '[unclosed' }]);
	});
	it('flags preamble text that is neither comment nor pair', () => {
		const { diagnostics } = parseSections('<!DOCTYPE html>\n<html>\n');
		assert.equal(diagnostics.length, 2);
		assert.equal(diagnostics[0].line, 1);
		assert.equal(diagnostics[0].text, '<!DOCTYPE html>');
	});
	it('flags garbage inside a section body', () => {
		const { diagnostics } = parseSections('[*]\nindent_style = tab\ngarbage\n');
		assert.deepEqual(diagnostics, [{ line: 3, text: 'garbage' }]);
	});
	it('flags a pair with an empty key', () => {
		const { diagnostics } = parseSections('[*]\n= 2\n');
		assert.deepEqual(diagnostics, [{ line: 2, text: '= 2' }]);
	});
	it('keeps line numbers accurate for CRLF input', () => {
		const { diagnostics } = parseSections('root = true\r\n\r\n[*]\r\ngarbage\r\n');
		assert.deepEqual(diagnostics, [{ line: 4, text: 'garbage' }]);
	});
	it('does not flag comment-only files', () => {
		const { diagnostics } = parseSections('# only a comment\n; and another\n');
		assert.deepEqual(diagnostics, []);
	});
});


describe('parseSections — raw blocks', () => {
	it('returns raw blocks in the same pass as the parsed sections', () => {
		const { rawBlocks } = parseSections('root = true\n\n[*]\n# note\nindent_style = tab\n\n[*.md]\nindent_size = 2\n');
		assert.equal(rawBlocks.get('[*]'), '[*]\n# note\nindent_style = tab');
		assert.equal(rawBlocks.get('[*.md]'), '[*.md]\nindent_size = 2');
	});

	it('concatenates every copy of a duplicated header', () => {
		const { rawBlocks } = parseSections('[*.py]\n# first\nindent_size = 4\n\n[*.py]\n# second\nindent_size = 2\n');
		assert.equal(rawBlocks.get('[*.py]'), '[*.py]\n# first\nindent_size = 4\n\n[*.py]\n# second\nindent_size = 2');
	});
});
