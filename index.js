#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
	ALIASES,
	AVAILABLE_LANGUAGES,
	composeEditorConfig,
} from './templates/index.js';
import { compareEditorConfig, NO_LANGUAGE_FILTER, runCheck } from './check.js';

export { compareEditorConfig };

export function createEditorConfig(path = '.editorconfig', languages = []) {
	writeFileSync(path, composeEditorConfig(languages), 'utf8');
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
	console.log(`Usage: editorconfig --mode=<command> [--path=<path>] [--languages=<list>]

Commands:
  write    Create a .editorconfig file with the selected language sections
  check    Validate per-section against the canonical templates

Options:
  -m, --mode       Command to run (write | check)
  -p, --path       Path to the .editorconfig file (default: .editorconfig)
  -l, --languages  Comma-separated language sections (write: which to emit; check: required set)
  -o, --overwrite  Overwrite an existing .editorconfig without confirmation
  -s, --strict     Treat unknown section headers as failures (check only)
  -h, --help       Show this help message

Languages: ${AVAILABLE_LANGUAGES.join(', ')}
Aliases:   ${formatAliasList()}

Examples:
  editorconfig --mode=write --languages=js,md
  editorconfig --mode=write --languages=         # base only
  editorconfig --mode=write                       # interactive in TTY, base only otherwise
  editorconfig --mode=check                       # validate sections present in the file
  editorconfig --mode=check --languages=js,md    # require exactly base + js + md
  editorconfig --mode=check --strict             # fail on any unknown section header`);
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
		console.log(`Available language sections:\n${numbered}`);
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

function runWrite(path, overwrite, parsedLanguages) {
	return resolveLanguages(parsedLanguages).then((languages) => {
		if (!existsSync(path) || overwrite) {
			createEditorConfig(path, languages);
			return;
		}
		if (!process.stdin.isTTY) {
			console.error(`\`${path}\` already exists. Use --overwrite to replace it.`);
			process.exitCode = 1;
			return;
		}
		return confirmOverwrite(path).then((confirmed) => {
			if (confirmed) {
				createEditorConfig(path, languages);
			}
			else {
				console.log(`Skipped: \`${path}\` was not modified.`);
			}
		});
	});
}

function dispatchCheck(path, languages, strict) {
	let filter = languages;
	if (filter === NOT_PROVIDED) {
		filter = NO_LANGUAGE_FILTER;
	}
	try {
		runCheck(path, filter, strict);
	}
	catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

function runCommand({ mode, path, overwrite, languages, strict }) {
	if (mode === 'write') {
		return runWrite(path, overwrite, languages).catch((error) => {
			console.error(error.message);
			process.exitCode = 1;
		});
	}
	if (mode === 'check') {
		dispatchCheck(path, languages, strict);
		return;
	}
	console.error('invalid command');
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
		console.error(formatCliError(error));
		process.exitCode = 1;
		return false;
	}
}

function main() {
	const args = process.argv.slice(2);
	const parsed = parseCliArgs(args);
	if (!parsed) {
		return;
	}
	const { values } = parsed;
	if (values.help) {
		printHelp();
		return;
	}
	runCommand({
		mode: values.mode,
		path: values.path || '.editorconfig',
		overwrite: values.overwrite,
		languages: parseLanguages(values.languages),
		strict: values.strict,
	});
};

if (process.argv[1] === import.meta.filename) {
	main();
}
