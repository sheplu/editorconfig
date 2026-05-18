import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { discoverEditorConfigs } from './discover.js';
import { classify, crossFileIssues } from './cascade.js';
import {
	compareEditorConfigForRole,
	NO_LANGUAGE_FILTER,
	printReport,
	reportIsFailing,
	summarizeReport,
} from './check.js';
import { logger } from './utils/logger.js';

function resolveStartDir(rawPath) {
	const abs = resolve(rawPath);
	if (!existsSync(abs)) {
		throw new Error(`'${rawPath}' does not exist`);
	}
	const stats = statSync(abs);
	if (stats.isDirectory()) {
		return abs;
	}
	const dir = dirname(abs);
	logger.warn(`--recursive expects a directory; using '${dir}' instead of '${rawPath}'.`);
	return dir;
}

function displayPath(absPath, startDir) {
	return relative(startDir, absPath);
}

function formatChildRoot(where) {
	return `  ❌ ${where} declares 'root = true' (forbidden in child)`;
}

function formatRedundant(issue, where) {
	return `  ⚠️  ${where} ${issue.header} ${issue.key} = ${issue.value} (redundant — same as root)`;
}

function formatContradiction(issue, where) {
	return `  ⚠️  ${where} ${issue.header} ${issue.key} = ${issue.childValue} (contradicts root ${issue.header} ${issue.key} = ${issue.rootValue})`;
}

function formatCrossFileIssue(issue, startDir) {
	const where = displayPath(issue.file, startDir);
	if (issue.kind === 'child-root') {
		return formatChildRoot(where);
	}
	if (issue.kind === 'redundant') {
		return formatRedundant(issue, where);
	}
	return formatContradiction(issue, where);
}

function buildEntry({ path, role, parsedLanguages, overrides }) {
	return {
		path,
		role,
		report: compareEditorConfigForRole({ path, parsedLanguages, overrides, role }),
	};
}

function buildFileEntries(tree, parsedLanguages, overrides) {
	const entries = [buildEntry({ path: tree.root, role: 'root', parsedLanguages, overrides })];
	for (const child of tree.children) {
		entries.push(buildEntry({
			path: child,
			role: 'child',
			parsedLanguages: NO_LANGUAGE_FILTER,
			overrides,
		}));
	}
	return entries;
}

function collectCrossIssues(rootEntry, childEntries) {
	const issues = [];
	for (const child of childEntries) {
		issues.push(...crossFileIssues({
			rootParsed: rootEntry.report.parsed,
			childParsed: child.report.parsed,
			childPath: child.path,
		}));
	}
	return issues;
}

function printFileBlock(entry, startDir) {
	const label = `[${entry.role}]`;
	printReport(displayPath(entry.path, startDir), entry.report, { label });
}

function printCrossFileBlock(issues, startDir) {
	if (issues.length === 0) {
		return;
	}
	logger.log('Cross-file warnings');
	logger.log('');
	for (const issue of issues) {
		logger.log(formatCrossFileIssue(issue, startDir));
	}
	logger.log('');
}

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

function pluralize(count, singular) {
	if (count === 1) {
		return singular;
	}
	return `${singular}s`;
}

function buildSummaryParts({ fileCount, counts, warnings, crossFailures, strict }) {
	const parts = [`${fileCount} ${pluralize(fileCount, 'file')} checked`];
	if (counts.filesFailed > 0) {
		parts.push(`${counts.filesFailed} failed`);
	}
	if (crossFailures > 0) {
		parts.push(`${crossFailures} cross-file ${pluralize(crossFailures, 'failure')}`);
	}
	if (warnings > 0) {
		parts.push(`${warnings} ${pluralize(warnings, 'warning')}`);
	}
	if (counts.unknown > 0 && !strict) {
		parts.push(`${counts.unknown} unknown ${pluralize(counts.unknown, 'header')} ignored`);
	}
	return parts;
}

function summaryHead(passed) {
	if (passed) {
		return '✅ PASS';
	}
	return '❌ FAIL';
}

function formatGlobalSummary({ entries, crossIssues, strict }) {
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
	});
	return { line: `${summaryHead(passed)} — ${parts.join('; ')}`, failed: !passed };
}

function processTree({ tree, parsedLanguages, overrides, startDir }) {
	const entries = buildFileEntries(tree, parsedLanguages, overrides);
	const [rootEntry, ...childEntries] = entries;
	const crossIssues = collectCrossIssues(rootEntry, childEntries);
	for (const entry of entries) {
		printFileBlock(entry, startDir);
	}
	return { entries, crossIssues };
}

function gatherAll({ trees, parsedLanguages, overrides, startDir }) {
	const allEntries = [];
	const allCrossIssues = [];
	for (const tree of trees) {
		const { entries, crossIssues } = processTree({ tree, parsedLanguages, overrides, startDir });
		allEntries.push(...entries);
		allCrossIssues.push(...crossIssues);
	}
	return { allEntries, allCrossIssues };
}

function reportAndExit({ allEntries, allCrossIssues, strict, startDir }) {
	printCrossFileBlock(allCrossIssues, startDir);
	const summary = formatGlobalSummary({ entries: allEntries, crossIssues: allCrossIssues, strict });
	logger.log(summary.line);
	if (summary.failed) {
		process.exitCode = 1;
	}
}

export function runCheckRecursive({ startDir: rawStart, parsedLanguages, strict, overrides }) {
	const startDir = resolveStartDir(rawStart);
	const paths = discoverEditorConfigs(startDir);
	if (paths.length === 0) {
		logger.log(`No .editorconfig files found under ${startDir}`);
		return;
	}
	const { allEntries, allCrossIssues } = gatherAll({
		trees: classify(paths),
		parsedLanguages,
		overrides,
		startDir,
	});
	reportAndExit({ allEntries, allCrossIssues, strict, startDir });
}
