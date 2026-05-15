import { existsSync, readFileSync } from 'node:fs';
import { fetchTemplate } from '../utils/fetch.js';
import { isHttpScheme, tryParseUrl } from '../utils/url.js';

function readLocalFile(path) {
	if (!existsSync(path)) {
		throw new Error(`custom template '${path}' does not exist`);
	}
	return readFileSync(path, 'utf8');
}

export async function readTemplateText(input) {
	if (typeof input !== 'string' || input.trim() === '') {
		throw new Error('--template requires a path or URL to a custom template');
	}
	const url = tryParseUrl(input);
	if (url && isHttpScheme(url)) {
		if (url.protocol !== 'https:') {
			throw new Error(`--template URL must use https (got '${url.protocol.replace(':', '')}')`);
		}
		return await fetchTemplate(url.href);
	}
	return readLocalFile(input);
}
