import { existsSync, lstatSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const MAX_LINK_DEPTH = 40;

function isSymlink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	}
	catch {
		return false;
	}
}

function readLinkTarget(path) {
	const target = readlinkSync(path);
	if (isAbsolute(target)) {
		return target;
	}
	return resolve(dirname(path), target);
}

function resolveDanglingLink(path) {
	// A dangling symlink has no realpath, but writeFileSync still follows it and creates its target — do the same.
	let current = path;
	for (let depth = 0; depth < MAX_LINK_DEPTH && isSymlink(current); depth += 1) {
		current = readLinkTarget(current);
	}
	return current;
}

function resolveTarget(path) {
	// Write through symlinks, matching plain writeFileSync behavior.
	if (existsSync(path)) {
		return realpathSync(path);
	}
	return resolveDanglingLink(path);
}

const TIMESTAMP_RADIX = 36;

function tempPathFor(target) {
	const suffix = `${process.pid}-${Date.now().toString(TIMESTAMP_RADIX)}`;
	return join(dirname(target), `.${basename(target)}.tmp-${suffix}`);
}

function writeOptionsFor(target) {
	if (existsSync(target)) {
		// Preserve the destination's permissions across the replacement.
		return { encoding: 'utf8', mode: statSync(target).mode };
	}
	return { encoding: 'utf8' };
}

// A truncating write that fails midway destroys the previous content.
// Write to a sibling temp file and rename, so the original survives failures.
export function writeFileAtomic(path, content) {
	const target = resolveTarget(path);
	const temp = tempPathFor(target);
	try {
		writeFileSync(temp, content, writeOptionsFor(target));
		renameSync(temp, target);
	}
	catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
}
