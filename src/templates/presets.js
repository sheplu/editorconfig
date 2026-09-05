import { base } from './base.js';
import {
	minimalBase,
	minimalJavascript,
	minimalPython,
	minimalRust,
} from './minimal.js';
import { javascript } from './javascript.js';
import { yaml } from './yaml.js';
import { markdown } from './markdown.js';
import { python } from './python.js';
import { go } from './go.js';
import { rust } from './rust.js';
import { terraform } from './terraform.js';
import { json } from './json.js';
import { toml } from './toml.js';
import { shell } from './shell.js';
import { makefile } from './makefile.js';
import { dockerfile } from './dockerfile.js';
import { html } from './html.js';
import { css } from './css.js';

export const LANGUAGE_TEMPLATES = {
	javascript,
	yaml,
	markdown,
	python,
	go,
	rust,
	terraform,
	json,
	toml,
	shell,
	makefile,
	dockerfile,
	html,
	css,
};

export const DEFAULT_PRESET = 'default';

export const AVAILABLE_PRESETS = ['default', 'minimal'];

const MINIMAL_LANGUAGE_TEMPLATES = {
	javascript: minimalJavascript,
	yaml,
	markdown,
	python: minimalPython,
	go,
	rust: minimalRust,
	terraform,
	json,
	toml,
	shell,
	makefile,
	dockerfile,
	html,
	css,
};

const PRESETS = {
	default: {
		base,
		languages: LANGUAGE_TEMPLATES,
	},
	minimal: {
		base: minimalBase,
		languages: MINIMAL_LANGUAGE_TEMPLATES,
	},
};

export function resolvePreset(name = DEFAULT_PRESET) {
	if (!Object.hasOwn(PRESETS, name)) {
		throw new Error(
			`unknown preset: '${name}'. Available: ${AVAILABLE_PRESETS.join(', ')}`,
		);
	}
	return PRESETS[name];
}
