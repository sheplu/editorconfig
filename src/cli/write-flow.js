import { existsSync } from 'node:fs';
import {
	AVAILABLE_LANGUAGES,
	composeEditorConfig,
	EMPTY_OVERRIDES,
} from '../templates/index.js';
import { logger } from '../utils/logger.js';
import { writeFileAtomic } from '../utils/atomic-write.js';
import { NOT_PROVIDED } from './options.js';
import { ask, CANCELLED, isYes } from './prompt.js';

export function createEditorConfig(path = '.editorconfig', languages = [], overrides = EMPTY_OVERRIDES) {
	writeFileAtomic(path, composeEditorConfig(languages, overrides));
}

function resolveToken(token) {
	// Only a full-integer token is an index — '1garbage' or '1.5' must not silently select language 1.
	if (!/^\d+$/u.test(token)) {
		return token;
	}
	const index = Number.parseInt(token, 10);
	if (index < 1 || index > AVAILABLE_LANGUAGES.length) {
		throw new Error(`language index out of range: '${token}' (valid: 1-${AVAILABLE_LANGUAGES.length})`);
	}
	return AVAILABLE_LANGUAGES[index - 1];
}

export function resolvePromptAnswer(answer) {
	return answer
		.split(',')
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token.length > 0)
		.map((token) => resolveToken(token));
}

async function promptLanguages() {
	const numbered = AVAILABLE_LANGUAGES
		.map((name, index) => `  ${index + 1}. ${name}`)
		.join('\n');
	logger.log(`Available language sections:\n${numbered}`);
	const answer = await ask('Languages? [comma-separated names or indices, blank=base only] ');
	if (answer === CANCELLED) {
		return CANCELLED;
	}
	return resolvePromptAnswer(answer);
}

function resolveLanguages(parsedLanguages) {
	if (parsedLanguages !== NOT_PROVIDED) {
		return Promise.resolve(parsedLanguages);
	}
	if (process.stdin.isTTY) {
		return promptLanguages();
	}
	return Promise.resolve([]);
}

function reportCancelled(path) {
	logger.error(`Cancelled: \`${path}\` was not modified.`);
	process.exitCode = 1;
}

function applyOverwriteAnswer({ answer, path, languages, overrides }) {
	if (answer === CANCELLED) {
		reportCancelled(path);
		return;
	}
	if (isYes(answer)) {
		createEditorConfig(path, languages, overrides);
		return;
	}
	logger.log(`Skipped: \`${path}\` was not modified.`);
}

async function handleExistingTarget(path, languages, overrides) {
	if (!process.stdin.isTTY) {
		logger.error(`\`${path}\` already exists. Use --overwrite to replace it.`);
		process.exitCode = 1;
		return;
	}
	const answer = await ask(`\`${path}\` already exists. Overwrite? [y/N] `);
	applyOverwriteAnswer({ answer, path, languages, overrides });
}

export async function runWrite({ path, overwrite, parsedLanguages, overrides }) {
	const languages = await resolveLanguages(parsedLanguages);
	if (languages === CANCELLED) {
		reportCancelled(path);
		return;
	}
	if (!existsSync(path) || overwrite) {
		createEditorConfig(path, languages, overrides);
		return;
	}
	await handleExistingTarget(path, languages, overrides);
}
