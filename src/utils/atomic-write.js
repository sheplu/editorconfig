import { accessSync, chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const MAX_LINK_DEPTH = 40;

// A crashed process never cleans up its temp file; the next write sweeps siblings older than one hour.
const STALE_TEMP_MS = 3_600_000;

// Octal span of the permission bits: st_mode % MODE_PERMISSION_SPAN strips the file-type bits.
// POSIX leaves chmod's treatment of the non-permission bits unspecified.
const MODE_PERMISSION_SPAN = 0o1_0000;

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
	// A cycle never leaves the chain on its own and plain writeFileSync fails with ELOOP there — so does this.
	let current = path;
	let depth = 0;
	while (isSymlink(current)) {
		if (depth >= MAX_LINK_DEPTH) {
			const error = new Error(`ELOOP: too many symbolic links encountered, open '${path}'`);
			error.code = 'ELOOP';
			throw error;
		}
		current = readLinkTarget(current);
		depth += 1;
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

// An unpredictable name plus exclusive ('wx') creation means a pre-existing entry (e.g. a symlink) can never redirect the write.
function tempPathFor(target) {
	return join(dirname(target), `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`);
}

function staleTempCandidates(dir, prefix) {
	try {
		return readdirSync(dir).filter((entry) => entry.startsWith(prefix));
	}
	catch {
		return [];
	}
}

function removeIfStale(candidate) {
	try {
		if (statSync(candidate).isFile() && Date.now() - statSync(candidate).mtimeMs > STALE_TEMP_MS) {
			rmSync(candidate, { force: true });
		}
	}
	catch {
		// Already gone, or a concurrent writer replaced it — nothing to do.
	}
}

function removeStaleTemps(target) {
	const dir = dirname(target);
	const prefix = `.${basename(target)}.tmp-`;
	for (const entry of staleTempCandidates(dir, prefix)) {
		removeIfStale(join(dir, entry));
	}
}

function createTemp(target, content) {
	for (;;) {
		const temp = tempPathFor(target);
		try {
			writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' });
			return temp;
		}
		catch (error) {
			if (error.code !== 'EEXIST') {
				// The 'wx' flag guarantees any file at temp was created by this call.
				rmSync(temp, { force: true });
				throw error;
			}
		}
	}
}

// Flush the temp file's data before the rename so a power loss cannot publish a truncated replacement.
function syncFile(path) {
	const fd = openSync(path, 'r+');
	try {
		fsyncSync(fd);
	}
	finally {
		closeSync(fd);
	}
}

// Persist the directory entry itself, best effort: opening a directory fails on Windows, and some systems lack directory fsync.
function syncDir(path) {
	try {
		const fd = openSync(path, 'r');
		try {
			fsyncSync(fd);
		}
		finally {
			closeSync(fd);
		}
	}
	catch {
		// The rename is still crash-safe at the process level without the directory sync.
	}
}

function applyPermissionsAndRename(temp, target) {
	// Flush before restoring the destination mode: an owner-write-only destination would break an fsync through the restored mode.
	syncFile(temp);
	if (existsSync(target)) {
		// Creation applies the process umask, so restore the destination's permissions before the rename.
		chmodSync(temp, statSync(target).mode % MODE_PERMISSION_SPAN);
	}
	renameSync(temp, target);
	syncDir(dirname(target));
}

// A truncating write that fails midway destroys the previous content.
// Write to a sibling temp file and rename, so the original survives failures.
export function writeFileAtomic(path, content) {
	const target = resolveTarget(path);
	if (existsSync(target)) {
		// Renaming only needs directory permission; refuse write-protected targets like plain writeFileSync does.
		accessSync(target, constants.W_OK);
	}
	removeStaleTemps(target);
	const temp = createTemp(target, content);
	try {
		applyPermissionsAndRename(temp, target);
	}
	catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
}
