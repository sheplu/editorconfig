import {
	AVAILABLE_LANGUAGES,
	BASE_SECTION_HEADER,
	baseSectionOutOfOrder,
	compareSection,
	expectedBodyForLanguage,
	headerToLanguage,
	languageToHeader,
	resolveLanguageNames,
} from '../templates/index.js';
import { NOT_PROVIDED } from './options.js';

export function detectLanguages(parsed) {
	const languages = [];
	for (const section of parsed.sections) {
		if (section.header !== BASE_SECTION_HEADER) {
			const language = headerToLanguage(section.header);
			if (language) {
				languages.push(language);
			}
		}
	}
	return languages;
}

function mergeLanguages(detected, parsedLanguages) {
	if (parsedLanguages === NOT_PROVIDED) {
		return detected;
	}
	const resolved = resolveLanguageNames(parsedLanguages);
	const merged = new Set(detected);
	for (const name of resolved) {
		merged.add(name);
	}
	return AVAILABLE_LANGUAGES.filter((name) => merged.has(name));
}

export function resolveTargetLanguages(parsed, parsedLanguages) {
	const detected = detectLanguages(parsed);
	return mergeLanguages(detected, parsedLanguages);
}

function collectAddedChanged(actualBody, expectedBody) {
	const added = [];
	const changed = [];
	for (const [key, value] of expectedBody) {
		if (!actualBody.has(key)) {
			added.push({ key, value });
		}
		else if (actualBody.get(key) !== value) {
			changed.push({ key, from: actualBody.get(key), to: value });
		}
	}
	return { added, changed };
}

function collectRemoved(actualBody, expectedBody) {
	const removed = [];
	for (const [key, value] of actualBody) {
		if (!expectedBody.has(key)) {
			removed.push({ key, value });
		}
	}
	return removed;
}

function diffKeys(actualBody, expectedBody) {
	const removed = collectRemoved(actualBody, expectedBody);
	const { added, changed } = collectAddedChanged(actualBody, expectedBody);
	return { removed, added, changed };
}

function resolveSectionLanguage(section) {
	if (section.header === BASE_SECTION_HEADER) {
		return 'base';
	}
	return headerToLanguage(section.header);
}

function buildSectionDiff(section, overrides) {
	const language = resolveSectionLanguage(section);

	if (!language) {
		return { header: section.header, status: 'unknown' };
	}

	const expected = expectedBodyForLanguage(language, overrides);
	const { ok } = compareSection(section.body, expected);

	if (ok) {
		return { header: section.header, status: 'match', bodyMatches: true };
	}

	const keys = diffKeys(section.body, expected);
	return { header: section.header, status: 'mismatch', bodyMatches: false, keys };
}

function appendMissingSections(diffs, parsed, targetLanguages) {
	const presentHeaders = new Set(parsed.sections.map((section) => section.header));
	const expectedHeaders = [
		BASE_SECTION_HEADER,
		...targetLanguages.map((name) => languageToHeader(name)),
	];
	for (const header of expectedHeaders) {
		if (!presentHeaders.has(header)) {
			diffs.push({ header, status: 'missing' });
		}
	}
}

function markRootMissing(diffs) {
	// The base diff always exists: the section was parsed, or appendMissingSections added a missing entry.
	const baseDiff = diffs.find((diff) => diff.header === BASE_SECTION_HEADER);
	baseDiff.rootMissing = true;
	if (baseDiff.status === 'match') {
		baseDiff.status = 'mismatch';
		baseDiff.keys = { removed: [], added: [], changed: [] };
	}
}

function appendInvalidLines(diffs, parsed) {
	const diagnostics = parsed.diagnostics ?? [];
	if (diagnostics.length === 0) {
		return;
	}
	diffs.push({ header: 'invalid lines', status: 'invalid', lines: diagnostics });
}

function markOutOfOrder(diffs, parsed) {
	if (!baseSectionOutOfOrder(parsed.sections)) {
		return;
	}
	const baseDiff = diffs.find((diff) => diff.header === BASE_SECTION_HEADER);
	baseDiff.outOfOrder = true;
	if (baseDiff.status === 'match') {
		baseDiff.status = 'mismatch';
		baseDiff.keys = { removed: [], added: [], changed: [] };
	}
}

export function buildSectionDiffs(parsed, targetLanguages, overrides) {
	const diffs = parsed.sections.map((section) => buildSectionDiff(section, overrides));
	appendMissingSections(diffs, parsed, targetLanguages);
	appendInvalidLines(diffs, parsed);
	markOutOfOrder(diffs, parsed);
	if (!parsed.hasRoot) {
		markRootMissing(diffs);
	}
	return diffs;
}

export function hasChanges(diffs) {
	return diffs.some((diff) => diff.status !== 'match');
}
