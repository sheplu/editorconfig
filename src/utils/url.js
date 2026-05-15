export function tryParseUrl(input) {
	try {
		return new URL(input);
	}
	catch {
		return false;
	}
}

export function isHttpScheme(url) {
	return url.protocol === 'http:' || url.protocol === 'https:';
}

export function parseRedirectLocation(location, currentUrl) {
	if (typeof location !== 'string' || location.length === 0) {
		throw new Error(`failed to fetch '${currentUrl}': redirect missing Location header`);
	}
	const next = new URL(location, currentUrl);
	if (next.protocol !== 'https:') {
		throw new Error(`failed to fetch '${currentUrl}': refused redirect to non-https '${next.href}'`);
	}
	return next.href;
}
