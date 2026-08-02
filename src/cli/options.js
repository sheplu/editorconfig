import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
	ALIASES,
	AVAILABLE_LANGUAGES,
} from '../templates/index.js';
import { logger } from '../utils/logger.js';

export const options = {
	mode: { type: 'string', short: 'm' },
	path: { type: 'string', short: 'p' },
	languages: { type: 'string', short: 'l' },
	help: { type: 'boolean', short: 'h' },
	version: { type: 'boolean', short: 'v' },
	overwrite: { type: 'boolean', short: 'o' },
	strict: { type: 'boolean', short: 's' },
	template: { type: 'string', short: 't' },
	recursive: { type: 'boolean', short: 'r' },
	json: { type: 'boolean' },
};

export function printVersion() {
	const pkgUrl = new URL('../../package.json', import.meta.url);
	const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
	logger.log(version);
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
	logger.log(`Usage: editorconfig --mode=<command> [--path=<path>] [--languages=<list>] [--template=<path|url>] [--recursive] [--json]

Commands:
  write    Create a .editorconfig file with the selected language sections
  check    Validate per-section against the canonical templates
  fix      Show differences and interactively apply fixes

Options:
  -m, --mode       Command to run (write | check | fix)
  -p, --path       Path to the .editorconfig file, or start directory when used with --recursive (default: .editorconfig / cwd)
  -l, --languages  Comma-separated language sections (write: which to emit; check: required set; recursive: enforced on root only)
  -o, --overwrite  Overwrite an existing .editorconfig without confirmation
  -s, --strict     Treat unknown section headers as failures (check only)
  -t, --template   Path or https URL to a custom .editorconfig-syntax file whose sections override the built-in ones
  -r, --recursive  Check only. Walk the start directory and validate every .editorconfig (root + children) with cascade checks
      --json       Emit check results as JSON instead of human-readable text (check only)
  -v, --version    Show the installed version
  -h, --help       Show this help message

Languages: ${AVAILABLE_LANGUAGES.join(', ')}
Aliases:   ${formatAliasList()}

Examples:
  editorconfig --mode=write --languages=js,md
  editorconfig --mode=write                       # interactive in TTY, base only otherwise
  editorconfig --mode=check --languages=js,md    # require exactly base + js + md
  editorconfig --mode=check --strict             # fail on any unknown section header
  editorconfig --mode=check --recursive          # validate every .editorconfig under cwd (monorepo)
  editorconfig --mode=check --template=./team.editorconfig
  editorconfig --mode=check --template=https://team.example.com/.editorconfig
  editorconfig --mode=fix                        # show diff and prompt before fixing
  editorconfig --mode=fix --overwrite            # apply fixes without prompting`);
};

function formatCliError(error) {
	if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
		return `${error.message.split('.')[0]}. See --help.`;
	}
	return error.message;
}

export function parseCliArgs(args) {
	try {
		return parseArgs({ args, options });
	}
	catch (error) {
		logger.error(formatCliError(error));
		process.exitCode = 1;
		return false;
	}
}
