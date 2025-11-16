#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

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
	if(editorconfigContent === file) {
		console.log('✅ Editorconfig is matching the expected configuration')
	}
	else {
		console.log('❌ Editorconfig is not matching the expected configuration');
	}
};

function main() {
	readEditorConfig();
};

main();
