import { base } from './base.js';
import {
	DEFAULT_PRESET,
	LANGUAGE_TEMPLATES,
	resolvePreset,
} from './presets.js';
import { bodyAfterFirstHeader, bodyAfterHeader, parseSection } from './parser.js';
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

export {
	AVAILABLE_PRESETS,
	DEFAULT_PRESET,
	resolvePreset,
} from './presets.js';

export {
	bodyAfterFirstHeader,
	collectDiagnostics,
	compareSection,
	extractRawSections,
	fromFirstHeader,
	parseSection,
	parseSections,
	stripInvalidLines,
} from './parser.js';

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

export function joinSections(sections) {
	return `${sections
		.map((section) => section.replace(/\n+$/u, ''))
		.join('\n\n')}\n`;
}

export const EMPTY_OVERRIDES = Object.freeze({
	bodies: new Map(),
	rawSections: new Map(),
	hasRoot: false,
});

function pickSection(name, builtin, overrides) {
	if (overrides.rawSections.has(name)) {
		return overrides.rawSections.get(name);
	}
	return builtin;
}

export function templateSectionText(language, overrides = EMPTY_OVERRIDES) {
	const templates = resolvePreset(overrides.preset ?? DEFAULT_PRESET);
	if (language === 'base') {
		return pickSection('base', templates.base, overrides);
	}
	return pickSection(language, templates.languages[language], overrides);
}

export function composeEditorConfig(languageNames = [], overrides = EMPTY_OVERRIDES) {
	const templates = resolvePreset(overrides.preset ?? DEFAULT_PRESET);
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
	const sections = [
		pickSection('base', templates.base, overrides),
		...ordered.map((name) => pickSection(name, templates.languages[name], overrides)),
	];
	return joinSections(sections);
}

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

// Later matching sections take precedence (spec: file processing), so
// [*] must be declared before any language section in a canonical file.
export function baseSectionOutOfOrder(sections) {
	const baseAt = sections.findIndex((section) => section.header === BASE_HEADER);
	if (baseAt === -1) {
		return false;
	}
	const firstKnownAt = sections.findIndex((section) => HEADER_TO_LANGUAGE.has(section.header));
	return firstKnownAt !== -1 && firstKnownAt < baseAt;
}

export function expectedBodyForLanguage(language, overrides = EMPTY_OVERRIDES) {
	if (overrides.bodies.has(language)) {
		return overrides.bodies.get(language);
	}
	const templates = resolvePreset(overrides.preset ?? DEFAULT_PRESET);
	if (language === 'base') {
		return parseSection(bodyAfterFirstHeader(templates.base));
	}
	return parseSection(bodyAfterHeader(templates.languages[language]));
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
