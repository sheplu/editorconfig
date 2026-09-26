import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { discoverEditorConfigs } from './discover.js';
import { classify, crossFileIssues } from './cascade.js';
import { DEFAULT_PRESET, EMPTY_OVERRIDES, resolveLanguageNames } from './templates/index.js';
import {
	compareEditorConfigForRole,
	identityReplacer,
	NO_LANGUAGE_FILTER,
	printReport,
	reportIsFailing,
	reportToSections,
	summarizeReport,
} from './check.js';
import { logger } from './utils/logger.js';
import { formatGlobalSummary } from './recursive-summary.js';

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

function processTree({ tree, parsedLanguages, overrides, startDir, json }) {
	const entries = buildFileEntries(tree, parsedLanguages, overrides);
	const [rootEntry, ...childEntries] = entries;
	const crossIssues = collectCrossIssues(rootEntry, childEntries);
	if (!json) {
		for (const entry of entries) {
			printFileBlock(entry, startDir);
		}
	}
	return { entries, crossIssues };
}

function gatherAll({ trees, parsedLanguages, overrides, startDir, json }) {
	const allEntries = [];
	const allCrossIssues = [];
	for (const tree of trees) {
		const { entries, crossIssues } = processTree({ tree, parsedLanguages, overrides, startDir, json });
		allEntries.push(...entries);
		allCrossIssues.push(...crossIssues);
	}
	return { allEntries, allCrossIssues };
}

function reportAndExit({ allEntries, allCrossIssues, strict, startDir, skippedDirs }) {
	printCrossFileBlock(allCrossIssues, startDir);
	const summary = formatGlobalSummary({ entries: allEntries, crossIssues: allCrossIssues, strict, skippedDirs });
	logger.log(summary.line);
	if (summary.failed) {
		process.exitCode = 1;
	}
}

function jsonFileEntry(entry, startDir, strict) {
	return {
		path: displayPath(entry.path, startDir),
		role: entry.role,
		failed: reportIsFailing(entry.report, strict),
		summary: summarizeReport(entry.report),
		sections: reportToSections(entry.report),
	};
}

function jsonCrossIssue(issue, startDir) {
	const copy = {};
	for (const [key, value] of Object.entries(issue)) {
		copy[key] = value;
	}
	copy.file = displayPath(issue.file, startDir);
	return copy;
}

function buildRecursiveJson({ allEntries, allCrossIssues, strict, startDir, preset, skippedDirs }) {
	const summary = formatGlobalSummary({ entries: allEntries, crossIssues: allCrossIssues, strict, skippedDirs });
	return {
		mode: 'check',
		recursive: true,
		startDir,
		preset,
		ok: !summary.failed,
		files: allEntries.map((entry) => jsonFileEntry(entry, startDir, strict)),
		crossFileIssues: allCrossIssues.map((issue) => jsonCrossIssue(issue, startDir)),
		skippedDirs: skippedDirs.map((dir) => displayPath(dir, startDir)),
	};
}

function emitJson(payload) {
	logger.log(JSON.stringify(payload, identityReplacer, 2));
}

function reportRecursiveJson(payload) {
	const json = buildRecursiveJson(payload);
	emitJson(json);
	if (!json.ok) {
		process.exitCode = 1;
	}
}

function emitEmptyRecursiveJson({ startDir, preset, skippedDirs }) {
	emitJson({
		mode: 'check',
		recursive: true,
		startDir,
		preset,
		ok: true,
		files: [],
		crossFileIssues: [],
		skippedDirs: skippedDirs.map((dir) => displayPath(dir, startDir)),
	});
}

function reportEmpty({ startDir, json, preset, skippedDirs }) {
	if (json) {
		emitEmptyRecursiveJson({ startDir, preset, skippedDirs });
		return;
	}
	logger.log(`No .editorconfig files found under ${startDir}`);
}

function runWalk({ startDir, paths, skippedDirs, parsedLanguages, strict, overrides, json, preset }) {
	const { allEntries, allCrossIssues } = gatherAll({
		trees: classify(paths),
		parsedLanguages,
		overrides,
		startDir,
		json,
	});
	if (json) {
		reportRecursiveJson({ allEntries, allCrossIssues, strict, startDir, preset, skippedDirs });
		return;
	}
	reportAndExit({ allEntries, allCrossIssues, strict, startDir, skippedDirs });
}

export function runCheckRecursive({ startDir: rawStart, parsedLanguages = NO_LANGUAGE_FILTER, strict, overrides = EMPTY_OVERRIDES, json }) {
	if (parsedLanguages !== NO_LANGUAGE_FILTER) {
		// Validate the filter up front: an empty scan must not hide a typo (R22).
		resolveLanguageNames(parsedLanguages);
	}
	const startDir = resolveStartDir(rawStart);
	const preset = overrides.preset ?? DEFAULT_PRESET;
	const { paths, skippedDirs } = discoverEditorConfigs(startDir);
	if (paths.length === 0) {
		reportEmpty({ startDir, json, preset, skippedDirs });
		return;
	}
	runWalk({ startDir, paths, skippedDirs, parsedLanguages, strict, overrides, json, preset });
}
