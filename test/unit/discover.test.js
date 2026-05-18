import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverEditorConfigs, IGNORED_DIRS } from '../../src/discover.js';
import { logger } from '../../src/utils/logger.js';

const state = { workdir: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-discover-'));
});

afterEach(() => {
	try {
		chmodSync(state.workdir, 0o755);
	}
	catch {
		// Best-effort restore so afterEach can clean up.
	}
	rmSync(state.workdir, { recursive: true, force: true });
});

function captureWarnings(fn) {
	const original = logger.warn;
	const captured = [];
	logger.warn = (...args) => { captured.push(args.join(' ')); };
	try {
		return { result: fn(), captured };
	}
	finally {
		logger.warn = original;
	}
}

describe('discoverEditorConfigs — symlinks', () => {
	it('does not descend into a symlinked directory', () => {
		mkdirSync(join(state.workdir, 'real'), { recursive: true });
		writeFileSync(join(state.workdir, 'real', '.editorconfig'), 'root = true\n', 'utf8');
		symlinkSync(join(state.workdir, 'real'), join(state.workdir, 'linked'), 'dir');

		const found = discoverEditorConfigs(state.workdir);
		assert.deepEqual(found, [join(state.workdir, 'real', '.editorconfig')]);
	});
});

function setupLockedDir() {
	writeFileSync(join(state.workdir, '.editorconfig'), 'root = true\n', 'utf8');
	const locked = join(state.workdir, 'locked');
	mkdirSync(locked, { recursive: true });
	writeFileSync(join(locked, '.editorconfig'), 'root = true\n', 'utf8');
	chmodSync(locked, 0o000);
	return locked;
}

const SKIP_LOCKED = process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);

describe('discoverEditorConfigs — unreadable directories', () => {
	it('warns and continues when a directory cannot be read', { skip: SKIP_LOCKED }, () => {
		const locked = setupLockedDir();
		try {
			const { result, captured } = captureWarnings(() => discoverEditorConfigs(state.workdir));
			assert.deepEqual(result, [join(state.workdir, '.editorconfig')]);
			assert.equal(captured.length, 1);
			assert.match(captured[0], /Skipping unreadable directory/u);
		}
		finally {
			chmodSync(locked, 0o755);
		}
	});
});

describe('discoverEditorConfigs — non-editorconfig files', () => {
	it('skips regular files whose name is not .editorconfig', () => {
		writeFileSync(join(state.workdir, 'README.md'), '# hi\n', 'utf8');
		writeFileSync(join(state.workdir, '.editorconfig'), 'root = true\n', 'utf8');
		const found = discoverEditorConfigs(state.workdir);
		assert.deepEqual(found, [join(state.workdir, '.editorconfig')]);
	});
});

describe('discoverEditorConfigs — ignored directories', () => {
	for (const ignored of IGNORED_DIRS) {
		it(`skips .editorconfig inside ${ignored}/`, () => {
			writeFileSync(join(state.workdir, '.editorconfig'), 'root = true\n', 'utf8');
			const buried = join(state.workdir, ignored, 'pkg');
			mkdirSync(buried, { recursive: true });
			writeFileSync(join(buried, '.editorconfig'), '[*]\nindent_style = tab\n', 'utf8');
			const found = discoverEditorConfigs(state.workdir);
			assert.deepEqual(found, [join(state.workdir, '.editorconfig')]);
		});
	}
});

describe('discoverEditorConfigs — deterministic ordering', () => {
	it('returns the same order across runs even when subdirs are created out-of-sequence', () => {
		writeFileSync(join(state.workdir, '.editorconfig'), 'root = true\n', 'utf8');
		// Create siblings in non-lex order so any reliance on inode/creation order surfaces.
		for (const name of ['pkg-5', 'pkg-1', 'pkg-9', 'pkg-2', 'pkg-7']) {
			const dir = join(state.workdir, name);
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, '.editorconfig'), '[*.py]\nindent_size = 2\n', 'utf8');
		}
		const first = discoverEditorConfigs(state.workdir);
		const second = discoverEditorConfigs(state.workdir);
		assert.deepEqual(first, second);
		assert.deepEqual(
			first.map((entry) => entry.replace(`${state.workdir}/`, '')),
			[
				'.editorconfig',
				'pkg-1/.editorconfig',
				'pkg-2/.editorconfig',
				'pkg-5/.editorconfig',
				'pkg-7/.editorconfig',
				'pkg-9/.editorconfig',
			],
		);
	});
});
