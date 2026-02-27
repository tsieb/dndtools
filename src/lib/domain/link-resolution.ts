import { createNoteId, type NoteId } from '$lib/types/note.js';

export interface LinkResolutionEntry {
	id: string;
	title: string;
	updatedAt: string;
	aliases?: string[];
}

export interface LinkResolutionCandidate {
	id: string;
	title: string;
	updatedAt: string;
	matchedBy: 'title' | 'alias';
}

function normalizeLabel(value: string): string {
	return value.trim().toLowerCase();
}

function updatedAtScore(value: string): number {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function compareCandidates(a: LinkResolutionCandidate, b: LinkResolutionCandidate): number {
	if (a.matchedBy !== b.matchedBy) {
		return a.matchedBy === 'title' ? -1 : 1;
	}
	const updatedDiff = updatedAtScore(b.updatedAt) - updatedAtScore(a.updatedAt);
	if (updatedDiff !== 0) return updatedDiff;
	const titleDiff = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
	if (titleDiff !== 0) return titleDiff;
	return a.id.localeCompare(b.id);
}

export function extractAliasesFromFrontmatter(frontmatter: unknown): string[] {
	if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
		return [];
	}
	const raw = (frontmatter as Record<string, unknown>)['aliases'];
	const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
	const deduped = new Set<string>();
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const normalized = value.trim();
		if (!normalized) continue;
		deduped.add(normalized);
	}
	return [...deduped];
}

export function resolveLinkCandidates(
	label: string,
	entries: LinkResolutionEntry[],
): LinkResolutionCandidate[] {
	const normalized = normalizeLabel(label);
	if (!normalized) return [];

	const byId = new Map<string, LinkResolutionCandidate>();
	for (const entry of entries) {
		const titleMatch = normalizeLabel(entry.title) === normalized;
		const aliasMatch = (entry.aliases ?? []).some((alias) => normalizeLabel(alias) === normalized);
		if (!titleMatch && !aliasMatch) continue;

		const candidate: LinkResolutionCandidate = {
			id: entry.id,
			title: entry.title,
			updatedAt: entry.updatedAt,
			matchedBy: titleMatch ? 'title' : 'alias',
		};
		const existing = byId.get(entry.id);
		if (!existing || compareCandidates(candidate, existing) < 0) {
			byId.set(entry.id, candidate);
		}
	}

	return [...byId.values()].sort(compareCandidates);
}

export function resolveLinkTargetId(label: string, entries: LinkResolutionEntry[]): NoteId | null {
	const best = resolveLinkCandidates(label, entries)[0];
	return best ? createNoteId(best.id) : null;
}
