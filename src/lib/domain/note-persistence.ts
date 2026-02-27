import type { Note } from '$lib/types/note.js';

const DEFAULT_UNTITLED_TITLE = 'untitled';

function hasCustomFrontmatter(note: Pick<Note, 'frontmatter'>): boolean {
	return Object.keys(note.frontmatter ?? {}).length > 0;
}

export function hasMeaningfulNoteContent(
	note: Pick<Note, 'title' | 'content' | 'tags' | 'frontmatter'>,
): boolean {
	if (note.content.trim().length > 0) return true;
	if (note.tags.length > 0) return true;
	if (hasCustomFrontmatter(note)) return true;

	const title = note.title.trim().toLowerCase();
	return title.length > 0 && title !== DEFAULT_UNTITLED_TITLE;
}
