import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_BASE_FILE, TWO_SPACE_BASE_FILE, withSection } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));

const state = { workdir: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-recursive-contracts-'));
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

function countMatches(text, pattern) {
	return (text.match(pattern) ?? []).length;
}

const VALID_ROOT = BUILTIN_BASE_FILE;

// Custom-template variant: a non-canonical [*.py] body to prove children skip body checks.
const CUSTOM_PY_SECTION = `[*.py]
indent_style = space
indent_size = 8
max_line_length = 200
`;
const TEMPLATE_PY_INDENT_8 = withSection(TWO_SPACE_BASE_FILE, CUSTOM_PY_SECTION);

describe('check --recursive — summary line format', () => {
	it('uses singular forms when counts are exactly one', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[*]\nindent_style = space\n[Cargo.toml]\nfoo = bar\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /2 files checked/u);
		assert.match(res.stdout, /1 warning(?!s)/u);
		assert.match(res.stdout, /1 unknown header ignored/u);
	});

	it('reports cross-file failures distinct from per-file failures', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', 'root = true\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.notEqual(res.status, 0);
		assert.match(res.stdout, /1 failed/u);
		assert.match(res.stdout, /1 cross-file failure/u);
	});
});

describe('check --recursive — template scope on children', () => {
	it('passes a child whose section body matches neither built-in nor template', () => {
		const templatePath = join(state.workdir, 'team.editorconfig');
		writeFileSync(templatePath, TEMPLATE_PY_INDENT_8, 'utf8');
		writeFile('.editorconfig', TWO_SPACE_BASE_FILE);
		// Child has [*.py] indent_size=2: not 4 (built-in), not 8 (template).
		// Children skip body validation, so this passes.
		writeFile('packages/svc/.editorconfig', '[*.py]\nindent_size = 2\n');
		const res = runCli(['--mode=check', '--recursive', `--template=${templatePath}`]);
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\bPASS\b/u);
	});
});

describe('check --recursive — multi-level cascade', () => {
	it('compares deep child against the immediate root, not intermediate ancestors', () => {
		writeFile('.editorconfig', VALID_ROOT);
		writeFile('packages/svc/.editorconfig', '[*]\nindent_style = space\n');
		// Deep matches mid's override but contradicts root's [*] indent_style = tab.
		// Both mid and deep are flagged: we do NOT cascade transitively.
		writeFile('packages/svc/sub/.editorconfig', '[*]\nindent_style = space\n');
		const res = runCli(['--mode=check', '--recursive']);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(countMatches(res.stdout, /contradicts root/gu), 2);
	});
});
