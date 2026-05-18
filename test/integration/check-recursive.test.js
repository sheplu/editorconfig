import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	BUILTIN_BASE_FILE,
	JAVASCRIPT_SECTION,
	PYTHON_CHILD_FILE,
	PYTHON_SECTION,
	TWO_SPACE_BASE_FILE,
	withSection,
} from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-recursive-'));
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
const VALID_CHILD_PY = PYTHON_CHILD_FILE;

describe('check --recursive — single tree', () => {
	it('passes when only one .editorconfig exists (single root)', () => {
		writeFile('.editorconfig', VALID_ROOT);
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /1 file checked/u);
	});

	it('passes a valid root + valid child with non-overlapping section', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', VALID_CHILD_PY);
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /2 files checked/u);
		assert.match(res.stdout, /\[root\]/u);
		assert.match(res.stdout, /\[child\]/u);
	});

	it('treats sibling subtrees as independent roots', () => {
		writeFile('packages/a/.editorconfig', VALID_ROOT);
		writeFile('packages/b/.editorconfig', VALID_ROOT);
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /2 files checked/u);
		const rootOccurrences = res.stdout.match(/\[root\]/gu) ?? [];
		assert.equal(rootOccurrences.length, 2);
	});
});

function countMatches(text, pattern) {
	return (text.match(pattern) ?? []).length;
}

describe('check --recursive — tree depth', () => {
	it('handles a 3-level tree (root + mid + deep)', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[*.py]\nmax_line_length = 100\n');
		writeFile('packages/svc/internal/.editorconfig', '[*.py]\nindent_size = 2\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /3 files checked/u);
		assert.equal(countMatches(res.stdout, /\[root\]/gu), 1);
		assert.equal(countMatches(res.stdout, /\[child\]/gu), 2);
	});
});

describe('check --recursive — start path validation', () => {
	it('errors when --path points to a nonexistent location', () => {
		const missing = join(state.workdir, 'does-not-exist');
		const res = runCli(['--mode=check', '--recursive', `--path=${missing}`]);
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /does not exist/u);
	});

	it('falls back to the parent directory when --path points to a file', () => {
		writeFile('.editorconfig', VALID_ROOT);
		const target = join(state.workdir, '.editorconfig');
		const res = runCli(['--mode=check', '--recursive', `--path=${target}`]);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stderr, /--recursive expects a directory/u);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /1 file checked/u);
	});
});

describe('check --recursive — discovery', () => {
	it('reports a friendly message when no .editorconfig is found', () => {
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /No \.editorconfig files found/u);
	});

	it('ignores .editorconfig inside node_modules', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('node_modules/pkg/.editorconfig', '[*]\nindent_style = tab\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /1 file checked/u);
		assert.doesNotMatch(res.stdout, /node_modules/u);
	});

	it('honors --path as the start directory and ignores files outside it', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', VALID_ROOT);
		const sub = join(state.workdir, 'packages', 'svc');
		const res = runCli(['--mode=check', '--recursive', `--path=${sub}`]);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /1 file checked/u);
	});
});

describe('check --recursive — cross-file', () => {
	it('fails when a child declares root = true', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', `root = true\n\n${VALID_CHILD_PY}`);
		const res = runCli(['--mode=check', '--recursive']);
		assert.notEqual(res.status, 0);
		assert.match(res.stdout, /\bFAIL\b/u);
		assert.match(res.stdout, /packages\/svc\/\.editorconfig/u);
		assert.match(res.stdout, /child file must not declare 'root = true'/u);
	});

	it('warns on redundant child values that match root verbatim', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[*]\nindent_style = tab\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /Cross-file warnings/u);
		assert.match(res.stdout, /redundant/u);
	});

	it('warns on contradiction when child reuses the same header with a different value', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[*]\nindent_style = space\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /contradicts root/u);
	});

	it('is silent when child uses a different glob (e.g. [*.js] vs root [*])', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/web/.editorconfig', '[*.js]\nindent_size = 2\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.doesNotMatch(res.stdout, /Cross-file warnings/u);
		assert.doesNotMatch(res.stdout, /contradicts/u);
	});

	it('reports both child-root and contradiction when combined', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', 'root = true\n\n[*]\nindent_style = space\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.notEqual(res.status, 0);
		assert.match(res.stdout, /\bFAIL\b/u);
		assert.match(res.stdout, /child file must not declare 'root = true'/u);
		assert.match(res.stdout, /contradicts root/u);
	});

});

