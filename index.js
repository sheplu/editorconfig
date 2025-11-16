#!/usr/bin/env node

import { writeFileSync } from "node:fs";

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

function main() {
	createEditorConfig();
};

main();
