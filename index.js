import { copyFile } from 'node:fs/promises';

export async function createEditorConfig(path = '.editorconfig') {
	await copyFile('.editorconfig', path);
};
