#!/usr/bin/env node

import { copyFile } from 'node:fs/promises';

export async function createEditorConfig(path = '.editorconfig') {
	await copyFile('.editorconfig', path);
};

async function main() {
	await createEditorConfig();
};

await main();
