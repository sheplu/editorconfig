import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './utils/logger.js';

export const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'build',
	'coverage',
	'.next',
	'.cache',
]);

const EDITORCONFIG_NAME = '.editorconfig';

function readDir(dir) {
	try {
		return readdirSync(dir, { withFileTypes: true });
	}
	catch (error) {
		if (error.code === 'EACCES' || error.code === 'EPERM') {
			logger.warn(`Skipping unreadable directory: ${dir}`);
			return [];
		}
		throw error;
	}
}

function classifyEntry(entry) {
	if (entry.isSymbolicLink()) {
		return 'skip';
	}
	if (entry.isDirectory()) {
		if (IGNORED_DIRS.has(entry.name)) {
			return 'skip';
		}
		return 'descend';
	}
	if (entry.isFile() && entry.name === EDITORCONFIG_NAME) {
		return 'collect';
	}
	return 'skip';
}

function processDir(dir, stack, found) {
	for (const entry of readDir(dir)) {
		const full = join(dir, entry.name);
		const action = classifyEntry(entry);
		if (action === 'descend') {
			stack.push(full);
		}
		else if (action === 'collect') {
			found.push(full);
		}
	}
}

export function discoverEditorConfigs(startDir) {
	const found = [];
	const stack = [startDir];
	while (stack.length > 0) {
		processDir(stack.pop(), stack, found);
	}
	return found.toSorted();
}
