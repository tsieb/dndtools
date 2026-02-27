import { extractWikilinks } from '$lib/domain/link-extractor.js';
import type { NoteId } from '$lib/types/note.js';

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function buildContextSnippetAtPosition(
	content: string,
	position: number,
	radius = 72,
): string {
	const start = Math.max(0, position - radius);
	const end = Math.min(content.length, position + radius);
	const snippet = collapseWhitespace(content.slice(start, end));
	const prefix = start > 0 ? '... ' : '';
	const suffix = end < content.length ? ' ...' : '';
	return `${prefix}${snippet}${suffix}`.trim();
}

export function findBacklinkContextSnippet(input: {
	sourceContent: string;
	targetId: NoteId;
	resolveTitle: (title: string) => NoteId | null;
}): string | null {
	const { sourceContent, targetId, resolveTitle } = input;
	const target = String(targetId);
	for (const link of extractWikilinks(sourceContent)) {
		const resolved = link.targetIdHint ?? resolveTitle(link.title);
		if (!resolved || String(resolved) !== target) continue;
		return buildContextSnippetAtPosition(sourceContent, link.position);
	}
	return null;
}
