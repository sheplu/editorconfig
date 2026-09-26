import { dirname, sep } from 'node:path';

function depthOf(path) {
	return path.split(sep).length;
}

function comparePaths(left, right) {
	const dl = depthOf(left);
	const dr = depthOf(right);
	if (dl !== dr) {
		return dl - dr;
	}
	return left.localeCompare(right);
}

// Walks the ancestor chain of `dir` against an index of classified root directories.
// Depth-sorted processing keeps tree roots pairwise non-nested, so at most one ancestor can match.
// Exact-path lookups also handle the filesystem root, which prefix matching gets wrong ('//').
function findAncestorTree(rootsByDir, dir) {
	let current = dirname(dir);
	for (;;) {
		const tree = rootsByDir.get(current);
		if (tree) {
			return tree;
		}
		const parent = dirname(current);
		if (parent === current) {
			return false;
		}
		current = parent;
	}
}

function placePath(path, trees, rootsByDir) {
	const ancestor = findAncestorTree(rootsByDir, dirname(path));
	if (ancestor) {
		ancestor.children.push(path);
		return;
	}
	const tree = { root: path, children: [] };
	trees.push(tree);
	rootsByDir.set(dirname(path), tree);
}

export function classify(paths) {
	const sorted = paths.toSorted(comparePaths);
	const trees = [];
	const rootsByDir = new Map();
	for (const path of sorted) {
		placePath(path, trees, rootsByDir);
	}
	return trees;
}

function buildSectionMap(parsed) {
	const map = new Map();
	for (const section of parsed.sections) {
		if (!map.has(section.header)) {
			map.set(section.header, new Map());
		}
		const target = map.get(section.header);
		for (const [key, value] of section.body) {
			target.set(key, value);
		}
	}
	return map;
}

function diffKey({ childPath, header, key, childValue, rootValue }) {
	if (rootValue === childValue) {
		return {
			kind: 'redundant',
			severity: 'warn',
			file: childPath,
			header,
			key,
			value: childValue,
		};
	}
	return {
		kind: 'contradiction',
		severity: 'warn',
		file: childPath,
		header,
		key,
		rootValue,
		childValue,
	};
}

function compareChildKeys({ childPath, header, childBody, rootSections }) {
	const rootSameHeader = rootSections.get(header);
	if (!rootSameHeader) {
		return [];
	}
	const issues = [];
	for (const [key, value] of childBody) {
		if (rootSameHeader.has(key)) {
			issues.push(diffKey({
				childPath,
				header,
				key,
				childValue: value,
				rootValue: rootSameHeader.get(key),
			}));
		}
	}
	return issues;
}

function compareKeyIssues(left, right) {
	if (left.header !== right.header) {
		return left.header.localeCompare(right.header);
	}
	return left.key.localeCompare(right.key);
}

function collectKeyIssues({ rootParsed, childParsed, childPath }) {
	const rootSections = buildSectionMap(rootParsed);
	const childSections = buildSectionMap(childParsed);
	const issues = [];
	for (const [header, childBody] of childSections) {
		issues.push(...compareChildKeys({ childPath, header, childBody, rootSections }));
	}
	return issues.toSorted(compareKeyIssues);
}

export function crossFileIssues({ rootParsed, childParsed, childPath }) {
	const issues = [];
	if (childParsed.hasRoot) {
		issues.push({ kind: 'child-root', severity: 'fail', file: childPath });
	}
	issues.push(...collectKeyIssues({ rootParsed, childParsed, childPath }));
	return issues;
}
