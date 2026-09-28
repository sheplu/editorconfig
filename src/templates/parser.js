export function isCommentLine(line) {
	const trimmed = line.trim();
	return trimmed.startsWith('#') || trimmed.startsWith(';');
}

function isIgnoredLine(line) {
	if (line === '' || isCommentLine(line)) {
		return true;
	}
	if (line.startsWith('[') && line.endsWith(']')) {
		return true;
	}
	return false;
}

// Standard keys whose values the EditorConfig core parsers lowercase
// (spec: indent_style / end_of_line / charset values are case-insensitive).
const NORMALIZED_VALUE_KEYS = new Set([
	'indent_style',
	'indent_size',
	'end_of_line',
	'charset',
	'trim_trailing_whitespace',
	'insert_final_newline',
]);

function normalizeValue(key, value) {
	if (NORMALIZED_VALUE_KEYS.has(key)) {
		return value.toLowerCase();
	}
	return value;
}

function applyKeyValue(body, line) {
	const equalsAt = line.indexOf('=');
	if (equalsAt === -1) {
		return;
	}
	const key = line.slice(0, equalsAt).trim().toLowerCase();
	if (key.length === 0) {
		return;
	}
	body.set(key, normalizeValue(key, line.slice(equalsAt + 1).trim()));
}

export function parseSection(block) {
	const body = new Map();
	for (const rawLine of block.split('\n')) {
		const line = rawLine.trim();
		if (!isIgnoredLine(line)) {
			applyKeyValue(body, line);
		}
	}
	return body;
}

function finishSection({ header, lines }) {
	return {
		header,
		body: parseSection(lines.join('\n')),
		lines,
	};
}

function processLine(state, line) {
	const trimmed = line.trim();
	if (/^\[.*\]$/u.test(trimmed)) {
		if (state.current) {
			state.sections.push(finishSection(state.current));
		}
		state.current = { header: trimmed, lines: [] };
	}
	else if (state.current) {
		state.current.lines.push(line);
	}
	else {
		state.preamble.push(line);
	}
}

function splitSections(lines) {
	const state = { sections: [], preamble: [], current: false };
	for (const line of lines) {
		processLine(state, line);
	}
	if (state.current) {
		state.sections.push(finishSection(state.current));
	}
	return { sections: state.sections, preamble: state.preamble };
}

function isValidLine(trimmed) {
	if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
		return true;
	}
	if (/^\[.*\]$/u.test(trimmed)) {
		return true;
	}
	const equalsAt = trimmed.indexOf('=');
	return equalsAt !== -1 && trimmed.slice(0, equalsAt).trim().length > 0;
}

export function collectDiagnostics(lines) {
	const diagnostics = [];
	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (!isValidLine(trimmed)) {
			diagnostics.push({ line: index + 1, text: trimmed });
		}
	}
	return diagnostics;
}

export function parseSections(text) {
	const normalized = text.replaceAll(/\r\n?/gu, '\n');
	const lines = normalized.split('\n');
	const { sections, preamble } = splitSections(lines);
	// Last root declaration wins, like every other pair (spec: file processing order).
	const hasRoot = (parseSection(preamble.join('\n')).get('root') ?? '').toLowerCase() === 'true';
	return {
		hasRoot,
		sections,
		preamble,
		diagnostics: collectDiagnostics(lines),
		rawBlocks: rawBlocksFrom(sections),
	};
}

export function compareSection(actualBody, expectedBody) {
	if (actualBody.size !== expectedBody.size) {
		return { ok: false };
	}
	for (const [key, value] of expectedBody) {
		if (!actualBody.has(key) || actualBody.get(key) !== value) {
			return { ok: false };
		}
	}
	return { ok: true };
}

export function bodyAfterHeader(template) {
	const headerEnd = template.indexOf('\n');
	return template.slice(headerEnd + 1);
}

export function bodyAfterFirstHeader(template) {
	const lines = template.split('\n');
	const headerIndex = lines.findIndex((line) => /^\[.*\]$/u.test(line.trim()));
	if (headerIndex === -1) {
		return template;
	}
	return lines.slice(headerIndex + 1).join('\n');
}

export function fromFirstHeader(text) {
	const lines = text.split('\n');
	const headerIndex = lines.findIndex((line) => /^\[.*\]$/u.test(line.trim()));
	if (headerIndex === -1) {
		return text;
	}
	return lines.slice(headerIndex).join('\n');
}

export function stripInvalidLines(block) {
	return block
		.split('\n')
		.filter((line) => isValidLine(line.trim()))
		.join('\n');
}

function withoutTrailingBlankLines(lines) {
	let end = lines.length;
	while (end > 0 && lines[end - 1].trim() === '') {
		end -= 1;
	}
	return lines.slice(0, end);
}

function rawBlockOf(section) {
	return [section.header, ...withoutTrailingBlankLines(section.lines)].join('\n');
}

function rawBlocksFrom(sections) {
	const blocks = new Map();
	for (const section of sections) {
		const block = rawBlockOf(section);
		// Keep every copy of a duplicated header: consolidation drops comments from every copy, and consumers must be able to disclose each one before that happens.
		if (blocks.has(section.header)) {
			blocks.set(section.header, `${blocks.get(section.header)}\n\n${block}`);
		}
		else {
			blocks.set(section.header, block);
		}
	}
	return blocks;
}

export function extractRawSections(text) {
	return parseSections(text).rawBlocks;
}
