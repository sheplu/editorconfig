import { existsSync, readFileSync } from 'node:fs';
import {
	BASE_SECTION_HEADER,
	baseSectionOutOfOrder,
	compareSection,
	DEFAULT_PRESET,
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
	'out-of-order': '❌',
	'child-root-forbidden': '❌',
	invalid: '❌',
	unknown: '⚠️ ',
};

const STATUS_DETAIL = {
	match: '',
	mismatch: 'section body does not match',
	missing: 'missing',
	'no-root': "missing 'root = true' before sections",
	'out-of-order': "'[*]' must come before language sections (later sections win)",
	'child-root-forbidden': "child file must not declare 'root = true'",
	invalid: 'invalid line (expected comment, [header], or key = value)',
	unknown: 'unknown header (not validated)',
};

const FAILING_STATUSES = new Set([
	'mismatch',
	'missing',
	'no-root',
	'out-of-order',
	'child-root-forbidden',
	'invalid',
]);

function languageForHeader(header) {
	if (header === BASE_SECTION_HEADER) {
		return 'base';
	}
	return headerToLanguage(header);
}

function checkSection(section, overrides, role) {
	const language = languageForHeader(section.header);
	if (!language) {
		return { header: section.header, status: 'unknown' };
	}
	if (role === 'child') {
		return { header: section.header, status: 'match' };
	}
	const expected = expectedBodyForLanguage(language, overrides);
	const { ok } = compareSection(section.body, expected);
	if (ok) {
		return { header: section.header, status: 'match' };
	}
	return { header: section.header, status: 'mismatch' };
}

function buildExpectedHeaders(parsedLanguages) {
	// The base section is owned by buildRootBaseIssues — listing it here too double-reports a missing [*].
	const resolved = resolveLanguageNames(parsedLanguages);
	return resolved.map((name) => languageToHeader(name));
}

function buildResults({ parsedLanguages, parsed, overrides, role }) {
	const results = parsed.sections.map((section) => checkSection(section, overrides, role));
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

function buildRootBaseIssues(parsed) {
	const issues = [];
	const hasBase = parsed.sections.some((section) => section.header === BASE_SECTION_HEADER);
	if (!hasBase) {
		issues.push({ header: BASE_SECTION_HEADER, status: 'missing' });
	}
	else if (!parsed.hasRoot) {
		issues.push({ header: BASE_SECTION_HEADER, status: 'no-root' });
	}
	else if (baseSectionOutOfOrder(parsed.sections)) {
		issues.push({ header: BASE_SECTION_HEADER, status: 'out-of-order' });
	}
	return issues;
}

function buildChildBaseIssues(parsed) {
	if (parsed.hasRoot) {
		return [{ header: BASE_SECTION_HEADER, status: 'child-root-forbidden' }];
	}
	return [];
}

function buildSyntaxIssues(parsed) {
	return parsed.diagnostics.map(({ line, text }) => ({
		header: `line ${line}: '${text}'`,
		status: 'invalid',
	}));
}

function buildBaseIssuesForRole(parsed, role) {
	if (role === 'child') {
		return buildChildBaseIssues(parsed);
	}
	return buildRootBaseIssues(parsed);
}

export function compareEditorConfigForRole({
	path,
	parsedLanguages = NO_LANGUAGE_FILTER,
	overrides = EMPTY_OVERRIDES,
	role = 'root',
}) {
	if (!existsSync(path)) {
		throw new Error(`'${path}' does not exist`);
	}
	const text = readFileSync(path, 'utf8');
	const parsed = parseSections(text);
	const baseIssues = buildBaseIssuesForRole(parsed, role);
	const syntaxIssues = buildSyntaxIssues(parsed);
	const effectiveLanguages = effectiveLanguagesForRole(parsedLanguages, role);
	const results = buildResults({ parsedLanguages: effectiveLanguages, parsed, overrides, role });
	return { baseIssues, syntaxIssues, results, parsed };
}

function effectiveLanguagesForRole(parsedLanguages, role) {
	if (role === 'child') {
		return NO_LANGUAGE_FILTER;
	}
	return parsedLanguages;
}

export function compareEditorConfig(path = '.editorconfig', parsedLanguages = NO_LANGUAGE_FILTER, overrides = EMPTY_OVERRIDES) {
	const { baseIssues, syntaxIssues, results } = compareEditorConfigForRole({
		path,
		parsedLanguages,
		overrides,
		role: 'root',
	});
	return { baseIssues, syntaxIssues, results };
}

function formatLine({ header, status }) {
	const glyph = STATUS_GLYPH[status];
	const detail = STATUS_DETAIL[status];
	if (detail) {
		return `  ${glyph} ${header} ${detail}`;
	}
	return `  ${glyph} ${header}`;
}

function reportLines(report) {
	return [...(report.syntaxIssues ?? []), ...report.baseIssues, ...report.results];
}

export function reportIsFailing(report, strict) {
	const failing = reportLines(report).some((entry) => FAILING_STATUSES.has(entry.status));
	const hasUnknown = report.results.some((entry) => entry.status === 'unknown');
	return failing || Boolean(strict && hasUnknown);
}

function buildHeading(displayPath, label) {
	if (label) {
		return `Checking ${displayPath} ${label}`;
	}
	return `Checking ${displayPath}`;
}

export function printReport(displayPath, report, { label } = {}) {
	logger.log(buildHeading(displayPath, label));
	logger.log('');
	for (const line of reportLines(report)) {
		logger.log(formatLine(line));
	}
	logger.log('');
}

export function summarizeReport(report) {
	const lines = reportLines(report);
	const total = lines.length;
	const matched = lines.filter((entry) => entry.status === 'match').length;
	const failed = lines.filter((entry) => FAILING_STATUSES.has(entry.status)).length;
	const unknown = lines.filter((entry) => entry.status === 'unknown').length;
	return { total, matched, failed, unknown };
}

export function pluralize(count, singular) {
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
	const counts = summarizeReport(report);
	if (isFailure) {
		return formatFailureSummary(counts);
	}
	return formatPassSummary(counts);
}

export function identityReplacer(_key, value) {
	return value;
}

export function reportToSections(report) {
	return reportLines(report).map(({ header, status }) => ({
		header,
		status,
		detail: STATUS_DETAIL[status],
	}));
}

export function buildCheckJson({ path, report, failed, preset = DEFAULT_PRESET }) {
	return {
		mode: 'check',
		path,
		preset,
		ok: !failed,
		summary: summarizeReport(report),
		sections: reportToSections(report),
	};
}

export function runCheck({ path, parsedLanguages, strict, overrides = EMPTY_OVERRIDES, json }) {
	const report = compareEditorConfig(path, parsedLanguages, overrides);
	const failed = reportIsFailing(report, strict);
	if (json) {
		const preset = overrides.preset ?? DEFAULT_PRESET;
		logger.log(JSON.stringify(buildCheckJson({ path, report, failed, preset }), identityReplacer, 2));
	}
	else {
		printReport(path, report);
		logger.log(formatSummary(report, failed));
	}
	if (failed) {
		process.exitCode = 1;
	}
}
