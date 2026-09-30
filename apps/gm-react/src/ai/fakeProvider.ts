import { AiTransportError, type AiChatProvider, type AiReply, type AiTurn } from './transport';

/** Hand-authored, versioned provider replies; these contain no live user data. */
export interface FakeAiTranscript {
	/** Turns replayed before `prompt`, for a follow-up ask (e.g. the ask after a cancelled run). */
	priorTurns?: readonly AiTurn[];
	prompt: string;
	replies: readonly AiReply[];
}

/** The first assistant tool call without a result in the very next turn — both provider APIs reject it. */
function unansweredToolCall(turns: readonly AiTurn[]): string | null {
	for (const [index, turn] of turns.entries()) {
		if (turn.role !== 'assistant') continue;
		const next = turns[index + 1];
		const answered = new Set(
			next?.role === 'tool-results' ? next.results.map((result) => result.toolCallId) : [],
		);
		const missing = turn.toolCalls.find((call) => !answered.has(call.id));
		if (missing) return missing.id;
	}
	return null;
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
	let history: AiTurn[] = [
		...(recording.priorTurns ?? []),
		{ role: 'user', text: recording.prompt },
	];
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
			// Covers the replayed prior turns too, which the per-reply order check above never reaches.
			const unanswered = unansweredToolCall(request.turns);
			if (unanswered !== null)
				return drift('tool call without a result', unanswered, request.turns);
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
