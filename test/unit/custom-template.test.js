import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCustomTemplate } from '../../src/templates/custom-template.js';
import { OVERRIDE_BASE_MARKDOWN } from '../fixtures/editorconfig.js';

const state = { workdir: '', file: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-custom-'));
	state.file = join(state.workdir, 'team.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function write(content) {
	writeFileSync(state.file, content, 'utf8');
}

describe('loadCustomTemplate — base + language', () => {
	it('loads a base + javascript override', async () => {
		write(`root = true

[*]
indent_style = space
indent_size = 2
charset = utf8

[*.{js,jsx,ts,tsx,mjs,cjs}]
indent_style = space
indent_size = 2
`);
		const overrides = await loadCustomTemplate(state.file);
		assert.equal(overrides.hasRoot, true);
		assert.equal(overrides.bodies.size, 2);
		assert.equal(overrides.bodies.get('base').get('indent_style'), 'space');
		assert.equal(overrides.bodies.get('base').get('indent_size'), '2');
		assert.equal(overrides.bodies.get('javascript').get('indent_size'), '2');
		assert.match(overrides.rawSections.get('base'), /^root = true\n\n\[\*\]\n/u);
		assert.match(overrides.rawSections.get('javascript'), /^\[\*\.\{js,/u);
	});
});

describe('loadCustomTemplate — single-language override', () => {
	it('loads a template that overrides only one language (no [*])', async () => {
		write(`[*.md]
indent_style = space
indent_size = 4
trim_trailing_whitespace = false
`);
		const overrides = await loadCustomTemplate(state.file);
		assert.equal(overrides.hasRoot, false);
		assert.equal(overrides.bodies.size, 1);
		assert.ok(overrides.bodies.has('markdown'));
		assert.ok(!overrides.bodies.has('base'));
	});
});

describe('loadCustomTemplate — multi-language override', () => {
	it('loads a multi-language template (base + javascript + markdown)', async () => {
		write(`root = true

[*]
indent_style = space
indent_size = 2

[*.{js,jsx,ts,tsx,mjs,cjs}]
indent_style = space
indent_size = 4

[*.md]
indent_style = space
indent_size = 2
trim_trailing_whitespace = false
`);
		const overrides = await loadCustomTemplate(state.file);
		assert.equal(overrides.bodies.size, 3);
		assert.equal(overrides.bodies.get('base').get('indent_size'), '2');
		assert.equal(overrides.bodies.get('javascript').get('indent_size'), '4');
		assert.equal(overrides.bodies.get('markdown').get('trim_trailing_whitespace'), 'false');
		assert.match(overrides.rawSections.get('base'), /^root = true\n\n\[\*\]\n/u);
		assert.match(overrides.rawSections.get('javascript'), /^\[\*\.\{js,/u);
		assert.match(overrides.rawSections.get('markdown'), /^\[\*\.md\]\n/u);
	});
});

describe('loadCustomTemplate — line endings', () => {
	it('parses a CRLF-line-ending template equivalently to LF', async () => {
		write(OVERRIDE_BASE_MARKDOWN.replaceAll('\n', '\r\n'));
		const overrides = await loadCustomTemplate(state.file);
		assert.equal(overrides.hasRoot, true);
		assert.equal(overrides.bodies.size, 2);
		assert.equal(overrides.bodies.get('base').get('indent_style'), 'space');
		assert.equal(overrides.bodies.get('markdown').get('indent_size'), '4');
	});
});

describe('loadCustomTemplate — missing file', () => {
	it('rejects when the file does not exist', async () => {
		await assert.rejects(
			loadCustomTemplate(join(state.workdir, 'nope.editorconfig')),
			/does not exist/u,
		);
	});
});

describe('loadCustomTemplate — empty path', () => {
	it('rejects with a distinct error for an empty string', async () => {
		await assert.rejects(
			loadCustomTemplate(''),
			/--template requires a path/u,
		);
	});

	it('rejects with a distinct error for a whitespace-only string', async () => {
		await assert.rejects(
			loadCustomTemplate('   '),
			/--template requires a path/u,
		);
	});
});

describe('loadCustomTemplate — header validation', () => {
	it('rejects on an unknown header', async () => {
		write(`root = true

[*]
indent_style = tab
indent_size = 4

[*.proto]
indent_style = space
`);
		await assert.rejects(
			loadCustomTemplate(state.file),
			(error) => {
				assert.match(error.message, /unknown header '\[\*\.proto\]'/u);
				assert.match(error.message, /Allowed:/u);
				return true;
			},
		);
	});

	it('rejects on duplicate headers', async () => {
		write(`root = true

[*]
indent_style = space

[*]
indent_style = tab
`);
		await assert.rejects(
			loadCustomTemplate(state.file),
			/declares header '\[\*\]' more than once/u,
		);
	});
});

describe('loadCustomTemplate — root requirement', () => {
	it('rejects when [*] is overridden but root = true is missing', async () => {
		write(`[*]
indent_style = space
indent_size = 2
`);
		await assert.rejects(
			loadCustomTemplate(state.file),
			/missing 'root = true'/u,
		);
	});
});

describe('loadCustomTemplate — leading content before first header', () => {
	it('ignores comments and blank lines preceding the first section header', async () => {
		write(`# team-wide overrides — generated by tooling
# do not edit by hand

root = true

[*]
indent_style = space
indent_size = 2
`);
		const overrides = await loadCustomTemplate(state.file);
		assert.equal(overrides.hasRoot, true);
		assert.equal(overrides.bodies.size, 1);
		assert.ok(overrides.bodies.has('base'));
		assert.equal(overrides.bodies.get('base').get('indent_style'), 'space');
		const rawBase = overrides.rawSections.get('base');
		assert.match(rawBase, /^root = true\n\n\[\*\]\n/u);
		assert.doesNotMatch(rawBase, /team-wide overrides/u, 'preamble must not leak into rawSections');
		assert.doesNotMatch(rawBase, /do not edit/u, 'preamble must not leak into rawSections');
	});
});

describe('loadCustomTemplate — URL input', () => {
	it('loads via the URL branch with stubbed fetch', async () => {
		const original = globalThis.fetch;
		const body = OVERRIDE_BASE_MARKDOWN;
		globalThis.fetch = () => Promise.resolve({
			ok: true,
			status: 200,
			headers: new Headers(),
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(body));
					controller.close();
				},
			}),
		});
		try {
			const overrides = await loadCustomTemplate('https://example.com/team.editorconfig');
			assert.equal(overrides.bodies.size, 2);
			assert.equal(overrides.bodies.get('base').get('indent_size'), '2');
			assert.equal(overrides.bodies.get('markdown').get('indent_size'), '4');
		}
		finally {
			globalThis.fetch = original;
		}
	});
});
