import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NOT_PROVIDED, parseLanguages } from '../../src/cli/options.js';

describe('parseLanguages — non-string input', () => {
	it('returns NOT_PROVIDED when called with no argument (parseArgs result for an absent flag)', () => {
		assert.equal(parseLanguages(), NOT_PROVIDED);
	});

	it('returns NOT_PROVIDED for a boolean', () => {
		assert.equal(parseLanguages(true), NOT_PROVIDED);
	});

	it('returns NOT_PROVIDED for a number', () => {
		assert.equal(parseLanguages(42), NOT_PROVIDED);
	});
});

describe('parseLanguages — string input', () => {
	it('splits a comma-separated string and lowercases tokens', () => {
		assert.deepEqual(parseLanguages('JS, MD'), ['js', 'md']);
	});

	it('returns an empty array for an empty string (distinct from NOT_PROVIDED)', () => {
		const result = parseLanguages('');
		assert.deepEqual(result, []);
		assert.notEqual(result, NOT_PROVIDED);
	});

	it('drops blank tokens from a string with trailing or empty entries', () => {
		assert.deepEqual(parseLanguages('js,,md, '), ['js', 'md']);
	});
});
