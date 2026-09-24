import { AiTransportError, type AiChatProvider, type AiReply, type AiTurn } from './transport';

/** Hand-authored, versioned provider replies; these contain no live user data. */
export interface FakeAiTranscript {
	prompt: string;
	replies: readonly AiReply[];
}

function serialized(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

/** No network or global provider override. Create a fresh replay for every exchange. */
export function createFakeAiProvider(transcript: FakeAiTranscript): {
	send: AiChatProvider;
	assertComplete: () => void;
} {
	const recording = structuredClone(transcript);
	let index = 0;
	let history: AiTurn[] = [{ role: 'user', text: recording.prompt }];
	const drift = (label: string, expected: unknown, actual: unknown): never => {
		throw new Error(
			`Transcript drift at reply ${index + 1}: ${label}\n` +
				`--- expected\n${serialized(expected)
					.split('\n')
					.map((line) => `- ${line}`)
					.join('\n')}\n` +
				`+++ received\n${serialized(actual)
					.split('\n')
					.map((line) => `+ ${line}`)
					.join('\n')}`,
		);
	};
	return {
		send: async (request, options) => {
			if (options?.signal?.aborted) {
				throw new AiTransportError('aborted', null, 'The request was cancelled.');
			}
			const reply = recording.replies[index];
			if (!reply) return drift('unexpected provider call', 'end of transcript', request.turns);
			if (serialized(request.turns.slice(0, history.length)) !== serialized(history)) {
				return drift('conversation history', history, request.turns);
			}
			const previous = recording.replies[index - 1];
			const tail = request.turns.slice(history.length);
			if (previous?.toolCalls.length) {
				const resultTurn = tail[0];
				const expectedIds = previous.toolCalls.map((call) => call.id);
				const actualIds =
					resultTurn?.role === 'tool-results'
						? resultTurn.results.map((result) => result.toolCallId)
						: [];
				if (tail.length !== 1 || serialized(expectedIds) !== serialized(actualIds)) {
					return drift('tool result order', expectedIds, tail);
				}
			} else if (tail.length) {
				return drift('unexpected turns', [], tail);
			}
			for (const call of reply.toolCalls) {
				if (!request.tools.some((tool) => tool.name === call.name)) {
					return drift(
						'tool not offered',
						call.name,
						request.tools.map((tool) => tool.name),
					);
				}
			}
			history = structuredClone([
				...request.turns,
				{ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls },
			]);
			index += 1;
			if (reply.text) options?.onToken?.(reply.text);
			return structuredClone(reply);
		},
		assertComplete: () => {
			if (index !== recording.replies.length) {
				drift('unconsumed replies', recording.replies.length, index);
			}
		},
	};
}
