import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node-pty';

const cliEntry = fileURLToPath(new URL('../../index.js', import.meta.url));
const PROMPT_TIMEOUT_MS = 5000;
const PREVIOUS = 'previous content';

const state = { workdir: '', target: '' };

beforeEach(() => {
	state.workdir = mkdtempSync(join(tmpdir(), 'editorconfig-pty-'));
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
			if (!replied && /Overwrite\?/u.test(output)) {
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

function expectOverwrite(reply) {
	writeFileSync(state.target, PREVIOUS, 'utf8');
	return runInteractive(['--mode=write', `--path=${state.target}`, '--languages='], reply)
		.then(({ exitCode }) => {
			assert.equal(exitCode, 0);
			assert.match(readFileSync(state.target, 'utf8'), /^root = true/u);
		});
}

function expectSkip(reply) {
	writeFileSync(state.target, PREVIOUS, 'utf8');
	return runInteractive(['--mode=write', `--path=${state.target}`, '--languages='], reply)
		.then(({ exitCode, output }) => {
			assert.equal(exitCode, 0);
			assert.match(output, /Skipped/u);
			assert.equal(readFileSync(state.target, 'utf8'), PREVIOUS);
		});
}

describe('write mode interactive prompt — accepts overwrite', () => {
	it('answers "y"', () => expectOverwrite('y\r'));
	it('answers "Y"', () => expectOverwrite('Y\r'));
	it('answers "yes"', () => expectOverwrite('yes\r'));
	it('answers "YES"', () => expectOverwrite('YES\r'));
});

describe('write mode interactive prompt — declines overwrite', () => {
	it('answers "n"', () => expectSkip('n\r'));
	it('answers with a bare Enter', () => expectSkip('\r'));
	it('answers with a non-matching word like "yeah"', () => expectSkip('yeah\r'));
	it('answers with whitespace only', () => expectSkip('   \r'));
});

function runWithPromptScript(args, replies) {
	return new Promise((resolve, reject) => {
		const proc = spawn(process.execPath, [cliEntry, ...args], {
			name: 'xterm-256color',
			cols: 80,
			rows: 30,
			cwd: state.workdir,
		});

		let output = '';
		let cursor = 0;

		const timer = setTimeout(() => {
			proc.kill();
			reject(new Error(`runWithPromptScript timed out after ${PROMPT_TIMEOUT_MS}ms. Output so far:\n${output}`));
		}, PROMPT_TIMEOUT_MS);

		proc.onData((chunk) => {
			output += chunk;
			while (cursor < replies.length) {
				const { match, reply } = replies[cursor];
				if (match.test(output)) {
					cursor += 1;
					proc.write(reply);
				}
				else {
					break;
				}
			}
		});

		proc.onExit(({ exitCode }) => {
			clearTimeout(timer);
			resolve({ exitCode, output: output.replaceAll('\r', '') });
		});
	});
}

function languageReply(reply) {
	return [{ match: /Languages\?/u, reply }];
}

function expectPromptOutput(reply, check) {
	return runWithPromptScript(
		['--mode=write', `--path=${state.target}`],
		languageReply(reply),
	).then(check);
}

describe('write mode language prompt — listing', () => {
	it('lists every available language in the prompt', () => expectPromptOutput('\r', ({ exitCode, output }) => {
		assert.equal(exitCode, 0);
		const expected = [
			'javascript', 'yaml', 'markdown', 'python', 'go', 'rust',
			'terraform', 'json', 'toml', 'shell', 'makefile', 'dockerfile',
			'html', 'css',
		];
		for (const name of expected) {
			assert.match(output, new RegExp(`\\b${name}\\b`, 'u'), `expected "${name}" in prompt`);
		}
	}));
});

describe('write mode language prompt — selection', () => {
	it('writes base only when the prompt answer is blank', () => expectPromptOutput('\r', ({ exitCode }) => {
		assert.equal(exitCode, 0);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /^root = true/u);
		assert.doesNotMatch(content, /\[\*\.md\]/u);
	}));

	it('writes the chosen languages when names are typed', () => expectPromptOutput('js, md\r', ({ exitCode }) => {
		assert.equal(exitCode, 0);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(content, /\[\*\.md\]/u);
		assert.doesNotMatch(content, /\[\*\.py\]/u);
	}));

	it('accepts numeric indices in the prompt answer', () => expectPromptOutput('1, 3\r', ({ exitCode }) => {
		assert.equal(exitCode, 0);
		const content = readFileSync(state.target, 'utf8');
		assert.match(content, /\[\*\.\{js,jsx,ts,tsx,mjs,cjs\}\]/u);
		assert.match(content, /\[\*\.md\]/u);
	}));
});
