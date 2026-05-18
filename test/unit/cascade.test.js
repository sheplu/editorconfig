import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { classify, crossFileIssues } from '../../src/cascade.js';
import { parseSections } from '../../src/templates/index.js';

function parse(text) {
	return parseSections(text);
}

function joinPath(...parts) {
	return parts.join(sep);
}

describe('classify', () => {
	it('groups a child under its closest ancestor', () => {
		const root = joinPath('repo', '.editorconfig');
		const child = joinPath('repo', 'pkg', '.editorconfig');
		const trees = classify([child, root]);
		assert.deepEqual(trees, [{ root, children: [child] }]);
	});

	it('treats sibling directories as independent roots', () => {
		const aFile = joinPath('repo', 'pkgA', '.editorconfig');
		const bFile = joinPath('repo', 'pkgB', '.editorconfig');
		const trees = classify([aFile, bFile]);
		assert.equal(trees.length, 2);
		assert.deepEqual(trees.map((tree) => tree.root).toSorted(), [aFile, bFile].toSorted());
		for (const tree of trees) {
			assert.deepEqual(tree.children, []);
		}
	});

	it('attaches a deep child to the closest ancestor (not the topmost)', () => {
		const top = joinPath('repo', '.editorconfig');
		const mid = joinPath('repo', 'pkg', '.editorconfig');
		const deep = joinPath('repo', 'pkg', 'sub', '.editorconfig');
		const trees = classify([top, mid, deep]);
		assert.equal(trees.length, 1);
		assert.equal(trees[0].root, top);
		assert.deepEqual(trees[0].children.toSorted(), [mid, deep].toSorted());
	});
});

describe('crossFileIssues — key-level diffs', () => {
	it('emits redundant and contradiction together, sorted by header then key', () => {
		const root = parse(`root = true

[*]
indent_style = tab
indent_size = 4
`);
		const child = parse(`[*]
indent_size = 2
indent_style = tab
`);
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.equal(issues.length, 2);
		assert.deepEqual(
			issues.map((issue) => ({ kind: issue.kind, key: issue.key })),
			[
				{ kind: 'contradiction', key: 'indent_size' },
				{ kind: 'redundant', key: 'indent_style' },
			],
		);
	});

});

describe('crossFileIssues — sort order', () => {
	it('sorts key issues across different headers alphabetically', () => {
		const root = parse(`root = true

[*.py]
indent_size = 4

[*]
indent_style = tab
`);
		const child = parse(`[*.py]
indent_size = 2

[*]
indent_style = space
`);
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.equal(issues.length, 2);
		assert.deepEqual(
			issues.map((issue) => issue.header),
			['[*.py]', '[*]'],
		);
	});

	it('returns no issues when child sections share no headers with the root', () => {
		const root = parse('root = true\n\n[*]\nindent_style = tab\n');
		const child = parse('[*.py]\nindent_size = 4\n');
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.deepEqual(issues, []);
	});
});

describe('crossFileIssues — multi-section combos', () => {
	it('sorts issues by header then by key across sections and kinds', () => {
		const root = parse(`root = true

[*]
indent_style = tab
indent_size = 4

[*.py]
indent_size = 4
max_line_length = 88
`);
		// Child overlaps both [*.py] (one redundant + one contradiction) and [*] (one redundant).
		const child = parse(`[*]
indent_style = tab

[*.py]
indent_size = 4
max_line_length = 100
`);
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.equal(issues.length, 3);
		assert.deepEqual(
			issues.map((issue) => ({ header: issue.header, key: issue.key, kind: issue.kind })),
			[
				{ header: '[*.py]', key: 'indent_size', kind: 'redundant' },
				{ header: '[*.py]', key: 'max_line_length', kind: 'contradiction' },
				{ header: '[*]', key: 'indent_style', kind: 'redundant' },
			],
		);
	});
});

describe('crossFileIssues — child-root', () => {
	it('flags root=true on a child even when no key conflicts exist', () => {
		const root = parse('root = true\n\n[*]\nindent_style = tab\n');
		const child = parse('root = true\n\n[*.py]\nindent_size = 4\n');
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.equal(issues.length, 1);
		assert.equal(issues[0].kind, 'child-root');
	});

	it('places child-root before key-level issues in the sorted output', () => {
		const root = parse('root = true\n\n[*]\nindent_style = tab\n');
		const child = parse('root = true\n\n[*]\nindent_style = space\n');
		const issues = crossFileIssues({
			rootParsed: root,
			childParsed: child,
			childPath: '/x/.editorconfig',
		});
		assert.equal(issues.length, 2);
		assert.equal(issues[0].kind, 'child-root');
		assert.equal(issues[1].kind, 'contradiction');
	});
});
