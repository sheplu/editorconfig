import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { printHelp, options } from '../../src/cli/options.js';
import { logger } from '../../src/utils/logger.js';

const SUPPORTED_COMMANDS = ['write', 'check'];

function captureHelp() {
	const original = logger.log;
	let captured = '';
	logger.log = (msg) => { captured += msg; };
	try {
		printHelp();
	} finally {
		logger.log = original;
	}
	return captured;
}

describe('printHelp', () => {
	it('output starts with a Usage line', () => {
		assert.match(captureHelp(), /Usage:/u);
	});

	it('lists every supported command', () => {
		const output = captureHelp();
		for (const command of SUPPORTED_COMMANDS) {
			assert.match(output, new RegExp(`\\b${command}\\b`, 'u'), `expected help output to mention command "${command}"`);
		}
	});

	it('lists every supported flag (long and short forms)', () => {
		const output = captureHelp();
		for (const [name, { short }] of Object.entries(options)) {
			assert.ok(output.includes(`--${name}`), `expected help output to mention --${name}`);
			if (short) {
				assert.ok(output.includes(`-${short}`), `expected help output to mention -${short}`);
			}
		}
	});
});
