import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	chmodSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '../../src/utils/atomic-write.js';

const SKIP_LOCKED = process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);
const SKIP_SYMLINK = process.platform === 'win32';

const OCTAL = 8;
const PRIVATE_MODE = 0o600;
const READONLY_DIR_MODE = 0o500;
const WRITABLE_DIR_MODE = 0o700;

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-atomic-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	chmodSync(state.workdir, WRITABLE_DIR_MODE);
	rmSync(state.workdir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
	it('creates a new file with the given content', () => {
		writeFileAtomic(state.target, 'root = true\n');
		assert.equal(readFileSync(state.target, 'utf8'), 'root = true\n');
	});

	it('replaces an existing file', () => {
		writeFileSync(state.target, 'old content\n', 'utf8');
		writeFileAtomic(state.target, 'new content\n');
		assert.equal(readFileSync(state.target, 'utf8'), 'new content\n');
	});

	it('leaves no temp file behind after a successful write', () => {
		writeFileAtomic(state.target, 'root = true\n');
		assert.deepEqual(readdirSync(state.workdir), ['.editorconfig']);
	});

	it('preserves the permissions of the replaced file', { skip: SKIP_LOCKED }, () => {
		writeFileSync(state.target, 'old\n', { encoding: 'utf8', mode: PRIVATE_MODE });
		writeFileAtomic(state.target, 'new\n');
		assert.ok(statSync(state.target).mode.toString(OCTAL).endsWith('600'), 'mode 0600 must be preserved');
	});

	it('writes through a symlink to its target', { skip: SKIP_SYMLINK }, () => {
		const real = join(state.workdir, 'real.editorconfig');
		const link = join(state.workdir, 'link.editorconfig');
		writeFileSync(real, 'old\n', 'utf8');
		symlinkSync(real, link);
		writeFileAtomic(link, 'new\n');
		assert.equal(readFileSync(real, 'utf8'), 'new\n');
		assert.equal(realpathSync(link), realpathSync(real), 'the symlink must stay a symlink');
	});

	it('keeps the original intact and cleans up when the write fails', { skip: SKIP_LOCKED }, () => {
		writeFileSync(state.target, 'original\n', 'utf8');
		chmodSync(state.workdir, READONLY_DIR_MODE);
		assert.throws(() => writeFileAtomic(state.target, 'replacement\n'), /EACCES|EPERM/u);
		chmodSync(state.workdir, WRITABLE_DIR_MODE);
		assert.equal(readFileSync(state.target, 'utf8'), 'original\n');
		assert.deepEqual(readdirSync(state.workdir), ['.editorconfig'], 'no temp file may remain');
	});
});
