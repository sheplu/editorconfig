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
