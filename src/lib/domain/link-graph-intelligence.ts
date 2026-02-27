import { extractWikilinks } from '$lib/domain/link-extractor.js';
import type { Note, NoteId } from '$lib/types/note.js';

export interface DeadLinkInsight {
	sourceId: NoteId;
	sourceTitle: string;
	targetLabel: string;
	count: number;
}

export interface HighCentralityInsight {
	noteId: NoteId;
	title: string;
	inbound: number;
	outbound: number;
	degree: number;
}

export interface LinkGraphQualityReport {
	orphanNoteIds: NoteId[];
	deadLinks: DeadLinkInsight[];
	highCentrality: HighCentralityInsight[];
}

export function buildLinkGraphQualityReport(input: {
	notes: Note[];
	resolveTitle: (title: string) => NoteId | null;
	highCentralityLimit?: number;
}): LinkGraphQualityReport {
	const limit = input.highCentralityLimit ?? 8;
	const active = input.notes.filter((note) => !note.deleted);
	const activeIdSet = new Set(active.map((note) => String(note.id)));
	const inbound = new Map<string, number>();
	const outbound = new Map<string, number>();
	for (const note of active) {
		inbound.set(String(note.id), 0);
		outbound.set(String(note.id), 0);
	}

	const seenEdges = new Set<string>();
	const deadBySourceAndTarget = new Map<string, DeadLinkInsight>();

	for (const source of active) {
		for (const link of extractWikilinks(source.content)) {
			const targetId = link.targetIdHint
				? activeIdSet.has(link.targetIdHint)
					? (link.targetIdHint as NoteId)
					: null
				: input.resolveTitle(link.title);
			if (!targetId || !activeIdSet.has(String(targetId))) {
				const deadKey = `${source.id}::${link.title}`;
				const existing = deadBySourceAndTarget.get(deadKey);
				if (existing) {
					existing.count += 1;
				} else {
					deadBySourceAndTarget.set(deadKey, {
						sourceId: source.id,
						sourceTitle: source.title,
						targetLabel: link.title,
						count: 1,
					});
				}
				continue;
			}

			const edgeKey = `${source.id}->${targetId}`;
			if (seenEdges.has(edgeKey)) continue;
			seenEdges.add(edgeKey);
			outbound.set(String(source.id), (outbound.get(String(source.id)) ?? 0) + 1);
			inbound.set(String(targetId), (inbound.get(String(targetId)) ?? 0) + 1);
		}
	}

	const orphanNoteIds = active
		.filter(
			(note) => (inbound.get(String(note.id)) ?? 0) + (outbound.get(String(note.id)) ?? 0) === 0,
		)
		.map((note) => note.id)
		.sort((a, b) => String(a).localeCompare(String(b)));

	const deadLinks = [...deadBySourceAndTarget.values()].sort((a, b) => {
		if (a.count !== b.count) return b.count - a.count;
		const sourceDiff = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
			sensitivity: 'base',
		});
		if (sourceDiff !== 0) return sourceDiff;
		return a.targetLabel.localeCompare(b.targetLabel, undefined, { sensitivity: 'base' });
	});

	const highCentrality = active
		.map((note) => {
			const noteId = String(note.id);
			const inDegree = inbound.get(noteId) ?? 0;
			const outDegree = outbound.get(noteId) ?? 0;
			return {
				noteId: note.id,
				title: note.title,
				inbound: inDegree,
				outbound: outDegree,
				degree: inDegree + outDegree,
			};
		})
		.filter((entry) => entry.degree > 0)
		.sort((a, b) => {
			if (a.degree !== b.degree) return b.degree - a.degree;
			if (a.inbound !== b.inbound) return b.inbound - a.inbound;
			if (a.outbound !== b.outbound) return b.outbound - a.outbound;
			return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
		})
		.slice(0, limit);

	return {
		orphanNoteIds,
		deadLinks,
		highCentrality,
	};
}
