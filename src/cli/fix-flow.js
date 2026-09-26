import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import {
	AVAILABLE_LANGUAGES,
	BASE_SECTION_HEADER,
	extractRawSections,
	fromFirstHeader,
	joinSections,
	languageToHeader,
	parseSections,
	stripInvalidLines,
	templateSectionText,
} from '../templates/index.js';
import { logger } from '../utils/logger.js';
import { writeFileAtomic } from '../utils/atomic-write.js';
import {
	buildSectionDiffs,
	hasChanges,
	resolveTargetLanguages,
} from './fix-diffs.js';

export { buildSectionDiffs, detectLanguages, hasChanges } from './fix-diffs.js';

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
	invalid: 'invalid (will be removed)',
	unknown: 'unknown (will be removed)',
};

const STATUS_GLYPHS = {
	mismatch: '❌',
	missing: '➕',
	invalid: '❌',
	unknown: '⚠️ ',
};

function flagNoteLines(diff) {
	const notes = [];
	if (diff.rootMissing) {
		notes.push("    + root = true (missing preamble)");
	}
	if (diff.outOfOrder) {
		notes.push('    ~ section order will be normalized ([*] first)');
	}
	return notes;
}

function sectionNoteLines(diff) {
	const notes = flagNoteLines(diff);
	if (diff.lines) {
		notes.push(...formatInvalidLines(diff.lines));
	}
	if (diff.keys) {
		notes.push(...formatKeyDiff(diff.keys));
	}
	if (diff.droppedComments) {
		notes.push(...formatDroppedComments(diff.droppedComments));
	}
	return notes;
}

function formatDroppedComments(comments) {
	return comments.map((comment) => `    - ${comment.trim()} (comment will be removed)`);
}

function appendSectionLines(diff, lines) {
	const glyph = STATUS_GLYPHS[diff.status];
	const label = STATUS_LABELS[diff.status];
	lines.push(`  ${glyph} ${diff.header} — ${label}`);
	lines.push(...sectionNoteLines(diff));
	lines.push('');
}

function formatInvalidLines(invalidLines) {
	return invalidLines.map(({ line, text }) => `    - line ${line}: ${text}`);
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

function isCommentLine(line) {
	const trimmed = line.trim();
	return trimmed.startsWith('#') || trimmed.startsWith(';');
}

function commentLines(block) {
	return block.split('\n').filter((line) => isCommentLine(line));
}

function annotateDroppedComments(diffs, rawBlocks) {
	for (const diff of diffs) {
		if (diff.bodyMatches === false && rawBlocks.has(diff.header)) {
			const dropped = commentLines(rawBlocks.get(diff.header));
			if (dropped.length > 0) {
				diff.droppedComments = dropped;
			}
		}
	}
}

function buildFixDiffs(path, parsedLanguages, overrides) {
	const text = readFileSync(path, 'utf8');
	const parsed = parseSections(text);
	const targetLanguages = resolveTargetLanguages(parsed, parsedLanguages);
	const diffs = buildSectionDiffs(parsed, targetLanguages, overrides);
	annotateDroppedComments(diffs, extractRawSections(text));
	return { text, parsed, targetLanguages, diffs };
}

function preservedPreambleBlock(preambleLines) {
	const comments = preambleLines.filter((line) => isCommentLine(line));
	return [...comments, 'root = true'].join('\n');
}

function sectionBlock({ header, language, diffsByHeader, rawBlocks, overrides }) {
	const diff = diffsByHeader.get(header);
	if (diff && diff.bodyMatches && rawBlocks.has(header)) {
		// The body already matches: keep the user's raw section (with its comments), dropping only invalid lines.
		return stripInvalidLines(rawBlocks.get(header));
	}
	return fromFirstHeader(templateSectionText(language, overrides));
}

export function composeFixedContent({ text, parsed, diffs, targetLanguages, overrides }) {
	const rawBlocks = extractRawSections(text);
	const diffsByHeader = new Map(diffs.map((diff) => [diff.header, diff]));
	const targets = new Set(targetLanguages);
	const ordered = AVAILABLE_LANGUAGES.filter((name) => targets.has(name));
	const blocks = [
		preservedPreambleBlock(parsed.preamble),
		sectionBlock({ header: BASE_SECTION_HEADER, language: 'base', diffsByHeader, rawBlocks, overrides }),
		...ordered.map((name) => sectionBlock({
			header: languageToHeader(name),
			language: name,
			diffsByHeader,
			rawBlocks,
			overrides,
		})),
	];
	return joinSections(blocks);
}

function writeFixed(path, fix, overrides) {
	writeFileAtomic(path, composeFixedContent({
		text: fix.text,
		parsed: fix.parsed,
		diffs: fix.diffs,
		targetLanguages: fix.targetLanguages,
		overrides,
	}));
}

function requireConfirmation() {
	if (process.stdin.isTTY) {
		return true;
	}
	logger.error(`Differences found. Use --overwrite to apply without confirmation.`);
	process.exitCode = 1;
	return false;
}

function fileChangedSince(path, text) {
	try {
		return readFileSync(path, 'utf8') !== text;
	}
	catch {
		return true;
	}
}

function writeConfirmed(path, fix, overrides) {
	if (fileChangedSince(path, fix.text)) {
		logger.error(`'${path}' changed while waiting for confirmation; no changes were applied. Re-run fix.`);
		process.exitCode = 1;
		return;
	}
	writeFixed(path, fix, overrides);
}

async function confirmAndWrite(path, fix, overrides) {
	if (!requireConfirmation()) {
		return;
	}
	const confirmed = await confirmFix();
	if (!confirmed) {
		logger.log(`Skipped: \`${path}\` was not modified.`);
		return;
	}
	writeConfirmed(path, fix, overrides);
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

	const fix = buildFixDiffs(path, parsedLanguages, overrides);

	if (!reportDiffs(fix.diffs, path)) {
		return;
	}

	if (overwrite) {
		writeFixed(path, fix, overrides);
		return;
	}

	await confirmAndWrite(path, fix, overrides);
}
