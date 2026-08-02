import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
	AVAILABLE_LANGUAGES,
	BASE_SECTION_HEADER,
	compareSection,
	composeEditorConfig,
	expectedBodyForLanguage,
	headerToLanguage,
	languageToHeader,
	parseSections,
	resolveLanguageNames,
} from '../templates/index.js';
import { logger } from '../utils/logger.js';
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

function resolveTargetLanguages(parsed, parsedLanguages) {
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
		return { header: section.header, status: 'match' };
	}

	const keys = diffKeys(section.body, expected);
	return { header: section.header, status: 'mismatch', keys };
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
	const baseDiff = diffs.find((diff) => diff.header === BASE_SECTION_HEADER);
	if (baseDiff && baseDiff.status === 'match') {
		baseDiff.status = 'mismatch';
		baseDiff.keys = { removed: [], added: [], changed: [] };
		baseDiff.rootMissing = true;
	}
}

export function buildSectionDiffs(parsed, targetLanguages, overrides) {
	const diffs = parsed.sections.map((section) => buildSectionDiff(section, overrides));
	appendMissingSections(diffs, parsed, targetLanguages);
	if (!parsed.hasRoot) {
		markRootMissing(diffs);
	}
	return diffs;
}

export function hasChanges(diffs) {
	return diffs.some((diff) => diff.status !== 'match');
}

function formatKeyDiff(keys) {
	const lines = [];
	for (const { key, from, to } of keys.changed) {
		lines.push(`    - ${key} = ${from}`);
		lines.push(`    + ${key} = ${to}`);
	}
	for (const { key, value } of keys.added) {
		lines.push(`    + ${key} = ${value}`);
	}
	for (const { key, value } of keys.removed) {
		lines.push(`    - ${key} = ${value}`);
	}
	return lines;
}

const STATUS_LABELS = {
	mismatch: 'mismatch',
	missing: 'missing (will be added)',
	unknown: 'unknown (will be removed)',
};

const STATUS_GLYPHS = {
	mismatch: '❌',
	missing: '➕',
	unknown: '⚠️ ',
};

function appendSectionLines(diff, lines) {
	const glyph = STATUS_GLYPHS[diff.status];
	const label = STATUS_LABELS[diff.status];
	lines.push(`  ${glyph} ${diff.header} — ${label}`);

	if (diff.rootMissing) {
		lines.push("    + root = true (missing preamble)");
	}

	if (diff.keys) {
		lines.push(...formatKeyDiff(diff.keys));
	}

	lines.push('');
}

export function formatDiff(diffs, displayPath) {
	const lines = [`Fixing ${displayPath}`, ''];

	for (const diff of diffs) {
		if (diff.status !== 'match') {
			appendSectionLines(diff, lines);
		}
	}

	return lines.join('\n');
}

function confirmFix() {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		rl.question('Apply these changes? [y/N] ', (answer) => {
			rl.close();
			resolve(/^y(es)?$/iu.test(answer.trim()));
		});
	});
}

function buildFixDiffs(path, parsedLanguages, overrides) {
	const text = readFileSync(path, 'utf8');
	const parsed = parseSections(text);
	const targetLanguages = resolveTargetLanguages(parsed, parsedLanguages);
	const diffs = buildSectionDiffs(parsed, targetLanguages, overrides);
	return { targetLanguages, diffs };
}

function writeFixed(path, targetLanguages, overrides) {
	writeFileSync(path, composeEditorConfig(targetLanguages, overrides), 'utf8');
}

function requireConfirmation() {
	if (process.stdin.isTTY) {
		return true;
	}
	logger.error(`Differences found. Use --overwrite to apply without confirmation.`);
	process.exitCode = 1;
	return false;
}

async function confirmAndWrite(path, targetLanguages, overrides) {
	if (!requireConfirmation()) {
		return;
	}
	const confirmed = await confirmFix();
	if (confirmed) {
		writeFixed(path, targetLanguages, overrides);
	}
	else {
		logger.log(`Skipped: \`${path}\` was not modified.`);
	}
}

function reportDiffs(diffs, path) {
	if (!hasChanges(diffs)) {
		logger.log('Nothing to fix.');
		return false;
	}
	logger.log(formatDiff(diffs, path));
	return true;
}

export async function runFix({ path, overwrite, parsedLanguages, overrides }) {
	if (!existsSync(path)) {
		throw new Error(`'${path}' does not exist. Use --mode=write to create it.`);
	}

	const { targetLanguages, diffs } = buildFixDiffs(path, parsedLanguages, overrides);

	if (!reportDiffs(diffs, path)) {
		return;
	}

	if (overwrite) {
		writeFixed(path, targetLanguages, overrides);
		return;
	}

	await confirmAndWrite(path, targetLanguages, overrides);
}
