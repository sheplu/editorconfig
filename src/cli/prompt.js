import { createInterface } from 'node:readline';

export const CANCELLED = Symbol('prompt-cancelled');

// Settles exactly once: with the answer, or with CANCELLED on EOF (Ctrl-D).
export function ask(question, { input = process.stdin, output = process.stdout } = {}) {
	return new Promise((resolve) => {
		const rl = createInterface({ input, output });
		let answered = false;
		rl.question(question, (answer) => {
			answered = true;
			rl.close();
			resolve(answer);
		});
		rl.on('close', () => {
			if (!answered) {
				resolve(CANCELLED);
			}
		});
	});
}

export function isYes(answer) {
	return /^y(es)?$/iu.test(answer.trim());
}
