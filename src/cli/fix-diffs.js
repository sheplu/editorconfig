import {
	AVAILABLE_LANGUAGES,
	BASE_SECTION_HEADER,
	baseSectionOutOfOrder,
	compareSection,
	expectedBodyForLanguage,
	headerToLanguage,
	languageToHeader,
	parseSection,
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

// The base diff always exists: the section was parsed, or appendMissingSections added a missing entry.
function flagBaseDiff(diffs, flag) {
	const baseDiff = diffs.find((diff) => diff.header === BASE_SECTION_HEADER);
	baseDiff[flag] = true;
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

function strayPreamblePairs(parsed) {
	const pairs = parseSection((parsed.preamble ?? []).join('\n'));
	pairs.delete('root');
	return [...pairs].map(([key, value]) => ({ key, value }));
}

function appendStrayPreamble(diffs, parsed) {
	const removed = strayPreamblePairs(parsed);
	if (removed.length === 0) {
		return;
	}
	diffs.push({ header: 'preamble', status: 'stray', keys: { removed, added: [], changed: [] } });
}

function markDuplicate(diff) {
	diff.duplicate = true;
	diff.bodyMatches = false;
	if (diff.status === 'match') {
		diff.status = 'mismatch';
		diff.keys = { removed: [], added: [], changed: [] };
	}
}

// A duplicated header must be consolidated: preserving one raw block verbatim silently picks a winner.
// Every occurrence is regenerated into the single canonical section instead.
function markDuplicates(diffs) {
	const counts = new Map();
	for (const diff of diffs) {
		counts.set(diff.header, (counts.get(diff.header) ?? 0) + 1);
	}
	for (const diff of diffs) {
		if (counts.get(diff.header) > 1 && diff.status !== 'unknown') {
			markDuplicate(diff);
		}
	}
}

export function buildSectionDiffs(parsed, targetLanguages, overrides) {
	const diffs = parsed.sections.map((section) => buildSectionDiff(section, overrides));
	appendMissingSections(diffs, parsed, targetLanguages);
	appendInvalidLines(diffs, parsed);
	appendStrayPreamble(diffs, parsed);
	markDuplicates(diffs);
	if (baseSectionOutOfOrder(parsed.sections)) {
		flagBaseDiff(diffs, 'outOfOrder');
	}
	if (!parsed.hasRoot) {
		flagBaseDiff(diffs, 'rootMissing');
	}
	return diffs;
}

export function hasChanges(diffs) {
	return diffs.some((diff) => diff.status !== 'match');
}
