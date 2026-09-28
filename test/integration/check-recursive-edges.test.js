import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-recursive-edges-'));
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function runCli(args) {
	return spawnSync(process.execPath, [cliEntry, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		cwd: state.workdir,
	});
}

function writeFile(relPath, contents) {
	const full = join(state.workdir, relPath);
	mkdirSync(join(full, '..'), { recursive: true });
	writeFileSync(full, contents, 'utf8');
	return full;
}

const VALID_ROOT = BUILTIN_BASE_FILE;

describe('check --recursive — degenerate child files', () => {
	it('treats an empty child .editorconfig as a no-op pass', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/empty/.editorconfig', '');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /2 files checked/u);
		assert.match(res.stdout, /packages\/empty\/\.editorconfig \[child\]/u);
	});

	it('treats a comment-only child .editorconfig as a no-op pass', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/cmt/.editorconfig', '# Just a placeholder.\n# Nothing to enforce yet.\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /2 files checked/u);
	});
});

describe('check --recursive — non-conventional directories', () => {
	it('walks dot-directories that are not in IGNORED_DIRS (e.g. .github, .vscode)', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('.github/.editorconfig', '[*.yml]\nindent_size = 2\n');
		writeFile('.vscode/.editorconfig', '[*.json]\nindent_size = 2\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /3 files checked/u);
		assert.match(res.stdout, /\.github\/\.editorconfig \[child\]/u);
		assert.match(res.stdout, /\.vscode\/\.editorconfig \[child\]/u);
	});
});

describe('check --recursive — line endings', () => {
	it('handles CRLF line endings in both root and child files', () => {
		const crlfRoot = VALID_ROOT.replaceAll('\n', '\r\n');
		const crlfChild = '[*]\r\nindent_style = tab\r\n';
		writeFile('.editorconfig', crlfRoot);
		writeFile('pkg/.editorconfig', crlfChild);
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		// CRLF parses identically to LF; the child's [*] indent_style = tab is redundant vs root.
		assert.match(res.stdout, /redundant/u);
	});
});

describe('check --recursive — symlinked files', () => {
	const skip = process.platform === 'win32';
	it('skips a symlinked .editorconfig file (matches symlinked-directory behavior)', { skip }, () => {
		writeFile('.editorconfig', VALID_ROOT);
		// Real file in pkg/ alongside a symlink named .editorconfig pointing at it.
		// Today we skip ALL symlinks during discovery to keep behavior simple and loop-safe.
		writeFile('pkg/real.editorconfig', '[*.py]\nindent_size = 2\n');
		symlinkSync('real.editorconfig', join(state.workdir, 'pkg', '.editorconfig'), 'file');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		// The symlink is not picked up; only the root file is checked.
		assert.match(res.stdout, /1 file checked/u);
		assert.doesNotMatch(res.stdout, /pkg\/\.editorconfig/u);
	});
});

const SKIP_LOCKED = process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);

describe('check --recursive — unreadable directories', () => {
	it('fails when the start directory itself is unreadable', { skip: SKIP_LOCKED }, () => {
		writeFile('locked/.editorconfig', '[unclosed\n');
		const locked = join(state.workdir, 'locked');
		chmodSync(locked, 0o000);
		try {
			const result = runCli(['--mode=check', '--recursive', `--path=${locked}`, '--json']);
			assert.notEqual(result.status, 0, 'an unvalidated scan must not succeed');
			assert.match(result.stderr, /cannot read start directory/u);
			assert.equal(result.stdout.trim(), '', 'no ok:true payload may be emitted');
		}
		finally {
			chmodSync(locked, 0o755);
		}
	});

	function withLockedSubdir(check) {
		writeFile('.editorconfig', VALID_ROOT);
		const locked = join(state.workdir, 'locked');
		mkdirSync(locked, { recursive: true });
		chmodSync(locked, 0o000);
		try {
			check();
		}
		finally {
			chmodSync(locked, 0o755);
		}
	}

	it('reports skipped descendant directories in the --json payload', { skip: SKIP_LOCKED }, () => {
		withLockedSubdir(() => {
			const result = runCli(['--mode=check', '--recursive', '--json']);
			assert.equal(result.status, 0, result.stderr);
			const payload = JSON.parse(result.stdout);
			assert.equal(payload.ok, true);
			assert.deepEqual(payload.skippedDirs, ['locked']);
		});
	});

	it('mentions skipped directories in the text summary', { skip: SKIP_LOCKED }, () => {
		withLockedSubdir(() => {
			const result = runCli(['--mode=check', '--recursive']);
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /1 unreadable directory skipped/u);
		});
	});
});

describe('check --recursive — unreadable directories on an empty scan', () => {
	it('mentions skipped directories when the scan finds no files', { skip: SKIP_LOCKED }, () => {
		const locked = join(state.workdir, 'locked');
		mkdirSync(locked, { recursive: true });
		chmodSync(locked, 0o000);
		try {
			const result = runCli(['--mode=check', '--recursive']);
			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /No \.editorconfig files found/u);
			assert.match(result.stdout, /1 unreadable directory skipped/u);
		}
		finally {
			chmodSync(locked, 0o755);
		}
	});
});

describe('check --recursive — language filter validation', () => {
	it('rejects an unknown language even when the scan finds no files', () => {
		const result = runCli(['--mode=check', '--recursive', '--languages=typo']);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unknown language: 'typo'/u);
	});

	it('still reports an empty scan for an omitted or empty filter', () => {
		const empty = runCli(['--mode=check', '--recursive', '--languages=']);
		assert.equal(empty.status, 0, empty.stderr);
		assert.match(empty.stdout, /No \.editorconfig files found/u);
	});
});
