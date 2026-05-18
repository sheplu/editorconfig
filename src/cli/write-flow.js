import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
	AVAILABLE_LANGUAGES,
	composeEditorConfig,
	EMPTY_OVERRIDES,
} from '../templates/index.js';
import { logger } from '../utils/logger.js';
import { NOT_PROVIDED } from './options.js';

export function createEditorConfig(path = '.editorconfig', languages = [], overrides = EMPTY_OVERRIDES) {
	writeFileSync(path, composeEditorConfig(languages, overrides), 'utf8');
};

function resolvePromptAnswer(answer) {
	const tokens = answer
		.split(',')
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token.length > 0);
	return tokens.map((token) => {
		const asNumber = Number.parseInt(token, 10);
		if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= AVAILABLE_LANGUAGES.length) {
			return AVAILABLE_LANGUAGES[asNumber - 1];
		}
		return token;
	});
}

function promptLanguages() {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		const numbered = AVAILABLE_LANGUAGES
			.map((name, index) => `  ${index + 1}. ${name}`)
			.join('\n');
		logger.log(`Available language sections:\n${numbered}`);
		rl.question('Languages? [comma-separated names or indices, blank=base only] ', (answer) => {
			rl.close();
			resolve(resolvePromptAnswer(answer));
		});
	});
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

function confirmOverwrite(path) {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		rl.question(`\`${path}\` already exists. Overwrite? [y/N] `, (answer) => {
			rl.close();
			resolve(/^y(es)?$/iu.test(answer.trim()));
		});
	});
}

async function handleExistingTarget(path, languages, overrides) {
	if (!process.stdin.isTTY) {
		logger.error(`\`${path}\` already exists. Use --overwrite to replace it.`);
		process.exitCode = 1;
		return;
	}
	const confirmed = await confirmOverwrite(path);
	if (confirmed) {
		createEditorConfig(path, languages, overrides);
	}
	else {
		logger.log(`Skipped: \`${path}\` was not modified.`);
	}
}

export async function runWrite({ path, overwrite, parsedLanguages, overrides }) {
	const languages = await resolveLanguages(parsedLanguages);
	if (!existsSync(path) || overwrite) {
		createEditorConfig(path, languages, overrides);
		return;
	}
	await handleExistingTarget(path, languages, overrides);
}
