import { existsSync, readFileSync } from 'node:fs';
import {
	BASE_SECTION_HEADER,
	compareSection,
	EMPTY_OVERRIDES,
	expectedBodyForLanguage,
	headerToLanguage,
	languageToHeader,
	parseSections,
	resolveLanguageNames,
} from './templates/index.js';
import { logger } from './utils/logger.js';

export const NO_LANGUAGE_FILTER = Symbol('check-no-language-filter');

const STATUS_GLYPH = {
	match: '✅',
	mismatch: '❌',
	missing: '❌',
	'no-root': '❌',
	unknown: '⚠️ ',
};

const STATUS_DETAIL = {
	match: '',
	mismatch: 'section body does not match',
	missing: 'missing',
	'no-root': "missing 'root = true' before sections",
	unknown: 'unknown header (not validated)',
};

function languageForHeader(header) {
	if (header === BASE_SECTION_HEADER) {
		return 'base';
	}
	return headerToLanguage(header);
}

function checkSection(section, overrides) {
	const language = languageForHeader(section.header);
	if (!language) {
		return { header: section.header, status: 'unknown' };
	}
	const expected = expectedBodyForLanguage(language, overrides);
	const { ok } = compareSection(section.body, expected);
	if (ok) {
		return { header: section.header, status: 'match' };
	}
	return { header: section.header, status: 'mismatch' };
}

function buildExpectedHeaders(parsedLanguages) {
	const resolved = resolveLanguageNames(parsedLanguages);
	return [BASE_SECTION_HEADER, ...resolved.map((name) => languageToHeader(name))];
}

function buildResults({ parsedLanguages, parsed, overrides }) {
	const results = parsed.sections.map((section) => checkSection(section, overrides));
	if (parsedLanguages !== NO_LANGUAGE_FILTER) {
		const present = new Set(parsed.sections.map((section) => section.header));
		const expectedHeaders = buildExpectedHeaders(parsedLanguages);
		for (const header of expectedHeaders) {
			if (!present.has(header)) {
				results.push({ header, status: 'missing' });
			}
		}
	}
	return results;
}

function buildBaseIssues(parsed) {
	const issues = [];
	const hasBase = parsed.sections.some((section) => section.header === BASE_SECTION_HEADER);
	if (!hasBase) {
		issues.push({ header: BASE_SECTION_HEADER, status: 'missing' });
	}
	else if (!parsed.hasRoot) {
		issues.push({ header: BASE_SECTION_HEADER, status: 'no-root' });
	}
	return issues;
}

export function compareEditorConfig(path = '.editorconfig', parsedLanguages = NO_LANGUAGE_FILTER, overrides = EMPTY_OVERRIDES) {
	if (!existsSync(path)) {
		throw new Error(`'${path}' does not exist`);
	}
	const text = readFileSync(path, 'utf8');
	const parsed = parseSections(text);
	const baseIssues = buildBaseIssues(parsed);
	const results = buildResults({ parsedLanguages, parsed, overrides });
	return { baseIssues, results };
}

function formatLine({ header, status }) {
	const glyph = STATUS_GLYPH[status];
	const detail = STATUS_DETAIL[status];
	if (detail) {
		return `  ${glyph} ${header} ${detail}`;
	}
	return `  ${glyph} ${header}`;
}

export function reportIsFailing({ baseIssues, results }, strict) {
	const failing = [...baseIssues, ...results].some((entry) =>
		entry.status === 'mismatch' || entry.status === 'missing' || entry.status === 'no-root',
	);
	const hasUnknown = results.some((entry) => entry.status === 'unknown');
	return failing || (strict && hasUnknown);
}

function printReport(path, report) {
	logger.log(`Checking ${path}`);
	logger.log('');
	for (const issue of report.baseIssues) {
		logger.log(formatLine(issue));
	}
	for (const entry of report.results) {
		logger.log(formatLine(entry));
	}
	logger.log('');
}

function summarize(report) {
	const lines = [...report.baseIssues, ...report.results];
	const total = lines.length;
	const matched = lines.filter((entry) => entry.status === 'match').length;
	const failed = lines.filter((entry) =>
		entry.status === 'mismatch' || entry.status === 'missing' || entry.status === 'no-root',
	).length;
	const unknown = lines.filter((entry) => entry.status === 'unknown').length;
	return { total, matched, failed, unknown };
}

function pluralize(count, singular) {
	if (count === 1) {
		return singular;
	}
	return `${singular}s`;
}

function formatFailureSummary({ total, failed, unknown }) {
	const reasons = [];
	if (failed > 0) {
		reasons.push(`${failed} of ${total} ${pluralize(total, 'section')} did not match`);
	}
	if (unknown > 0) {
		reasons.push(`${unknown} unknown ${pluralize(unknown, 'header')}`);
	}
	return `❌ FAIL — ${reasons.join('; ')}`;
}

function formatPassSummary({ matched, unknown }) {
	const matchedLabel = `${matched} ${pluralize(matched, 'section')} matched`;
	if (unknown > 0) {
		return `✅ PASS — ${matchedLabel} (${unknown} unknown ${pluralize(unknown, 'header')} ignored)`;
	}
	return `✅ PASS — ${matchedLabel}`;
}

function formatSummary(report, isFailure) {
	const counts = summarize(report);
	if (isFailure) {
		return formatFailureSummary(counts);
	}
	return formatPassSummary(counts);
}

export function runCheck({ path, parsedLanguages, strict, overrides }) {
	const report = compareEditorConfig(path, parsedLanguages, overrides);
	printReport(path, report);
	const failed = reportIsFailing(report, strict);
	logger.log(formatSummary(report, failed));
	if (failed) {
		process.exitCode = 1;
	}
}
