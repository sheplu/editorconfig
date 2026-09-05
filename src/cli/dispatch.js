import { DEFAULT_PRESET, EMPTY_OVERRIDES, resolvePreset } from '../templates/index.js';
import { loadCustomTemplate } from '../templates/custom-template.js';
import { NO_LANGUAGE_FILTER, runCheck } from '../check.js';
import { runCheckRecursive } from '../check-recursive.js';
import { logger } from '../utils/logger.js';
import { NOT_PROVIDED, parseLanguages } from './options.js';
import { runFix } from './fix-flow.js';
import { runWrite } from './write-flow.js';

const OVERRIDES_FAILED = Symbol('overrides-failed');
const PRESET_FAILED = Symbol('preset-failed');

function resolvePresetName(presetValue) {
	if (typeof presetValue !== 'string') {
		return DEFAULT_PRESET;
	}
	const name = presetValue.trim().toLowerCase();
	try {
		resolvePreset(name);
		return name;
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
		return PRESET_FAILED;
	}
}

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

function withPreset(overrides, preset) {
	return {
		bodies: overrides.bodies,
		rawSections: overrides.rawSections,
		hasRoot: overrides.hasRoot,
		preset,
	};
}

function resolveCheckPath(values) {
	if (typeof values.path === 'string' && values.path.length > 0) {
		return values.path;
	}
	if (values.recursive) {
		return process.cwd();
	}
	return '.editorconfig';
}

function dispatchCheck({ path, languages, strict, overrides, recursive, json }) {
	let filter = languages;
	if (filter === NOT_PROVIDED) {
		filter = NO_LANGUAGE_FILTER;
	}
	try {
		if (recursive) {
			runCheckRecursive({ startDir: path, parsedLanguages: filter, strict, overrides, json });
			return;
		}
		runCheck({ path, parsedLanguages: filter, strict, overrides, json });
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

async function handleWrite({ path, overwrite, languages, overrides, recursive, json }) {
	if (recursive) {
		logger.error('--recursive (-r) is only supported with --mode=check');
		process.exitCode = 1;
		return;
	}
	if (json) {
		logger.error('--json is only supported with --mode=check');
		process.exitCode = 1;
		return;
	}
	await dispatchWrite({ path, overwrite, languages, overrides });
}

async function dispatchFix({ path, overwrite, languages, overrides }) {
	try {
		await runFix({ path, overwrite, parsedLanguages: languages, overrides });
	}
	catch (error) {
		logger.error(error.message);
		process.exitCode = 1;
	}
}

async function handleFix({ path, overwrite, languages, overrides, recursive, json }) {
	if (recursive) {
		logger.error('--recursive (-r) is only supported with --mode=check');
		process.exitCode = 1;
		return;
	}
	if (json) {
		logger.error('--json is only supported with --mode=check');
		process.exitCode = 1;
		return;
	}
	await dispatchFix({ path, overwrite, languages, overrides });
}

function reportInvalidCommand() {
	logger.error('invalid command');
	process.exitCode = 1;
}

function runCommand({ mode, path, overwrite, languages, strict, overrides, recursive, json }) {
	if (mode === 'write') {
		return handleWrite({ path, overwrite, languages, overrides, recursive, json });
	}
	if (mode === 'check') {
		return dispatchCheck({ path, languages, strict, overrides, recursive, json });
	}
	if (mode === 'fix') {
		return handleFix({ path, overwrite, languages, overrides, recursive, json });
	}
	reportInvalidCommand();
}

export async function dispatchValues(values) {
	const preset = resolvePresetName(values.preset);
	if (preset === PRESET_FAILED) {
		return;
	}
	const overrides = await resolveOverrides(values.template);
	if (overrides === OVERRIDES_FAILED) {
		return;
	}
	await runCommand({
		mode: values.mode,
		path: resolveCheckPath(values),
		overwrite: values.overwrite,
		languages: parseLanguages(values.languages),
		strict: values.strict,
		overrides: withPreset(overrides, preset),
		recursive: Boolean(values.recursive),
		json: Boolean(values.json),
	});
}
