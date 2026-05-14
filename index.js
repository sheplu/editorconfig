#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const editorconfigContent = `root = true

[*]
indent_style = tab
indent_size = 4
tab_width = 4
end_of_line = lf
charset = utf-8
spelling_language = en
trim_trailing_whitespace = true
insert_final_newline = true
quote_type = single
spaces_around_operators = true
`;

export function createEditorConfig(path = '.editorconfig') {
	writeFileSync(path, editorconfigContent, 'utf8');
};

export function compareEditorConfig(path = '.editorconfig') {
	const file = readFileSync(path).toString();
	if (editorconfigContent === file) {
		console.log('✅ Editorconfig is matching the expected configuration')
	}
	else {
		console.log('❌ Editorconfig is not matching the expected configuration');
	}
};

export const options = {
	mode: {
		type: 'string',
		short: 'm',
	},
	path: {
		type: 'string',
		short: 'p',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
	overwrite: {
		type: 'boolean',
		short: 'o',
	},
};

export function printHelp() {
	console.log(`Usage: editorconfig --mode=<command> [--path=<path>]

Commands:
  write    Create a .editorconfig file with the default template
  check    Compare an existing .editorconfig against the template

Options:
  -m, --mode       Command to run (write | check)
  -p, --path       Path to the .editorconfig file (default: .editorconfig)
  -o, --overwrite  Overwrite an existing .editorconfig without confirmation
  -h, --help       Show this help message`);
};

function runWrite(path, overwrite) {
	if (!existsSync(path) || overwrite) {
		createEditorConfig(path);
		return;
	}
	if (!process.stdin.isTTY) {
		console.error(`\`${path}\` already exists. Use --overwrite to replace it.`);
		process.exitCode = 1;
		return;
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	rl.question(`\`${path}\` already exists. Overwrite? [y/N] `, (answer) => {
		rl.close();
		if (/^y(es)?$/iu.test(answer.trim())) {
			createEditorConfig(path);
		}
		else {
			console.log(`Skipped: \`${path}\` was not modified.`);
		}
	});
}

function main() {
	const args = process.argv.slice(2);
	const { values } = parseArgs({ args, options });
	if (values.help) {
		printHelp();
		return;
	}
	const path = values.path || '.editorconfig'
	if (values.mode === 'write') {
		runWrite(path, values.overwrite);
	}
	else if (values.mode === 'check') {
		compareEditorConfig(path);
	}
	else {
		console.error('invalid commande');
	}
};

if (process.argv[1] === import.meta.filename) {
	main();
}
