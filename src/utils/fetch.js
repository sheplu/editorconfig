import { parseRedirectLocation } from './url.js';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_048_576;
const MAX_REDIRECTS = 5;

function ignoreCancelError() {
	return false;
}

export function isRedirect(status) {
	return status >= 300 && status < 400;
}

export function rejectOversized(url) {
	throw new Error(`template body for '${url}' exceeds 1 MB limit`);
}

export function checkContentLength(response, url) {
	const header = response.headers.get('content-length');
	if (header === null) {
		return;
	}
	const bytes = Number.parseInt(header, 10);
	if (Number.isFinite(bytes) && bytes > MAX_BYTES) {
		rejectOversized(url);
	}
}

export function decodeChunks(chunks) {
	return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

export function appendChunk({ state, value, reader, url }) {
	state.total += value.byteLength;
	if (state.total > MAX_BYTES) {
		// We're about to throw rejectOversized; swallow any cancel() rejection.
		reader.cancel().catch(ignoreCancelError);
		rejectOversized(url);
	}
	state.chunks.push(value);
}

export async function consumeStream(reader, url) {
	const state = { chunks: [], total: 0 };
	for (;;) {
		// eslint-disable-next-line no-await-in-loop
		const { value, done } = await reader.read();
		if (done) {
			return decodeChunks(state.chunks);
		}
		appendChunk({ state, value, reader, url });
	}
}

export async function readBoundedBody(response, url) {
	checkContentLength(response, url);
	return await consumeStream(response.body.getReader(), url);
}

export function resolveRedirect(response, currentUrl) {
	const location = response.headers.get('location');
	return parseRedirectLocation(location, currentUrl);
}

export async function performFetch(initialUrl, signal) {
	let url = initialUrl;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		// eslint-disable-next-line no-await-in-loop
		const response = await fetch(url, { signal, redirect: 'manual' });
		if (response.ok) {
			return readBoundedBody(response, url);
		}
		if (!isRedirect(response.status)) {
			throw new Error(`failed to fetch '${url}': HTTP ${response.status}`);
		}
		url = resolveRedirect(response, url);
	}
	throw new Error(`failed to fetch '${initialUrl}': too many redirects (max ${MAX_REDIRECTS})`);
}

export function describeFetchError(url, error) {
	if (error.name === 'AbortError') {
		return new Error(`failed to fetch '${url}': request timed out after ${TIMEOUT_MS / 1000}s`);
	}
	if (/^failed to fetch |^template body /u.test(error.message)) {
		return error;
	}
	return new Error(`failed to fetch '${url}': ${error.message}`);
}

export async function fetchTemplate(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		return await performFetch(url, controller.signal);
	}
	catch (error) {
		throw describeFetchError(url, error);
	}
	finally {
		clearTimeout(timer);
	}
}
