import { describe, expect, it } from 'vitest';
import { parseCopilotAnswer, parseCopilotQuestion, parseCopilotSnapshot } from './contract';

const question = { version: 1, vaultId: 'vault', revision: 'r1', question: 'Who guards the gate?' };
const citation = { sourceId: 'note', chunkId: 'note:secret', revision: 'r1' };
const answer = {
	version: 1,
	revision: 'r1',
	status: 'answered',
	answer: 'The watch.',
	citations: [citation],
};

describe('Copilot wire contract v1', () => {
	it('round-trips a question and grounded answer', () => {
		expect(parseCopilotQuestion(question)).toEqual(question);
		expect(parseCopilotAnswer(answer, 'r1')).toEqual(answer);
	});
	it.each([
		{ ...question, version: 2 },
		{ ...question, question: ' ' },
		{ ...question, question: 'a'.repeat(4001) },
		{ ...question, vaultId: '' },
		{ ...question, mode: 'cloud-enhanced' },
		{ ...question, actorId: 'dm' },
		{ ...question, vault: { secret: 'content' } },
		null,
	])('rejects malformed questions and caller-supplied authority or vault uploads %#', (value) => {
		expect(() => parseCopilotQuestion(value)).toThrow('Invalid Copilot question');
	});
	it.each([
		{ ...answer, revision: 'r2' },
		{ ...answer, citations: [] },
		{ ...answer, citations: [{ ...citation, revision: 'r2' }] },
		{ ...answer, citations: [citation, citation] },
		{ ...answer, citations: [1, 2, 3, 4] },
		{ ...answer, commands: [] },
		{ ...answer, status: 'not-found' },
		{ ...answer, answer: '' },
		null,
	])('rejects stale, uncited, malformed or executable answers %#', (value) => {
		expect(() => parseCopilotAnswer(value, 'r1')).toThrow();
	});
	it('accepts a grounded abstention without invented citations', () => {
		const missing = {
			...answer,
			status: 'not-found',
			answer: 'Not in the campaign notes.',
			citations: [],
		};
		expect(parseCopilotAnswer(missing, 'r1')).toEqual(missing);
	});
	it('rejects duplicate chunks and overlong fields; accepts deletion snapshots', () => {
		const chunk = { sourceId: 'note', chunkId: 'note:secret', text: 'A secret.' };
		expect(parseCopilotSnapshot({ revision: 'r1', chunks: [chunk] }).chunks).toEqual([chunk]);
		expect(parseCopilotSnapshot({ revision: 'r2', chunks: [] }).chunks).toEqual([]);
		expect(() => parseCopilotSnapshot({ revision: 'r1', chunks: [chunk, chunk] })).toThrow();
		expect(() =>
			parseCopilotSnapshot({ revision: 'r1', chunks: [{ ...chunk, text: 'a'.repeat(4001) }] }),
		).toThrow();
	});
});
