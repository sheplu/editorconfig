import { existsSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

function resolveTarget(path) {
	// Write through symlinks, matching plain writeFileSync behavior.
	if (existsSync(path)) {
		return realpathSync(path);
	}
	return path;
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
