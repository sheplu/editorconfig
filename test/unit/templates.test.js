import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as templates from '../../src/templates/index.js';
import {
	ALIASES,
	AVAILABLE_LANGUAGES,
	composeEditorConfig,
	editorconfigContent,
} from '../../src/templates/index.js';

const TEMPLATES = [
	{ name: 'base', header: '[*]' },
	{ name: 'javascript', header: '[*.{js,jsx,ts,tsx,mjs,cjs}]' },
	{ name: 'yaml', header: '[*.{yml,yaml}]' },
	{ name: 'markdown', header: '[*.md]' },
	{ name: 'python', header: '[*.py]' },
	{ name: 'go', header: '[*.go]' },
	{ name: 'rust', header: '[*.rs]' },
	{ name: 'terraform', header: '[*.{tf,tfvars}]' },
	{ name: 'json', header: '[*.json]' },
	{ name: 'toml', header: '[*.toml]' },
	{ name: 'shell', header: '[*.{sh,bash,zsh}]' },
	{ name: 'makefile', header: '[{Makefile,GNUmakefile,makefile,*.mk}]' },
	{ name: 'dockerfile', header: '[{Dockerfile,Dockerfile.*,*.dockerfile}]' },
	{ name: 'html', header: '[*.{html,htm}]' },
	{ name: 'css', header: '[*.{css,scss,sass,less}]' },
];

describe('per-language templates', () => {
	for (const { name, header } of TEMPLATES) {
		describe(name, () => {
			it('is exported as a non-empty string', () => {
				const value = templates[name];
				assert.equal(typeof value, 'string', `expected ${name} to be a string`);
				assert.notEqual(value.trim(), '', `expected ${name} to be non-empty`);
			});

			it(`contains its expected header line "${header}"`, () => {
				const value = templates[name];
				if (name === 'base') {
					assert.ok(
						value.startsWith('root = true\n'),
						'base must start with `root = true`',
					);
					assert.ok(
						value.includes(`\n${header}\n`),
						`base must contain "${header}" on its own line`,
					);
				}
				else {
					assert.ok(
						value.startsWith(`${header}\n`),
						`${name} must start with "${header}" followed by newline`,
					);
				}
			});

			it('ends with exactly one trailing newline', () => {
				const value = templates[name];
				assert.match(value, /[^\n]\n$/u, `${name} must end with a single \\n`);
			});
		});
	}
});

describe('editorconfigContent (composer)', () => {
	it('starts with `root = true`', () => {
		assert.ok(editorconfigContent.startsWith('root = true\n'));
	});

	it('ends with exactly one trailing newline', () => {
		assert.match(editorconfigContent, /[^\n]\n$/u);
	});

	it('contains every section header exactly once', () => {
		for (const { header } of TEMPLATES) {
			const occurrences = editorconfigContent.split(header).length - 1;
			assert.equal(
				occurrences,
				1,
				`expected header "${header}" to appear exactly once, got ${occurrences}`,
			);
		}
	});

	it('has no duplicate section headers anywhere in the output', () => {
		const headers = editorconfigContent
			.split('\n')
			.filter((line) => /^\[.*\]$/u.test(line));
		const unique = new Set(headers);
		assert.equal(headers.length, unique.size, `duplicate section header(s): ${[...headers]}`);
	});

	it('separates each section header with a preceding blank line', () => {
		const lines = editorconfigContent.split('\n');
		for (let index = 1; index < lines.length; index += 1) {
			const isHeader = /^\[.*\]$/u.test(lines[index]);
			const previous = lines[index - 1];
			const needsBlank = isHeader && previous !== 'root = true';
			if (needsBlank) {
				assert.equal(
					previous,
					'',
					`section "${lines[index]}" must be preceded by a blank line`,
				);
			}
		}
	});
});

describe('composeEditorConfig — base only', () => {
	it('returns base only when given an empty list', () => {
		const output = composeEditorConfig([]);
		assert.ok(output.startsWith('root = true\n'));
		assert.ok(output.includes('\n[*]\n'));
		for (const { header } of TEMPLATES.filter((entry) => entry.name !== 'base')) {
			assert.ok(!output.includes(header), `did not expect "${header}"`);
		}
	});

	it('defaults to base only when called with no arguments', () => {
		const output = composeEditorConfig();
		assert.ok(output.startsWith('root = true\n'));
		assert.ok(!output.includes('[*.md]'));
	});
});

