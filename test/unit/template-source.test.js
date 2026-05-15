import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTemplateText } from '../../src/templates/template-source.js';

const SAMPLE_BODY = 'root = true\n\n[*]\nindent_style = space\n';

const state = { workdir: '', file: '', originalFetch: globalThis.fetch };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-source-'));
	state.file = join(state.workdir, 'team.editorconfig');
	state.originalFetch = globalThis.fetch;
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
	globalThis.fetch = state.originalFetch;
});

function streamOf(body) {
	const bytes = new TextEncoder().encode(body);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

describe('readTemplateText — local path branch', () => {
	it('reads a local file when given a non-URL string', async () => {
		writeFileSync(state.file, SAMPLE_BODY, 'utf8');
		const text = await readTemplateText(state.file);
		assert.equal(text, SAMPLE_BODY);
	});

	it('rejects an empty input', async () => {
		await assert.rejects(
			readTemplateText(''),
			/--template requires a path/u,
		);
	});

	it('rejects a missing file', async () => {
		await assert.rejects(
			readTemplateText(join(state.workdir, 'nope')),
			/does not exist/u,
		);
	});
});

describe('readTemplateText — scheme enforcement', () => {
	it('rejects an http URL without performing a fetch', async () => {
		let called = false;
		globalThis.fetch = () => {
			called = true;
			return Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers(),
				body: streamOf(SAMPLE_BODY),
			});
		};
		await assert.rejects(
			readTemplateText('http://example.com/team.editorconfig'),
			/--template URL must use https/u,
		);
		assert.equal(called, false);
	});
});

describe('readTemplateText — https routing smoke', () => {
	it('delegates to fetchTemplate for https URLs and returns the body', async () => {
		globalThis.fetch = () => Promise.resolve({
			ok: true,
			status: 200,
			headers: new Headers(),
			body: streamOf(SAMPLE_BODY),
		});
		const text = await readTemplateText('https://example.com/team.editorconfig');
		assert.equal(text, SAMPLE_BODY);
	});
});
