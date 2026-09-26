import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCliInvocation } from '../../index.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const SKIP_SYMLINK = process.platform === 'win32';

const state = { workdir: '', argv: [] };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-entry-'));
	state.argv = [...process.argv];
});

afterEach(() => {
	process.argv = state.argv;
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('isCliInvocation', () => {
	it('returns true when argv[1] is the entry module itself', () => {
		process.argv[1] = cliEntry;
		assert.equal(isCliInvocation(), true);
	});

	it('returns true when argv[1] is a symlink to the entry module (npm bin shim)', { skip: SKIP_SYMLINK }, () => {
		const link = join(state.workdir, 'editorconfig-link');
		symlinkSync(cliEntry, link);
		process.argv[1] = link;
		assert.equal(isCliInvocation(), true);
	});

	it('returns false when argv[1] is an unrelated existing file', () => {
		process.argv[1] = import.meta.filename;
		assert.equal(isCliInvocation(), false);
	});

	it('returns false when argv[1] does not exist on disk', () => {
		process.argv[1] = join(state.workdir, 'missing.js');
		assert.equal(isCliInvocation(), false);
	});

	it('returns false when argv[1] is absent (embedded import)', () => {
		process.argv = process.argv.slice(0, 1);
		assert.equal(isCliInvocation(), false);
	});
});
