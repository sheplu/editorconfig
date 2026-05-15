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
