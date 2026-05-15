import { base } from './base.js';
import { javascript } from './javascript.js';
import { yaml } from './yaml.js';
import { markdown } from './markdown.js';
import { python } from './python.js';
import { go } from './go.js';
import { rust } from './rust.js';
import { terraform } from './terraform.js';
import { json } from './json.js';
import { toml } from './toml.js';
import { shell } from './shell.js';
import { makefile } from './makefile.js';
import { dockerfile } from './dockerfile.js';
import { html } from './html.js';
import { css } from './css.js';

export {
	base,
	javascript,
	yaml,
	markdown,
	python,
	go,
	rust,
	terraform,
	json,
	toml,
	shell,
	makefile,
	dockerfile,
	html,
	css,
};

export const AVAILABLE_LANGUAGES = [
	'javascript',
	'yaml',
	'markdown',
	'python',
	'go',
	'rust',
	'terraform',
	'json',
	'toml',
	'shell',
	'makefile',
	'dockerfile',
	'html',
	'css',
];

export const ALIASES = {
	js: 'javascript',
	jsx: 'javascript',
	ts: 'javascript',
	tsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	yml: 'yaml',
	md: 'markdown',
	py: 'python',
	rs: 'rust',
	tf: 'terraform',
	tfvars: 'terraform',
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	mk: 'makefile',
	htm: 'html',
	scss: 'css',
	sass: 'css',
	less: 'css',
};

const LANGUAGE_TEMPLATES = {
	javascript,
	yaml,
	markdown,
	python,
	go,
	rust,
	terraform,
	json,
	toml,
	shell,
	makefile,
	dockerfile,
	html,
	css,
};

function joinSections(sections) {
	return `${sections
		.map((section) => section.replace(/\n+$/u, ''))
		.join('\n\n')}\n`;
}

export function composeEditorConfig(languageNames = []) {
	const resolved = new Set();
	for (const raw of languageNames) {
		const name = ALIASES[raw] ?? raw;
		if (!Object.hasOwn(LANGUAGE_TEMPLATES, name)) {
			throw new Error(
				`unknown language: '${raw}'. Available: ${AVAILABLE_LANGUAGES.join(', ')}`,
			);
		}
		resolved.add(name);
	}
	const ordered = AVAILABLE_LANGUAGES.filter((name) => resolved.has(name));
	const sections = [base, ...ordered.map((name) => LANGUAGE_TEMPLATES[name])];
	return joinSections(sections);
}

export const editorconfigContent = composeEditorConfig(AVAILABLE_LANGUAGES);

const BASE_HEADER = '[*]';

function extractHeader(template) {
	return template.split('\n', 1)[0];
}

const HEADER_TO_LANGUAGE = new Map(
	AVAILABLE_LANGUAGES.map((name) => [extractHeader(LANGUAGE_TEMPLATES[name]), name]),
);

export function headerToLanguage(header) {
	return HEADER_TO_LANGUAGE.get(header);
}

function isIgnoredLine(line) {
	if (line === '' || line.startsWith('#') || line.startsWith(';')) {
		return true;
	}
	if (line.startsWith('[') && line.endsWith(']')) {
		return true;
	}
	return false;
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
	body.set(key, line.slice(equalsAt + 1).trim());
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

export function parseSections(text) {
	const normalized = text.replaceAll(/\r\n?/gu, '\n');
	const { sections, preamble } = splitSections(normalized.split('\n'));
	const hasRoot = preamble.some((line) => /^\s*root\s*=\s*true\s*$/iu.test(line));
	return { hasRoot, sections };
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

function bodyAfterHeader(template) {
	const headerEnd = template.indexOf('\n');
	return template.slice(headerEnd + 1);
}

function bodyAfterFirstHeader(template) {
	const lines = template.split('\n');
	const headerIndex = lines.findIndex((line) => /^\[.*\]$/u.test(line.trim()));
	if (headerIndex === -1) {
		return template;
	}
	return lines.slice(headerIndex + 1).join('\n');
}

export function expectedBodyForLanguage(language) {
	if (language === 'base') {
		return parseSection(bodyAfterFirstHeader(base));
	}
	return parseSection(bodyAfterHeader(LANGUAGE_TEMPLATES[language]));
}

export function resolveLanguageNames(languageNames) {
	const resolved = new Set();
	for (const raw of languageNames) {
		const name = ALIASES[raw] ?? raw;
		if (!Object.hasOwn(LANGUAGE_TEMPLATES, name)) {
			throw new Error(
				`unknown language: '${raw}'. Available: ${AVAILABLE_LANGUAGES.join(', ')}`,
			);
		}
		resolved.add(name);
	}
	return AVAILABLE_LANGUAGES.filter((name) => resolved.has(name));
}

export function languageToHeader(language) {
	if (language === 'base') {
		return BASE_HEADER;
	}
	return extractHeader(LANGUAGE_TEMPLATES[language]);
}

export const BASE_SECTION_HEADER = BASE_HEADER;
