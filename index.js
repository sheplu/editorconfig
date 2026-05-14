#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

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
};

export function printHelp() {
	console.log(`Usage: editorconfig --mode=<command> [--path=<path>]

Commands:
  write    Create a .editorconfig file with the default template
  check    Compare an existing .editorconfig against the template

Options:
  -m, --mode   Command to run (write | check)
  -p, --path   Path to the .editorconfig file (default: .editorconfig)
  -h, --help   Show this help message`);
};

function main() {
	const args = process.argv.slice(2);
	const { values } = parseArgs({ args, options });
	if (values.help) {
		printHelp();
		return;
	}
	const path = values.path || '.editorconfig'
	if (values.mode === 'write') {
		createEditorConfig(path);
	}
	else if (values.mode === 'check') {
		compareEditorConfig(path);
	}
	else {
		console.error('invalid commande');
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
