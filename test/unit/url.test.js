import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpScheme, parseRedirectLocation, tryParseUrl } from '../../src/utils/url.js';

describe('tryParseUrl', () => {
	it('returns a URL instance for a well-formed https URL', () => {
		const url = tryParseUrl('https://example.com/team.editorconfig');
		assert.ok(url instanceof URL);
		assert.equal(url.protocol, 'https:');
		assert.equal(url.host, 'example.com');
	});

	it('returns false for a relative file-like path', () => {
		assert.equal(tryParseUrl('./relative-path'), false);
	});

	it('returns false for a bare string with no scheme', () => {
		assert.equal(tryParseUrl('team.editorconfig'), false);
	});

	it('returns false for an empty string', () => {
		assert.equal(tryParseUrl(''), false);
	});

	it('returns a URL instance for non-http schemes (classification is delegated to isHttpScheme)', () => {
		const url = tryParseUrl('mailto:a@b.com');
		assert.ok(url instanceof URL);
		assert.equal(url.protocol, 'mailto:');
	});
});

describe('isHttpScheme', () => {
	it('returns true for https', () => {
		assert.equal(isHttpScheme(new URL('https://example.com/x')), true);
	});

	it('returns true for http', () => {
		assert.equal(isHttpScheme(new URL('http://example.com/x')), true);
	});

	it('returns false for mailto', () => {
		assert.equal(isHttpScheme(new URL('mailto:a@b.com')), false);
	});

	it('returns false for file://', () => {
		assert.equal(isHttpScheme(new URL('file:///etc/passwd')), false);
	});

	it('returns false for ftp://', () => {
		assert.equal(isHttpScheme(new URL('ftp://example.com/x')), false);
	});
});

describe('parseRedirectLocation — happy paths', () => {
	it('returns the resolved href for an absolute https Location', () => {
		const next = parseRedirectLocation('https://example.com/final', 'https://example.com/start');
		assert.equal(next, 'https://example.com/final');
	});

	it('resolves a relative Location against the current URL', () => {
		const next = parseRedirectLocation('/final', 'https://example.com/start');
		assert.equal(next, 'https://example.com/final');
	});

	it('preserves query strings and fragments in the resolved URL', () => {
		const next = parseRedirectLocation('/final?x=1#section', 'https://example.com/start');
		assert.equal(next, 'https://example.com/final?x=1#section');
	});
});

describe('parseRedirectLocation — rejections', () => {
	it('throws when Location is missing / not a string', () => {
		assert.throws(
			() => parseRedirectLocation(false, 'https://example.com/start'),
			/redirect missing Location header/u,
		);
	});

	it('throws on an empty-string Location', () => {
		assert.throws(
			() => parseRedirectLocation('', 'https://example.com/start'),
			/redirect missing Location header/u,
		);
	});

	it('throws when redirect target downgrades to http', () => {
		assert.throws(
			() => parseRedirectLocation('http://example.com/final', 'https://example.com/start'),
			(error) => {
				assert.match(error.message, /refused redirect to non-https/u);
				assert.match(error.message, /'http:\/\/example\.com\/final'/u);
				return true;
			},
		);
	});

	it('throws when redirect target uses a non-http scheme like file://', () => {
		assert.throws(
			() => parseRedirectLocation('file:///etc/passwd', 'https://example.com/start'),
			/refused redirect to non-https/u,
		);
	});
});