describe('check --recursive — cross-file (multi-child)', () => {
	it('flags redundant and contradiction on non-[*] headers', () => {
		writeFile('.editorconfig', withSection(BUILTIN_BASE_FILE, PYTHON_SECTION));
		writeFile('packages/svc-a/.editorconfig', '[*.py]\nindent_size = 4\n');
		writeFile('packages/svc-b/.editorconfig', '[*.py]\nindent_size = 2\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /Cross-file warnings/u);
		assert.match(res.stdout, /redundant/u);
		assert.match(res.stdout, /contradicts root \[\*\.py\]/u);
	});

	it('reports mixed outcomes across multiple children', () => {
		const tree = {
			'.editorconfig': VALID_ROOT,
			'packages/clean/.editorconfig': '[*.py]\nindent_size = 2\n',
			'packages/redundant/.editorconfig': '[*]\nindent_style = tab\n',
			'packages/contra/.editorconfig': '[*]\nindent_style = space\n',
			'packages/badroot/.editorconfig': 'root = true\n\n[*]\nindent_style = tab\n',
		};
		for (const [rel, body] of Object.entries(tree)) {
			writeFile(rel, body);
		}
		const res = runCli(['--mode=check', '--recursive']);
		assert.notEqual(res.status, 0);
		assert.match(res.stdout, /\bFAIL\b.*5 files checked/su);
		assert.match(res.stdout, /redundant/u);
		assert.match(res.stdout, /contradicts root/u);
		assert.match(res.stdout, /packages\/badroot\/\.editorconfig declares 'root = true'/u);
	});
});

describe('check --recursive — flag interactions', () => {
	it('applies --languages only to the root file', () => {
		writeFile('.editorconfig', withSection(BUILTIN_BASE_FILE, JAVASCRIPT_SECTION));
		writeFile('packages/svc/.editorconfig', VALID_CHILD_PY);
		const res = runCli(['--mode=check', '--recursive', '--languages=js']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
	});

	it('warns but passes when a child has an unknown header without --strict', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[Cargo.toml]\nfoo = bar\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
		assert.match(res.stdout, /⚠️\s+\[Cargo\.toml\]/u);
		assert.match(res.stdout, /unknown header(s)? ignored/u);
	});

	it('fails with --strict when a child has an unknown header', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[Cargo.toml]\nfoo = bar\n');
		const res = runCli(['--mode=check', '--recursive', '--strict']);
		assert.notEqual(res.status, 0);
		assert.match(res.stdout, /\bFAIL\b/u);
		assert.match(res.stdout, /\[Cargo\.toml\]/u);
	});

	it('applies --template overrides to root section comparison', () => {
		writeFile('.editorconfig', TWO_SPACE_BASE_FILE);
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, TWO_SPACE_BASE_FILE, 'utf8');
		const without = runCli(['--mode=check', '--recursive']);
		assert.notEqual(without.status, 0);
		const withTemplate = runCli(['--mode=check', '--recursive', `--template=${templatePath}`]);
		assert.equal(withTemplate.status, 0, withTemplate.stderr);
		assert.match(withTemplate.stdout, /\bPASS\b/u);
	});
});

describe('check --recursive — rejected combinations', () => {
	it('rejects --mode=write --recursive and writes nothing', () => {
		const target = join(state.workdir, '.editorconfig');
		const res = runCli(['--mode=write', '--recursive']);
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /--recursive \(-r\)/u);
		assert.equal(existsSync(target), false);
	});

	it('rejects --mode=write -r (short form) with the same message', () => {
		const target = join(state.workdir, '.editorconfig');
		const res = runCli(['--mode=write', '-r']);
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /--recursive \(-r\)/u);
		assert.equal(existsSync(target), false);
	});
});
