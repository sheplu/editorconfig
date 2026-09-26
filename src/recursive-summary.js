import { pluralize, reportIsFailing, summarizeReport } from './check.js';

function aggregateCounts(entries, strict) {
	const totals = { matched: 0, failed: 0, unknown: 0, filesFailed: 0 };
	for (const entry of entries) {
		const counts = summarizeReport(entry.report);
		totals.matched += counts.matched;
		totals.failed += counts.failed;
		totals.unknown += counts.unknown;
		if (reportIsFailing(entry.report, strict)) {
			totals.filesFailed += 1;
		}
	}
	return totals;
}

function directoryNoun(count) {
	if (count === 1) {
		return 'directory';
	}
	return 'directories';
}

function failureParts(counts, crossFailures) {
	const parts = [];
	if (counts.filesFailed > 0) {
		parts.push(`${counts.filesFailed} failed`);
	}
	if (crossFailures > 0) {
		parts.push(`${crossFailures} cross-file ${pluralize(crossFailures, 'failure')}`);
	}
	return parts;
}

function noticeParts({ counts, warnings, strict, skippedCount }) {
	const parts = [];
	if (warnings > 0) {
		parts.push(`${warnings} ${pluralize(warnings, 'warning')}`);
	}
	if (counts.unknown > 0 && !strict) {
		parts.push(`${counts.unknown} unknown ${pluralize(counts.unknown, 'header')} ignored`);
	}
	if (skippedCount > 0) {
		parts.push(`${skippedCount} unreadable ${directoryNoun(skippedCount)} skipped`);
	}
	return parts;
}

function buildSummaryParts({ fileCount, counts, warnings, crossFailures, strict, skippedCount }) {
	return [
		`${fileCount} ${pluralize(fileCount, 'file')} checked`,
		...failureParts(counts, crossFailures),
		...noticeParts({ counts, warnings, strict, skippedCount }),
	];
}

function summaryHead(passed) {
	if (passed) {
		return '✅ PASS';
	}
	return '❌ FAIL';
}

export function formatGlobalSummary({ entries, crossIssues, strict, skippedDirs = [] }) {
	const counts = aggregateCounts(entries, strict);
	const warnings = crossIssues.filter((issue) => issue.severity === 'warn').length;
	const crossFailures = crossIssues.filter((issue) => issue.severity === 'fail').length;
	const passed = counts.filesFailed === 0 && crossFailures === 0;
	const parts = buildSummaryParts({
		fileCount: entries.length,
		counts,
		warnings,
		crossFailures,
		strict,
		skippedCount: skippedDirs.length,
	});
	return { line: `${summaryHead(passed)} — ${parts.join('; ')}`, failed: !passed };
}
