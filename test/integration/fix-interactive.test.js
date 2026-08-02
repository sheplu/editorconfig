import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node-pty';
import { BUILTIN_BASE_FILE } from '../fixtures/editorconfig.js';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));
const PROMPT_TIMEOUT_MS = 5000;
const TAMPERED_CONTENT = BUILTIN_BASE_FILE.replace('indent_size = 4', 'indent_size = 2');

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-fix-pty-'));
	state.target = join(state.workdir, '.editorconfig');
});

afterEach(() => {
	rmSync(state.workdir, { recursive: true, force: true });
});

function runInteractive(args, reply) {
	return new Promise((resolve, reject) => {
		const proc = spawn(process.execPath, [cliEntry, ...args], {
			name: 'xterm-256color',
			cols: 80,
			rows: 30,
			cwd: state.workdir,
		});

		let output = '';
		let replied = false;

		const timer = setTimeout(() => {
			proc.kill();
			reject(new Error(`runInteractive timed out after ${PROMPT_TIMEOUT_MS}ms. Output so far:\n${output}`));
		}, PROMPT_TIMEOUT_MS);

		proc.onData((chunk) => {
			output += chunk;
			if (!replied && /Apply these changes\?/u.test(output)) {
				replied = true;
				proc.write(reply);
			}
		});

		proc.onExit(({ exitCode }) => {
			clearTimeout(timer);
			resolve({ exitCode, output: output.replaceAll('\r', '') });
		});
	});
}

describe('fix mode interactive — accepts fix', () => {
	it('answers "y" and writes the fixed file', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode, output } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'y\r',
		);
		assert.equal(exitCode, 0);
		assert.match(output, /mismatch/u);
		assert.match(readFileSync(state.target, 'utf8'), /^root = true/u);
		assert.match(readFileSync(state.target, 'utf8'), /indent_size = 4/u);
	});

	it('answers "yes" and writes the fixed file', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'yes\r',
		);
		assert.equal(exitCode, 0);
		assert.match(readFileSync(state.target, 'utf8'), /indent_size = 4/u);
	});

	it('answers "Y" (uppercase) and writes the fixed file', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'Y\r',
		);
		assert.equal(exitCode, 0);
		assert.match(readFileSync(state.target, 'utf8'), /indent_size = 4/u);
	});

	it('answers "YES" (uppercase) and writes the fixed file', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'YES\r',
		);
		assert.equal(exitCode, 0);
		assert.match(readFileSync(state.target, 'utf8'), /indent_size = 4/u);
	});
});

describe('fix mode interactive — declines fix', () => {
	it('answers "n" and leaves the file unchanged', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode, output } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'n\r',
		);
		assert.equal(exitCode, 0);
		assert.match(output, /Skipped/u);
		assert.equal(readFileSync(state.target, 'utf8'), TAMPERED_CONTENT);
	});

	it('answers with bare Enter and leaves the file unchanged', async () => {
		writeFileSync(state.target, TAMPERED_CONTENT, 'utf8');
		const { exitCode } = await runInteractive(
			['--mode=fix', `--path=${state.target}`],
			'\r',
		);
		assert.equal(exitCode, 0);
		assert.equal(readFileSync(state.target, 'utf8'), TAMPERED_CONTENT);
	});
});

describe('fix mode interactive — nothing to fix', () => {
	it('does not prompt when there are no changes', () => {
		writeFileSync(state.target, BUILTIN_BASE_FILE, 'utf8');
		return new Promise((resolve, reject) => {
			const proc = spawn(process.execPath, [cliEntry, '--mode=fix', `--path=${state.target}`], {
				name: 'xterm-256color',
				cols: 80,
				rows: 30,
				cwd: state.workdir,
			});

			let output = '';

			const timer = setTimeout(() => {
				proc.kill();
				reject(new Error(`timed out. Output so far:\n${output}`));
			}, PROMPT_TIMEOUT_MS);

			proc.onData((chunk) => {
				output += chunk;
			});

			proc.onExit(({ exitCode }) => {
				clearTimeout(timer);
				assert.equal(exitCode, 0);
				assert.match(output, /Nothing to fix/u);
				assert.doesNotMatch(output, /Apply these changes/u);
				resolve();
			});
		});
	});
});
