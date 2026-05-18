// Shared fixtures for tests that need a full, parseable .editorconfig file.
// Values mirror templates/base.js — keep in sync with the source of truth.

export const BUILTIN_BASE_BODY = `indent_style = tab
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

export const BUILTIN_BASE_FILE = `root = true

[*]
${BUILTIN_BASE_BODY}`;

export const TWO_SPACE_BASE_BODY = `indent_style = space
indent_size = 2
tab_width = 2
end_of_line = lf
charset = utf-8
spelling_language = en
trim_trailing_whitespace = true
insert_final_newline = true
quote_type = single
spaces_around_operators = true
`;

export const TWO_SPACE_BASE_FILE = `root = true

[*]
${TWO_SPACE_BASE_BODY}`;

export const PYTHON_SECTION = `[*.py]
indent_style = space
indent_size = 4
max_line_length = 88
`;

export const JAVASCRIPT_SECTION = `[*.{js,jsx,ts,tsx,mjs,cjs}]
indent_style = tab
indent_size = 4
tab_width = 4
quote_type = single
`;

// A child .editorconfig: no `root = true`, no `[*]`, just one canonical language section.
export const PYTHON_CHILD_FILE = PYTHON_SECTION;

export function withSection(baseFile, section) {
	return `${baseFile}\n${section}`;
}

// Whitespace-permuted variant of BUILTIN_BASE_FILE — used to assert the parser is whitespace/order/comment tolerant.
export const BUILTIN_BASE_FILE_TWEAKED = `root = true

[*]
indent_style=tab
indent_size = 4
tab_width = 4
end_of_line=lf
charset = utf-8
spelling_language=en
# a comment
trim_trailing_whitespace=true
insert_final_newline = true
quote_type=single
spaces_around_operators=true

[*.md]
trim_trailing_whitespace = false
indent_size = 2
indent_style = space
`;

// Custom team-style override: 2-space base + non-canonical [*.md] (indent_size = 4). Used across LF, CRLF, and fetched-URL tests.
export const OVERRIDE_BASE_MARKDOWN = `root = true

[*]
indent_style = space
indent_size = 2

[*.md]
indent_style = space
indent_size = 4
trim_trailing_whitespace = false
`;
