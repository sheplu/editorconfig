import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
