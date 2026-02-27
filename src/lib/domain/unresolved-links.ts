import { extractWikilinks } from '$lib/domain/link-extractor.js';
import type { Note } from '$lib/types/note.js';

export interface UnresolvedLinkEntry {
	title: string;
	count: number;
	positions: number[];
	suggestions: string[];
}

function uniqueTitles(notes: Note[]): Set<string> {
	return new Set(notes.map((note) => note.title.toLowerCase()));
}

export function findUnresolvedLinks(content: string, notes: Note[]): UnresolvedLinkEntry[] {
	const knownTitles = uniqueTitles(notes);
	const suggestions = notes.map((note) => note.title);
	const unresolved = new Map<string, UnresolvedLinkEntry>();

	for (const link of extractWikilinks(content)) {
		if (knownTitles.has(link.title.toLowerCase())) continue;
		const existing = unresolved.get(link.title);
		const nextSuggestions = suggestions
			.filter((candidate) => candidate.toLowerCase().includes(link.title.toLowerCase()))
			.slice(0, 5);
		if (!existing) {
			unresolved.set(link.title, {
				title: link.title,
				count: 1,
				positions: [link.position],
				suggestions: nextSuggestions,
			});
			continue;
		}
		existing.count += 1;
		existing.positions.push(link.position);
	}

	return Array.from(unresolved.values()).sort((a, b) => b.count - a.count);
}

export function renameWikilinkTarget(content: string, fromTitle: string, toTitle: string): string {
	if (!fromTitle.trim() || !toTitle.trim() || fromTitle === toTitle) return content;
	const escaped = fromTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, 'g');
	return content.replace(pattern, (match, display) => `[[${toTitle}${display ?? ''}]]`);
}