describe('composeEditorConfig — selection', () => {
	it('includes the requested canonical languages', () => {
		const output = composeEditorConfig(['javascript', 'markdown']);
		assert.ok(output.includes('[*.{js,jsx,ts,tsx,mjs,cjs}]'));
		assert.ok(output.includes('[*.md]'));
		assert.ok(!output.includes('[*.py]'));
	});

	for (const [alias, target] of Object.entries(ALIASES)) {
		const expectedHeader = TEMPLATES.find((entry) => entry.name === target).header;
		it(`resolves alias "${alias}" to ${target}`, () => {
			const output = composeEditorConfig([alias]);
			assert.ok(
				output.includes(expectedHeader),
				`expected header "${expectedHeader}" for alias "${alias}"`,
			);
		});
	}

	it('every alias targets a known canonical language', () => {
		for (const target of Object.values(ALIASES)) {
			assert.ok(
				AVAILABLE_LANGUAGES.includes(target),
				`alias target "${target}" is not in AVAILABLE_LANGUAGES`,
			);
		}
	});

	it('no canonical language name is also registered as an alias', () => {
		for (const name of AVAILABLE_LANGUAGES) {
			assert.ok(
				!Object.hasOwn(ALIASES, name),
				`canonical language "${name}" must not appear as an alias key`,
			);
		}
	});

	it('orders sections by AVAILABLE_LANGUAGES regardless of input order', () => {
		const reverseOrder = composeEditorConfig(['markdown', 'javascript']);
		const canonicalOrder = composeEditorConfig(['javascript', 'markdown']);
		assert.equal(reverseOrder, canonicalOrder);
		assert.ok(canonicalOrder.indexOf('[*.{js,') < canonicalOrder.indexOf('[*.md]'));
	});

	it('deduplicates aliases and canonical names that resolve to the same language', () => {
		const output = composeEditorConfig(['js', 'javascript', 'ts']);
		const occurrences = output.split('[*.{js,jsx,ts,tsx,mjs,cjs}]').length - 1;
		assert.equal(occurrences, 1);
	});
});

describe('composeEditorConfig — errors and identity', () => {
	it('throws on unknown language with a helpful message', () => {
		assert.throws(
			() => composeEditorConfig(['foobar']),
			(error) => {
				assert.match(error.message, /unknown language: 'foobar'/u);
				assert.match(error.message, /Available:/u);
				return true;
			},
		);
	});

	it('produces editorconfigContent when given AVAILABLE_LANGUAGES', () => {
		assert.equal(composeEditorConfig(AVAILABLE_LANGUAGES), editorconfigContent);
	});
});

describe('composeEditorConfig — overrides', () => {
	it('emits the override section for base when present', () => {
		const overrides = {
			bodies: new Map(),
			rawSections: new Map([
				['base', 'root = true\n\n[*]\nindent_style = space\nindent_size = 2'],
			]),
			hasRoot: true,
		};
		const output = composeEditorConfig([], overrides);
		assert.match(output, /^root = true\n\n\[\*\]\nindent_style = space\nindent_size = 2\n$/u);
	});

	it('falls back to the built-in section when overrides do not define it', () => {
		const overrides = {
			bodies: new Map(),
			rawSections: new Map([
				['base', 'root = true\n\n[*]\nindent_style = space\nindent_size = 2'],
			]),
			hasRoot: true,
		};
		const output = composeEditorConfig(['javascript'], overrides);
		assert.match(output, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = tab\n/u);
	});

	it('emits override for one language and built-in for another in the same call', () => {
		const overrides = {
			bodies: new Map(),
			rawSections: new Map([
				['javascript', '[*.{js,jsx,ts,tsx,mjs,cjs}]\nindent_style = space\nindent_size = 2'],
			]),
			hasRoot: false,
		};
		const output = composeEditorConfig(['javascript', 'markdown'], overrides);
		assert.match(output, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = space\nindent_size = 2\n/u);
		assert.match(output, /\[\*\.md\]\nindent_style = space\n/u);
	});
});
