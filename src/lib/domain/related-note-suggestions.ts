import type { Link, Note, NoteId } from '$lib/types/note.js';
import type { RelatedNoteSuggestion } from '$lib/types/session-board.js';

interface SuggestionAccumulator {
	score: number;
	linkedTo: Set<NoteId>;
	sharedTags: Set<string>;
}

interface BuildSuggestionInput {
	notes: Note[];
	links: Pick<Link, 'sourceId' | 'targetId'>[];
	selectedNoteIds: NoteId[];
	limit?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildRelatedNoteSuggestions({
	notes,
	links,
	selectedNoteIds,
	limit = 8,
}: BuildSuggestionInput): RelatedNoteSuggestion[] {
	if (selectedNoteIds.length === 0 || limit <= 0) {
		return [];
	}

	const activeNotes = notes.filter((note) => !note.deleted);
	const noteById = new Map<NoteId, Note>(activeNotes.map((note) => [note.id, note]));
	const selectedSet = new Set<NoteId>(selectedNoteIds.filter((id) => noteById.has(id)));
	if (selectedSet.size === 0) {
		return [];
	}

	const selectedTagsByNote = new Map<NoteId, Set<string>>();
	for (const selectedId of selectedSet) {
		const selected = noteById.get(selectedId);
		if (!selected) continue;
		selectedTagsByNote.set(selectedId, new Set(selected.tags));
	}

	const suggestions = new Map<NoteId, SuggestionAccumulator>();

	const ensureSuggestion = (id: NoteId): SuggestionAccumulator => {
		let bucket = suggestions.get(id);
		if (!bucket) {
			bucket = {
				score: 0,
				linkedTo: new Set<NoteId>(),
				sharedTags: new Set<string>(),
			};
			suggestions.set(id, bucket);
		}
		return bucket;
	};

	for (const link of links) {
		const sourceSelected = selectedSet.has(link.sourceId);
		const targetSelected = selectedSet.has(link.targetId);

		if (sourceSelected && !targetSelected && noteById.has(link.targetId)) {
			const bucket = ensureSuggestion(link.targetId);
			bucket.score += 5;
			bucket.linkedTo.add(link.sourceId);
		}

		if (targetSelected && !sourceSelected && noteById.has(link.sourceId)) {
			const bucket = ensureSuggestion(link.sourceId);
			bucket.score += 4;
			bucket.linkedTo.add(link.targetId);
		}
	}

	for (const note of activeNotes) {
		if (selectedSet.has(note.id)) continue;
		let overlapScore = 0;
		const overlapTags = new Set<string>();
		const relatedTo = new Set<NoteId>();

		for (const [selectedId, selectedTags] of selectedTagsByNote.entries()) {
			let overlapCount = 0;
			for (const tag of note.tags) {
				if (selectedTags.has(tag)) {
					overlapCount += 1;
					overlapTags.add(tag);
				}
			}
			if (overlapCount > 0) {
				overlapScore += overlapCount * 2;
				relatedTo.add(selectedId);
			}
		}

		if (overlapScore > 0) {
			const bucket = ensureSuggestion(note.id);
			bucket.score += overlapScore;
			for (const tag of overlapTags) bucket.sharedTags.add(tag);
			for (const selectedId of relatedTo) bucket.linkedTo.add(selectedId);
		}
	}

	const nowTs = Date.now();
	const results: RelatedNoteSuggestion[] = [];
	for (const [noteId, bucket] of suggestions.entries()) {
		const note = noteById.get(noteId);
		if (!note) continue;

		const updatedTs = Date.parse(note.updatedAt);
		if (Number.isFinite(updatedTs)) {
			const ageDays = (nowTs - updatedTs) / DAY_MS;
			if (ageDays <= 7) bucket.score += 1.5;
			else if (ageDays <= 30) bucket.score += 0.5;
		}

		results.push({
			noteId,
			score: Number(bucket.score.toFixed(2)),
			linkedTo: [...bucket.linkedTo],
			sharedTags: [...bucket.sharedTags].sort((a, b) => a.localeCompare(b)),
		});
	}

	return results
		.sort((a, b) => b.score - a.score || String(a.noteId).localeCompare(String(b.noteId)))
		.slice(0, limit);
}
