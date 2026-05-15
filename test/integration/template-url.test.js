import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './template-helpers.js';

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-template-url-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('--template URL — scheme rejection', () => {
	it('rejects an http URL before performing any network call', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--template=http://example.com/team.editorconfig',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /--template URL must use https/u);
	});
});

describe('--template URL — connection refused', () => {
	it('exits non-zero with a fetch error when the URL is unreachable', () => {
		const result = runCli([
			'--mode=write',
			`--path=${state.target}`,
			'--template=https://127.0.0.1:1/nope',
		]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /failed to fetch/u);
	});
});
