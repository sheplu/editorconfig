import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	AVAILABLE_LANGUAGES,
	AVAILABLE_PRESETS,
	composeEditorConfig,
	DEFAULT_PRESET,
	expectedBodyForLanguage,
	resolvePreset,
} from '../../src/templates/index.js';
import { buildCheckJson, runCheck } from '../../src/check.js';
import { runCheckRecursive } from '../../src/check-recursive.js';
import { logger } from '../../src/utils/logger.js';
import { BUILTIN_BASE_FILE } from '../fixtures/editorconfig.js';

function contextFor(preset) {
	return {
		bodies: new Map(),
		rawSections: new Map(),
		hasRoot: false,
		preset,
	};
}

function captureLog(fn) {
	const original = logger.log;
	let captured = '';
	logger.log = (msg) => { captured += msg; };
	try {
		fn();
	} finally {
		logger.log = original;
	}
	return captured;
}

describe('resolvePreset', () => {
	it('exposes default and minimal as the available presets', () => {
		assert.deepEqual(AVAILABLE_PRESETS, ['default', 'minimal']);
		assert.equal(DEFAULT_PRESET, 'default');
	});

	it('defaults to the default preset when no name is given', () => {
		assert.equal(resolvePreset(), resolvePreset('default'));
	});

	it('resolves minimal to a full template set', () => {
		const preset = resolvePreset('minimal');
		assert.equal(typeof preset.base, 'string');
		for (const name of AVAILABLE_LANGUAGES) {
			assert.equal(typeof preset.languages[name], 'string', name);
		}
	});

	it('throws on unknown preset with a helpful message', () => {
		assert.throws(
			() => resolvePreset('foobar'),
			(error) => {
				assert.match(error.message, /unknown preset: 'foobar'/u);
				assert.match(error.message, /Available: default, minimal/u);
				return true;
			},
		);
	});
});

describe('preset templates — header parity', () => {
	it('every minimal language section keeps the default header', () => {
		const def = resolvePreset('default');
		const min = resolvePreset('minimal');
		for (const name of AVAILABLE_LANGUAGES) {
			assert.equal(
				min.languages[name].split('\n', 1)[0],
				def.languages[name].split('\n', 1)[0],
				name,
			);
		}
	});

	it('the minimal base keeps the root preamble and [*] header', () => {
		assert.ok(resolvePreset('minimal').base.startsWith('root = true\n\n[*]\n'));
	});
});

describe('composeEditorConfig — presets', () => {
	it('default compose includes max_line_length = 120 in the base section', () => {
		assert.match(composeEditorConfig([]), /max_line_length = 120\n/u);
	});

	it('minimal compose drops the editor-specific base keys', () => {
		const output = composeEditorConfig([], contextFor('minimal'));
		assert.ok(output.startsWith('root = true\n'));
		assert.doesNotMatch(output, /spelling_language|quote_type|spaces_around_operators|max_line_length/u);
	});

	it('minimal javascript drops quote_type but keeps indentation', () => {
		const output = composeEditorConfig(['js'], contextFor('minimal'));
		assert.match(output, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]\nindent_style = tab\n/u);
		assert.doesNotMatch(output, /quote_type/u);
	});

	it('minimal keeps indent-only sections identical to default', () => {
		const minimalYaml = composeEditorConfig(['yaml'], contextFor('minimal')).split('\n\n').at(-1);
		const defaultYaml = composeEditorConfig(['yaml']).split('\n\n').at(-1);
		assert.equal(minimalYaml, defaultYaml);
	});

	it('raw section overrides beat the minimal preset', () => {
		const overrides = contextFor('minimal');
		overrides.rawSections.set('base', 'root = true\n\n[*]\nindent_style = space\nindent_size = 2');
		overrides.hasRoot = true;
		const output = composeEditorConfig([], overrides);
		assert.match(output, /^root = true\n\n\[\*\]\nindent_style = space\nindent_size = 2\n$/u);
	});

	it('throws on an unknown preset in the overrides context', () => {
		assert.throws(
			() => composeEditorConfig([], contextFor('team')),
			/unknown preset: 'team'/u,
		);
	});
});

describe('expectedBodyForLanguage — presets', () => {
	it('minimal python omits max_line_length', () => {
		const body = expectedBodyForLanguage('python', contextFor('minimal'));
		assert.equal(body.has('max_line_length'), false);
		assert.equal(body.get('indent_size'), '4');
	});

	it('minimal rust omits max_line_length', () => {
		const body = expectedBodyForLanguage('rust', contextFor('minimal'));
		assert.equal(body.has('max_line_length'), false);
	});

	it('default python keeps its max_line_length override', () => {
		assert.equal(expectedBodyForLanguage('python').get('max_line_length'), '88');
	});

	it('default base includes max_line_length = 120', () => {
		assert.equal(expectedBodyForLanguage('base').get('max_line_length'), '120');
	});

	it('minimal base drops the editor-specific keys but keeps the universal ones', () => {
		const body = expectedBodyForLanguage('base', contextFor('minimal'));
		assert.equal(body.has('spelling_language'), false);
		assert.equal(body.has('quote_type'), false);
		assert.equal(body.has('spaces_around_operators'), false);
		assert.ok(body.has('charset'));
		assert.equal(body.get('end_of_line'), 'lf');
		assert.equal(body.get('insert_final_newline'), 'true');
	});

	it('custom-template body overrides beat the preset', () => {
		const overrides = contextFor('minimal');
		overrides.bodies.set('base', new Map([['indent_style', 'space']]));
		assert.equal(expectedBodyForLanguage('base', overrides).get('indent_style'), 'space');
	});
});

describe('check entry points — preset defaults for direct callers', () => {
	const state = { workdir: '', target: '' };

	beforeEach(() => {
		state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-preset-defaults-'));
		state.target = join(state.workdir, '.editorconfig');
	});

	afterEach(() => {
		rmSync(state.workdir, { recursive: true, force: true });
	});

	it('runCheck without overrides labels the JSON with the default preset', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		const output = captureLog(() => runCheck({ path: state.target, json: true }));
		const payload = JSON.parse(output);
		assert.equal(payload.preset, 'default');
		assert.equal(payload.ok, true);
	});

	it('runCheckRecursive without overrides labels the JSON with the default preset', () => {
		const output = captureLog(() => runCheckRecursive({ startDir: state.workdir, json: true }));
		const payload = JSON.parse(output);
		assert.equal(payload.preset, 'default');
		assert.equal(payload.ok, true);
		assert.deepEqual(payload.files, []);
	});

	it('buildCheckJson defaults the preset field to default', () => {
		const payload = buildCheckJson({
			path: state.target,
			report: { baseIssues: [], results: [] },
			failed: false,
		});
		assert.equal(payload.preset, 'default');
	});
});
