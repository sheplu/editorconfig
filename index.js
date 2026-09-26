#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { compareEditorConfig } from './src/check.js';
import { parseCliArgs, printHelp, printVersion } from './src/cli/options.js';
import { dispatchValues } from './src/cli/dispatch.js';
import { runFix } from './src/cli/fix-flow.js';
import { createEditorConfig } from './src/cli/write-flow.js';

export { compareEditorConfig, createEditorConfig, runFix };

async function main() {
	const parsed = parseCliArgs(process.argv.slice(2));
	if (!parsed) {
		return;
	}
	if (parsed.values.help) {
		printHelp();
		return;
	}
	if (parsed.values.version) {
		printVersion();
		return;
	}
	await dispatchValues(parsed.values);
};

export function isCliInvocation() {
	// Npm installs the bin as a symlink: argv[1] is the link while
	// `import.meta.filename` is its resolved target, so realpath both sides.
	try {
		return realpathSync(process.argv[1]) === import.meta.filename;
	}
	catch {
		return false;
	}
}

if (isCliInvocation()) {
	await main();
}
