#!/usr/bin/env node

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

if (process.argv[1] === import.meta.filename) {
	await main();
}
