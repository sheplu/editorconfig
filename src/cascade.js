import { dirname, sep } from 'node:path';

function depthOf(path) {
	return path.split(sep).length;
}

function isAncestorDir(ancestor, descendant) {
	return descendant.startsWith(`${ancestor}${sep}`);
}

function comparePaths(left, right) {
	const dl = depthOf(left);
	const dr = depthOf(right);
	if (dl !== dr) {
		return dl - dr;
	}
	return left.localeCompare(right);
}

function findClosestAncestor(trees, dir) {
	return trees.find((tree) => isAncestorDir(dirname(tree.root), dir)) ?? false;
}

export function classify(paths) {
	const sorted = paths.toSorted(comparePaths);
	const trees = [];
	for (const path of sorted) {
		const ancestor = findClosestAncestor(trees, dirname(path));
		if (ancestor) {
			ancestor.children.push(path);
		}
		else {
			trees.push({ root: path, children: [] });
		}
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
