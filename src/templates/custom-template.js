import {
	AVAILABLE_LANGUAGES,
	BASE_SECTION_HEADER,
	extractRawSections,
	headerToLanguage,
	languageToHeader,
	parseSections,
} from './index.js';
import { readTemplateText } from './template-source.js';

function knownHeaders() {
	return [BASE_SECTION_HEADER, ...AVAILABLE_LANGUAGES.map((name) => languageToHeader(name))];
}

function languageForHeader(header) {
	if (header === BASE_SECTION_HEADER) {
		return 'base';
	}
	return headerToLanguage(header);
}

function rejectUnknownHeader(path, header) {
	throw new Error(
		`custom template '${path}' has unknown header '${header}'. Allowed: ${knownHeaders().join(', ')}`,
	);
}

function rejectDuplicate(path, header) {
	throw new Error(
		`custom template '${path}' declares header '${header}' more than once`,
	);
}

function ingestSection({ path, section, accumulator }) {
	const language = languageForHeader(section.header);
	if (!language) {
		rejectUnknownHeader(path, section.header);
		return;
	}
	if (accumulator.seen.has(language)) {
		rejectDuplicate(path, section.header);
		return;
	}
	accumulator.seen.add(language);
	accumulator.bodies.set(language, section.body);
}

function buildBodies(path, sections) {
	const accumulator = { bodies: new Map(), seen: new Set() };
	for (const section of sections) {
		ingestSection({ path, section, accumulator });
	}
	return accumulator.bodies;
}

function rawSectionFor(language, rawBlocks) {
	if (language === 'base') {
		return `root = true\n\n${rawBlocks.get(BASE_SECTION_HEADER)}`;
	}
	return rawBlocks.get(languageToHeader(language));
}

function buildRawSections(bodies, text) {
	const rawBlocks = extractRawSections(text);
	const rawSections = new Map();
	for (const language of bodies.keys()) {
		rawSections.set(language, rawSectionFor(language, rawBlocks));
	}
	return rawSections;
}

function formatDiagnostic(diagnostic) {
	return `line ${diagnostic.line}: '${diagnostic.text}'`;
}

function rejectInvalidLines(path, diagnostics) {
	if (diagnostics.length === 0) {
		return;
	}
	throw new Error(
		`custom template '${path}' has invalid lines: ${diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join('; ')}`,
	);
}

export async function loadCustomTemplate(input) {
	const text = await readTemplateText(input);
	const parsed = parseSections(text);
	rejectInvalidLines(input, parsed.diagnostics);
	const bodies = buildBodies(input, parsed.sections);
	if (bodies.has('base') && !parsed.hasRoot) {
		throw new Error(
			`custom template '${input}' redefines [*] but is missing 'root = true' in the preamble`,
		);
	}
	const rawSections = buildRawSections(bodies, text);
	return { bodies, rawSections, hasRoot: parsed.hasRoot };
}
