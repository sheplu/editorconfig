import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	describeFetchError,
	fetchTemplate,
	performFetch,
} from '../../src/utils/fetch.js';
import { makeResponse, ONE_MB, streamFrom } from './fetch-helpers.js';

const state = { originalFetch: globalThis.fetch };

beforeEach(() => {
	state.originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = state.originalFetch;
});

describe('performFetch', () => {
	it('returns the body on a 200 response', async () => {
		globalThis.fetch = () => Promise.resolve(makeResponse({
			stream: streamFrom(new TextEncoder().encode('hello')),
		}));
		const text = await performFetch('https://example.com/x', new AbortController().signal);
		assert.equal(text, 'hello');
	});

	it('follows a single 302 redirect', async () => {
		const calls = [];
		globalThis.fetch = (url) => {
			calls.push(url);
			if (calls.length === 1) {
				return Promise.resolve(makeResponse({ status: 302, headers: { location: '/final' } }));
			}
			return Promise.resolve(makeResponse({
				stream: streamFrom(new TextEncoder().encode('done')),
			}));
		};
		const text = await performFetch('https://example.com/start', new AbortController().signal);
		assert.equal(text, 'done');
		assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/final']);
	});

	it('throws when redirect chain exceeds the limit', async () => {
		let count = 0;
		globalThis.fetch = () => {
			count += 1;
			return Promise.resolve(makeResponse({
				status: 302,
				headers: { location: `https://example.com/hop${count}` },
			}));
		};
		await assert.rejects(
			performFetch('https://example.com/start', new AbortController().signal),
			/too many redirects/u,
		);
		assert.equal(count, 6, 'should attempt initial + 5 redirects before giving up');
	});
});

describe('performFetch — HTTP errors', () => {
	it('throws on a 404', async () => {
		globalThis.fetch = () => Promise.resolve(makeResponse({ status: 404 }));
		await assert.rejects(
			performFetch('https://example.com/missing', new AbortController().signal),
			/HTTP 404/u,
		);
	});

	it('throws on a 500 server error', async () => {
		globalThis.fetch = () => Promise.resolve(makeResponse({ status: 500 }));
		await assert.rejects(
			performFetch('https://example.com/boom', new AbortController().signal),
			/HTTP 500/u,
		);
	});
});

describe('describeFetchError', () => {
	it('translates AbortError to the timeout message', () => {
		const error = new Error('aborted');
		error.name = 'AbortError';
		const result = describeFetchError('https://example.com/x', error);
		assert.match(result.message, /request timed out after 10s/u);
	});

	it('returns errors already prefixed with "failed to fetch " unchanged', () => {
		const inner = new Error("failed to fetch 'https://example.com/x': HTTP 500");
		const result = describeFetchError('https://example.com/x', inner);
		assert.equal(result, inner, 'must return the same Error instance');
		assert.equal(result.message, "failed to fetch 'https://example.com/x': HTTP 500");
	});

	it('returns errors already prefixed with "template body " unchanged', () => {
		const inner = new Error("template body for 'https://example.com/big' exceeds 1 MB limit");
		const result = describeFetchError('https://example.com/big', inner);
		assert.equal(result, inner);
	});

	it('wraps any other error with the URL prefix', () => {
		const inner = new TypeError('connect ECONNREFUSED 127.0.0.1:1');
		const result = describeFetchError('https://127.0.0.1:1/x', inner);
		assert.equal(
			result.message,
			"failed to fetch 'https://127.0.0.1:1/x': connect ECONNREFUSED 127.0.0.1:1",
		);
		assert.notEqual(result, inner, 'wrapped errors must be a new Error instance');
	});
});

describe('fetchTemplate', () => {
	it('resolves with the body on a successful fetch', async () => {
		globalThis.fetch = () => Promise.resolve(makeResponse({
			stream: streamFrom(new TextEncoder().encode('contents')),
		}));
		const text = await fetchTemplate('https://example.com/x');
		assert.equal(text, 'contents');
	});

	it('rejects with the timeout message when fetch raises AbortError', async () => {
		globalThis.fetch = () => {
			const error = new Error('aborted');
			error.name = 'AbortError';
			return Promise.reject(error);
		};
		await assert.rejects(
			fetchTemplate('https://example.com/slow'),
			/request timed out after 10s/u,
		);
	});

	it('does not double-wrap a body-too-large error', async () => {
		const half = new Uint8Array(ONE_MB / 2 + 1);
		globalThis.fetch = () => Promise.resolve(makeResponse({
			stream: streamFrom(half, half),
		}));
		await assert.rejects(
			fetchTemplate('https://example.com/big'),
			(error) => {
				assert.equal(
					error.message,
					"template body for 'https://example.com/big' exceeds 1 MB limit",
				);
				assert.ok(!error.message.startsWith("failed to fetch '"));
				return true;
			},
		);
	});
});
