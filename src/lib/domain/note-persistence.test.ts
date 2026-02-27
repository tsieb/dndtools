import { describe, expect, it } from 'vitest';
import { hasMeaningfulNoteContent } from './note-persistence.js';

describe('hasMeaningfulNoteContent', () => {
	it('returns false for untouched default notes', () => {
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: '',
				tags: [],
				frontmatter: {},
			}),
		).toBe(false);
	});

	it('returns true when body content exists', () => {
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: 'Some content',
				tags: [],
				frontmatter: {},
			}),
		).toBe(true);
	});

	it('returns true when title is customized', () => {
		expect(
			hasMeaningfulNoteContent({
				title: 'Session Prep',
				content: '',
				tags: [],
				frontmatter: {},
			}),
		).toBe(true);
	});

	it('returns true when tags or frontmatter exist', () => {
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: '',
				tags: ['npc'],
				frontmatter: {},
			}),
		).toBe(true);
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: '',
				tags: [],
				frontmatter: { session: 1 },
			}),
		).toBe(true);
	});
});
