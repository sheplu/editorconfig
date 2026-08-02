import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	appendChunk,
	checkContentLength,
	consumeStream,
	decodeChunks,
	isRedirect,
	readBoundedBody,
	rejectOversized,
	resolveRedirect,
} from '../../src/utils/fetch.js';
import { makeResponse, ONE_MB, streamFrom } from './fetch-helpers.js';

describe('isRedirect', () => {
	it('returns false for 299 (boundary just below)', () => {
		assert.equal(isRedirect(299), false);
	});

	it('returns true for 300', () => {
		assert.equal(isRedirect(300), true);
	});

	it('returns true for 399', () => {
		assert.equal(isRedirect(399), true);
	});

	it('returns false for 400', () => {
		assert.equal(isRedirect(400), false);
	});
});

describe('rejectOversized', () => {
	it('throws with the URL embedded in the canonical message', () => {
		assert.throws(
			() => rejectOversized('https://example.com/big'),
			(error) => {
				assert.equal(
					error.message,
					"template body for 'https://example.com/big' exceeds 1 MB limit",
				);
				return true;
			},
		);
	});
});

describe('checkContentLength', () => {
	it('is a no-op when content-length is absent', () => {
		const response = makeResponse({});
		assert.doesNotThrow(() => checkContentLength(response, 'https://example.com/x'));
	});

	it('is a no-op when content-length is at or below the limit', () => {
		const response = makeResponse({ headers: { 'content-length': String(ONE_MB) } });
		assert.doesNotThrow(() => checkContentLength(response, 'https://example.com/x'));
	});

	it('throws when content-length exceeds 1 MB', () => {
		const response = makeResponse({ headers: { 'content-length': String(ONE_MB + 1) } });
		assert.throws(
			() => checkContentLength(response, 'https://example.com/big'),
			/exceeds 1 MB limit/u,
		);
	});

	it('is a no-op when content-length is non-numeric (defensive)', () => {
		const response = makeResponse({ headers: { 'content-length': 'not-a-number' } });
		assert.doesNotThrow(() => checkContentLength(response, 'https://example.com/x'));
	});
});

describe('decodeChunks', () => {
	it('returns empty string for an empty array', () => {
		assert.equal(decodeChunks([]), '');
	});

	it('decodes a single UTF-8 chunk', () => {
		const chunk = new TextEncoder().encode('hello');
		assert.equal(decodeChunks([chunk]), 'hello');
	});

	it('concatenates and decodes multiple chunks', () => {
		const enc = new TextEncoder();
		assert.equal(decodeChunks([enc.encode('foo '), enc.encode('bar')]), 'foo bar');
	});

	it('handles multi-byte UTF-8 split across chunk boundaries', () => {
		// 'é' is 0xC3 0xA9 — split it across two chunks.
		const chunks = [Uint8Array.of(0xC3), Uint8Array.of(0xA9)];
		assert.equal(decodeChunks(chunks), 'é');
	});
});

describe('appendChunk', () => {
	it('appends and updates total when under the limit', () => {
		const reader = { cancel: () => Promise.resolve() };
		const innerState = { chunks: [], total: 0 };
		const value = new Uint8Array(10);
		appendChunk({ state: innerState, value, reader, url: 'https://x/y' });
		assert.equal(innerState.total, 10);
		assert.equal(innerState.chunks.length, 1);
		assert.equal(innerState.chunks[0], value);
	});

	it('cancels the reader and throws when cumulative size exceeds the limit', () => {
		let cancelled = false;
		const reader = { cancel: () => { cancelled = true; return Promise.resolve(); } };
		const innerState = { chunks: [], total: ONE_MB };
		const value = new Uint8Array(2);
		assert.throws(
			() => appendChunk({ state: innerState, value, reader, url: 'https://x/y' }),
			/exceeds 1 MB limit/u,
		);
		assert.equal(cancelled, true);
	});

});

describe('consumeStream', () => {
	it('returns empty string for an immediately-closed stream', async () => {
		const reader = streamFrom().getReader();
		const text = await consumeStream(reader, 'https://example.com/empty');
		assert.equal(text, '');
	});

	it('returns the decoded body for a single-chunk stream', async () => {
		const reader = streamFrom(new TextEncoder().encode('payload')).getReader();
		const text = await consumeStream(reader, 'https://example.com/x');
		assert.equal(text, 'payload');
	});

	it('concatenates multiple chunks under the limit', async () => {
		const enc = new TextEncoder();
		const reader = streamFrom(enc.encode('part-1 '), enc.encode('part-2')).getReader();
		const text = await consumeStream(reader, 'https://example.com/x');
		assert.equal(text, 'part-1 part-2');
	});

	it('throws when cumulative bytes exceed the limit', async () => {
		const half = new Uint8Array(ONE_MB / 2 + 1);
		const reader = streamFrom(half, half).getReader();
		await assert.rejects(
			consumeStream(reader, 'https://example.com/big'),
			/exceeds 1 MB limit/u,
		);
	});

});

describe('readBoundedBody', () => {
	it('throws on Content-Length over the limit without pulling from the body', async () => {
		const wouldThrowIfPulled = new ReadableStream({
			pull() {
				throw new Error('body should not have been pulled');
			},
		});
		const response = makeResponse({
			headers: { 'content-length': String(ONE_MB * 2) },
			stream: wouldThrowIfPulled,
		});
		await assert.rejects(
			readBoundedBody(response, 'https://example.com/big'),
			/exceeds 1 MB limit/u,
		);
	});

	it('returns the body when Content-Length is within the limit', async () => {
		const stream = streamFrom(new TextEncoder().encode('body'));
		const response = makeResponse({
			headers: { 'content-length': '4' },
			stream,
		});
		const text = await readBoundedBody(response, 'https://example.com/x');
		assert.equal(text, 'body');
	});
});

describe('resolveRedirect', () => {
	it('resolves a relative Location against the current URL', () => {
		const response = makeResponse({ status: 302, headers: { location: '/next' } });
		assert.equal(
			resolveRedirect(response, 'https://example.com/start'),
			'https://example.com/next',
		);
	});

	it('throws when the Location header is missing', () => {
		const response = makeResponse({ status: 302 });
		assert.throws(
			() => resolveRedirect(response, 'https://example.com/start'),
			/redirect missing Location header/u,
		);
	});

	it('throws when the redirect target is http://', () => {
		const response = makeResponse({ status: 302, headers: { location: 'http://example.com/x' } });
		assert.throws(
			() => resolveRedirect(response, 'https://example.com/start'),
			/refused redirect to non-https/u,
		);
	});
});
