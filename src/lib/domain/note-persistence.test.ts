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
				visibility: 'dm_only',
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
				visibility: 'dm_only',
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
				visibility: 'dm_only',
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
				visibility: 'dm_only',
			}),
		).toBe(true);
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: '',
				tags: [],
				frontmatter: { session: 1 },
				visibility: 'dm_only',
			}),
		).toBe(true);
	});

	it('returns true when visibility differs from dm_only', () => {
		expect(
			hasMeaningfulNoteContent({
				title: 'Untitled',
				content: '',
				tags: [],
				frontmatter: {},
				visibility: 'shared',
			}),
		).toBe(true);
	});
});
