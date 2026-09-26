export const ONE_MB = 1024 * 1024;

export function streamFrom(...byteArrays) {
	return new ReadableStream({
		start(controller) {
			for (const bytes of byteArrays) {
				controller.enqueue(bytes);
			}
			controller.close();
		},
	});
}

export function makeResponse({ status = 200, headers = {}, stream }) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: new Headers(headers),
		body: stream ?? streamFrom(),
	};
}

export function trackedStream(flags, ...byteArrays) {
	return new ReadableStream({
		start(controller) {
			for (const bytes of byteArrays) {
				controller.enqueue(bytes);
			}
		},
		cancel() {
			flags.cancelled = true;
		},
	});
}

export function makeBodylessResponse({ status = 204, headers = {} } = {}) {
	const response = makeResponse({ status, headers });
	// Bodyless responses (204/205/304) carry body: null in undici.
	delete response.body;
	return response;
}
