import { describe, expect, it } from 'vitest';
import {
	buildTwoSentenceContextSnippetAtPosition,
	findBacklinkContextSnippet,
} from './backlink-context.js';
import { createNoteId } from '$lib/types/note.js';

describe('backlink context snippets', () => {
	it('returns a two-sentence snippet centered on the backlink sentence', () => {
		const content =
			'The party reached the gate. They entered [[Waterdeep]] at dawn. Guards waved them through.';
		const position = content.indexOf('[[Waterdeep]]');
		const snippet = buildTwoSentenceContextSnippetAtPosition(content, position);
		expect(snippet).toContain('They entered [[Waterdeep]] at dawn.');
		expect(snippet).toContain('Guards waved them through.');
	});

	it('uses the previous sentence when the backlink appears in the last sentence', () => {
		const content =
			'The market was loud. Traders haggled all day. We slept in [[Waterdeep]] at night.';
		const position = content.indexOf('[[Waterdeep]]');
		const snippet = buildTwoSentenceContextSnippetAtPosition(content, position);
		expect(snippet).toContain('Traders haggled all day.');
		expect(snippet).toContain('We slept in [[Waterdeep]] at night.');
	});

	it('finds the first backlink snippet for a target note', () => {
		const targetId = createNoteId('note-waterdeep');
		const sourceContent =
			'Morning prep was short. We arrived in [[note:note-waterdeep|Waterdeep]]. The docks were crowded.';
		const snippet = findBacklinkContextSnippet({
			sourceContent,
			targetId,
			resolveTitle: () => null,
		});
		expect(snippet).toContain('We arrived in [[note:note-waterdeep|Waterdeep]].');
		expect(snippet).toContain('The docks were crowded.');
	});
});
