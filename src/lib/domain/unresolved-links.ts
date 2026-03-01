import { buildContextSnippetAtPosition } from '$lib/domain/backlink-context.js';
import { extractWikilinks } from '$lib/domain/link-extractor.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	type LinkResolutionEntry,
} from '$lib/domain/link-resolution.js';
import type { Note, NoteId } from '$lib/types/note.js';

export interface LinkCandidateSuggestion {
	noteId: NoteId;
	title: string;
	folder: string;
	matchedBy: 'title' | 'alias';
	matchedAlias?: string | null;
}

export interface UnresolvedLinkEntry {
	title: string;
	targetKind: 'title' | 'id';
	targetIdHint?: string;
	count: number;
	positions: number[];
	ranges: Array<{ from: number; to: number }>;
	suggestions: LinkCandidateSuggestion[];
}

export interface AmbiguousLinkEntry {
	title: string;
	count: number;
	positions: number[];
	ranges: Array<{ from: number; to: number }>;
	candidates: LinkCandidateSuggestion[];
}

export interface LinkIssueReport {
	unresolved: UnresolvedLinkEntry[];
	ambiguous: AmbiguousLinkEntry[];
}

export interface VaultUnresolvedLinkIssue {
	sourceId: NoteId;
	sourceTitle: string;
	sourceFolder: string;
	targetLabel: string;
	targetKind: 'title' | 'id';
	targetIdHint?: string;
	count: number;
	contexts: string[];
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function buildResolutionEntries(notes: Note[]): LinkResolutionEntry[] {
	return notes
		.filter((note) => !note.deleted)
		.map((note) => ({
			id: String(note.id),
			title: note.title,
			updatedAt: note.updatedAt,
			aliases: extractAliasesFromFrontmatter(note.frontmatter),
			folder: String(note.folder),
		}));
}

function collectSuggestions(
	label: string,
	entries: LinkResolutionEntry[],
): LinkCandidateSuggestion[] {
	const normalized = normalize(label);
	if (!normalized) return [];

	const suggestions = new Map<string, LinkCandidateSuggestion>();
	for (const entry of entries) {
		const titleMatch = normalize(entry.title).includes(normalized);
		if (titleMatch) {
			suggestions.set(entry.id, {
				noteId: entry.id as NoteId,
				title: entry.title,
				folder: entry.folder ?? '/',
				matchedBy: 'title',
				matchedAlias: null,
			});
			continue;
		}

		const aliasMatch = (entry.aliases ?? []).find((alias) => normalize(alias).includes(normalized));
		if (!aliasMatch) continue;
		suggestions.set(entry.id, {
			noteId: entry.id as NoteId,
			title: entry.title,
			folder: entry.folder ?? '/',
			matchedBy: 'alias',
			matchedAlias: aliasMatch,
		});
	}

	return [...suggestions.values()]
		.sort((a, b) => {
			if (a.matchedBy !== b.matchedBy) return a.matchedBy === 'title' ? -1 : 1;
			const titleDiff = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
			if (titleDiff !== 0) return titleDiff;
			return String(a.noteId).localeCompare(String(b.noteId));
		})
		.slice(0, 6);
}

function appendRange(
	entry:
		| Pick<UnresolvedLinkEntry, 'positions' | 'ranges'>
		| Pick<AmbiguousLinkEntry, 'positions' | 'ranges'>,
	position: number,
	length: number,
): void {
	entry.positions.push(position);
	entry.ranges.push({ from: position, to: position + length });
}

function toCandidateSuggestion(
	candidate: ReturnType<typeof resolveLinkCandidates>[number],
): LinkCandidateSuggestion {
	return {
		noteId: candidate.id as NoteId,
		title: candidate.title,
		folder: candidate.folder ?? '/',
		matchedBy: candidate.matchedBy,
		matchedAlias: candidate.matchedAlias ?? null,
	};
}

export function analyzeLinkIssues(content: string, notes: Note[]): LinkIssueReport {
	const activeNotes = notes.filter((note) => !note.deleted);
	const idSet = new Set(activeNotes.map((note) => String(note.id)));
	const entries = buildResolutionEntries(activeNotes);
	const unresolved = new Map<string, UnresolvedLinkEntry>();
	const ambiguous = new Map<string, AmbiguousLinkEntry>();

	for (const link of extractWikilinks(content)) {
		if (link.targetIdHint) {
			if (idSet.has(link.targetIdHint)) continue;
			const key = `id:${link.targetIdHint}`;
			const existing = unresolved.get(key);
			if (existing) {
				existing.count += 1;
				appendRange(existing, link.position, link.length);
				continue;
			}
			unresolved.set(key, {
				title: link.displayText,
				targetKind: 'id',
				targetIdHint: link.targetIdHint,
				count: 1,
				positions: [link.position],
				ranges: [{ from: link.position, to: link.position + link.length }],
				suggestions: [],
			});
			continue;
		}

		const candidates = resolveLinkCandidates(link.title, entries);
		if (candidates.length === 1) continue;

		if (candidates.length === 0) {
			const key = `title:${normalize(link.title)}`;
			const existing = unresolved.get(key);
			if (existing) {
				existing.count += 1;
				appendRange(existing, link.position, link.length);
				continue;
			}
			unresolved.set(key, {
				title: link.title,
				targetKind: 'title',
				count: 1,
				positions: [link.position],
				ranges: [{ from: link.position, to: link.position + link.length }],
				suggestions: collectSuggestions(link.title, entries),
			});
			continue;
		}

		const key = `ambiguous:${normalize(link.title)}`;
		const existing = ambiguous.get(key);
		if (existing) {
			existing.count += 1;
			appendRange(existing, link.position, link.length);
			continue;
		}
		ambiguous.set(key, {
			title: link.title,
			count: 1,
			positions: [link.position],
			ranges: [{ from: link.position, to: link.position + link.length }],
			candidates: candidates.map((candidate) => toCandidateSuggestion(candidate)),
		});
	}

	return {
		unresolved: [...unresolved.values()].sort(
			(a, b) => b.count - a.count || a.title.localeCompare(b.title),
		),
		ambiguous: [...ambiguous.values()].sort(
			(a, b) => b.count - a.count || a.title.localeCompare(b.title),
		),
	};
}

export function findUnresolvedLinks(content: string, notes: Note[]): UnresolvedLinkEntry[] {
	return analyzeLinkIssues(content, notes).unresolved;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDisplayText(value: string): string {
	const collapsed = value.replace(/\s+/g, ' ').trim();
	return collapsed || 'Linked Note';
}

export function renameWikilinkTarget(content: string, fromTitle: string, toTitle: string): string {
	if (!fromTitle.trim() || !toTitle.trim() || fromTitle === toTitle) return content;
	const escaped = escapeRegExp(fromTitle);
	const pattern = new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, 'g');
	return content.replace(pattern, (match, display) => `[[${toTitle}${display ?? ''}]]`);
}

export function disambiguateWikilinkTarget(
	content: string,
	fromTitle: string,
	targetId: string,
	displayTitle: string,
): string {
	if (!fromTitle.trim() || !targetId.trim()) return content;
	const escaped = escapeRegExp(fromTitle);
	const pattern = new RegExp(`\\[\\[${escaped}(?:\\|([^\\]]+))?\\]\\]`, 'g');
	return content.replace(pattern, (_match, display) => {
		const displayText = normalizeDisplayText(
			typeof display === 'string' && display.trim().length > 0 ? display : displayTitle,
		);
		return `[[note:${targetId}|${displayText}]]`;
	});
}

export function buildVaultUnresolvedLinkReport(notes: Note[]): VaultUnresolvedLinkIssue[] {
	const activeNotes = notes.filter((note) => !note.deleted);
	const issues = new Map<string, VaultUnresolvedLinkIssue>();

	for (const note of activeNotes) {
		const report = analyzeLinkIssues(note.content, activeNotes);
		for (const unresolved of report.unresolved) {
			const key = `${note.id}::${unresolved.targetKind}::${unresolved.targetIdHint ?? unresolved.title.toLowerCase()}`;
			const existing = issues.get(key);
			const contexts = unresolved.positions
				.slice(0, 3)
				.map((position) => buildContextSnippetAtPosition(note.content, position));

			if (existing) {
				existing.count += unresolved.count;
				existing.contexts = [...new Set([...existing.contexts, ...contexts])].slice(0, 3);
				continue;
			}

			issues.set(key, {
				sourceId: note.id,
				sourceTitle: note.title,
				sourceFolder: String(note.folder),
				targetLabel: unresolved.title,
				targetKind: unresolved.targetKind,
				targetIdHint: unresolved.targetIdHint,
				count: unresolved.count,
				contexts,
			});
		}
	}

	return [...issues.values()].sort((a, b) => {
		if (a.count !== b.count) return b.count - a.count;
		const sourceDiff = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
			sensitivity: 'base',
		});
		if (sourceDiff !== 0) return sourceDiff;
		return a.targetLabel.localeCompare(b.targetLabel, undefined, { sensitivity: 'base' });
	});
}
