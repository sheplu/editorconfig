#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
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

function main() {
	const args = process.argv.slice(2);
	const options = {
		mode: {
			type: 'string',
			short: 'm',
		},
		path: {
			type: 'string',
			short: 'p',
		},
	};
	const { values } = parseArgs({ args, options });
	const path = values.path || '.editorconfig'
	if (values.mode === 'write') {
		createEditorConfig(path);
	}
	else if (values.mode === 'check') {
		compareEditorConfig(path);
	}
	else {
		console.error('invalide commande');
	}
};

main();
