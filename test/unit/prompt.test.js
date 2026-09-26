import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { ask, CANCELLED, isYes } from '../../src/cli/prompt.js';
import { resolvePromptAnswer } from '../../src/cli/write-flow.js';

function openPrompt(question = 'Q? ') {
	const input = new PassThrough();
	const output = new PassThrough();
	output.resume();
	return { input, promise: ask(question, { input, output }) };
}

describe('ask', () => {
	it('resolves with the typed answer', async () => {
		const { input, promise } = openPrompt();
		input.write('yes\n');
		assert.equal(await promise, 'yes');
	});

	it('resolves with an empty string on a bare Enter', async () => {
		const { input, promise } = openPrompt();
		input.write('\n');
		assert.equal(await promise, '');
	});

	it('resolves CANCELLED when the input ends without an answer (EOF)', async () => {
		const { input, promise } = openPrompt();
		input.end();
		assert.equal(await promise, CANCELLED);
	});
});

describe('isYes', () => {
	it('accepts y / Y / yes / YES with surrounding whitespace', () => {
		for (const answer of ['y', 'Y', 'yes', 'YES', ' y ', 'Yes']) {
			assert.equal(isYes(answer), true, `expected '${answer}' to be a yes`);
		}
	});

	it('rejects everything else', () => {
		for (const answer of ['', 'n', 'no', 'yep', 'true', 'y e s']) {
			assert.equal(isYes(answer), false, `expected '${answer}' to be a no`);
		}
	});
});

describe('resolvePromptAnswer', () => {
	it('maps in-range indices to language names', () => {
		assert.deepEqual(resolvePromptAnswer('3'), ['markdown']);
	});

	it('mixes indices and names', () => {
		assert.deepEqual(resolvePromptAnswer('1, md'), ['javascript', 'md']);
	});

	it('rejects out-of-range indices', () => {
		assert.throws(() => resolvePromptAnswer('99'), /language index out of range: '99'/u);
		assert.throws(() => resolvePromptAnswer('0'), /language index out of range: '0'/u);
	});

	it('treats a numeric prefix with trailing text as a language name, not an index', () => {
		assert.deepEqual(resolvePromptAnswer('1garbage'), ['1garbage']);
	});

	it('treats a decimal answer as a language name, not an index', () => {
		assert.deepEqual(resolvePromptAnswer('1.5'), ['1.5']);
	});

	it('ignores blank tokens', () => {
		assert.deepEqual(resolvePromptAnswer(' , ,2,'), ['yaml']);
	});
});
