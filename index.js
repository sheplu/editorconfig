#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
	ALIASES,
	AVAILABLE_LANGUAGES,
	composeEditorConfig,
	EMPTY_OVERRIDES,
} from './src/templates/index.js';
import { loadCustomTemplate } from './src/templates/custom-template.js';
import { compareEditorConfig, NO_LANGUAGE_FILTER, runCheck } from './src/check.js';
import { logger } from './src/utils/logger.js';

export { compareEditorConfig };

export function createEditorConfig(path = '.editorconfig', languages = [], overrides = EMPTY_OVERRIDES) {
	writeFileSync(path, composeEditorConfig(languages, overrides), 'utf8');
};

export const options = {
	mode: {
		type: 'string',
		short: 'm',
	},
	path: {
		type: 'string',
		short: 'p',
	},
	languages: {
		type: 'string',
		short: 'l',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
	overwrite: {
		type: 'boolean',
		short: 'o',
	},
	strict: {
		type: 'boolean',
		short: 's',
	},
	template: {
		type: 'string',
		short: 't',
	},
};

export const NOT_PROVIDED = Symbol('languages-not-provided');

export function parseLanguages(raw) {
	if (typeof raw !== 'string') {
		return NOT_PROVIDED;
	}
	return raw
		.split(',')
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token.length > 0);
}

function formatAliasList() {
	const grouped = new Map();
	for (const [alias, target] of Object.entries(ALIASES)) {
		const list = grouped.get(target) ?? [];
		list.push(alias);
		grouped.set(target, list);
	}
	return [...grouped.entries()]
		.map(([target, aliases]) => `${aliases.join(', ')} -> ${target}`)
		.join('; ');
}

export function printHelp() {
	logger.log(`Usage: editorconfig --mode=<command> [--path=<path>] [--languages=<list>] [--template=<path|url>]

Commands:
  write    Create a .editorconfig file with the selected language sections
  check    Validate per-section against the canonical templates

Options:
  -m, --mode       Command to run (write | check)
  -p, --path       Path to the .editorconfig file (default: .editorconfig)
  -l, --languages  Comma-separated language sections (write: which to emit; check: required set)
  -o, --overwrite  Overwrite an existing .editorconfig without confirmation
  -s, --strict     Treat unknown section headers as failures (check only)
  -t, --template   Path or https URL to a custom .editorconfig-syntax file whose sections override the built-in ones
  -h, --help       Show this help message

Languages: ${AVAILABLE_LANGUAGES.join(', ')}
Aliases:   ${formatAliasList()}

Examples:
  editorconfig --mode=write --languages=js,md
  editorconfig --mode=write --languages=         # base only
  editorconfig --mode=write                       # interactive in TTY, base only otherwise
  editorconfig --mode=check                       # validate sections present in the file
  editorconfig --mode=check --languages=js,md    # require exactly base + js + md
  editorconfig --mode=check --strict             # fail on any unknown section header
  editorconfig --mode=write --template=./team.editorconfig
  editorconfig --mode=check --template=./team.editorconfig
  editorconfig --mode=check --template=https://team.example.com/.editorconfig`);
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

async function runWrite({ path, overwrite, parsedLanguages, overrides }) {
	const languages = await resolveLanguages(parsedLanguages);
	if (!existsSync(path) || overwrite) {
		createEditorConfig(path, languages, overrides);
		return;
	}
	await handleExistingTarget(path, languages, overrides);
}

function dispatchCheck({ path, languages, strict, overrides }) {
	let filter = languages;
	if (filter === NOT_PROVIDED) {
		filter = NO_LANGUAGE_FILTER;
	}
	try {
		runCheck({ path, parsedLanguages: filter, strict, overrides });
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
	}
}

async function dispatchWrite({ path, overwrite, languages, overrides }) {
	try {
		await runWrite({ path, overwrite, parsedLanguages: languages, overrides });
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
	}
}

async function runCommand({ mode, path, overwrite, languages, strict, overrides }) {
	if (mode === 'write') {
		await dispatchWrite({ path, overwrite, languages, overrides });
		return;
	}
	if (mode === 'check') {
		dispatchCheck({ path, languages, strict, overrides });
		return;
	}
	logger.error('invalid command');
	process.exitCode = 1;
}

function formatCliError(error) {
	if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
		return `${error.message.split('.')[0]}. See --help.`;
	}
	return error.message;
}

function parseCliArgs(args) {
	try {
		return parseArgs({ args, options });
	}
	catch (error) {
		logger.error(formatCliError(error));
		process.exitCode = 1;
		return false;
	}
}

const OVERRIDES_FAILED = Symbol('overrides-failed');

async function resolveOverrides(templateValue) {
	if (typeof templateValue !== 'string') {
		return EMPTY_OVERRIDES;
	}
	try {
		return await loadCustomTemplate(templateValue);
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
		return OVERRIDES_FAILED;
	}
}

async function dispatchValues(values) {
	const overrides = await resolveOverrides(values.template);
	if (overrides === OVERRIDES_FAILED) {
		return;
	}
	await runCommand({
		mode: values.mode,
		path: values.path || '.editorconfig',
		overwrite: values.overwrite,
		languages: parseLanguages(values.languages),
		strict: values.strict,
		overrides,
	});
}

async function main() {
	const parsed = parseCliArgs(process.argv.slice(2));
	if (!parsed) {
		return;
	}
	if (parsed.values.help) {
		printHelp();
		return;
	}
	await dispatchValues(parsed.values);
};

if (process.argv[1] === import.meta.filename) {
	try {
		await main();
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
	}
}
