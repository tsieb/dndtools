import type { Note, NoteId } from '$lib/types/note.js';
import { extractObjectEmbeds } from '$lib/domain/object-embeds.js';

export interface RelatedNoteJump {
	noteId: NoteId;
	title: string;
	reason: string;
}

export interface RelatedNoteJumpSet {
	sameTags: RelatedNoteJump[];
	backlinks: RelatedNoteJump[];
	sameObjectReferences: RelatedNoteJump[];
}

interface BuildRelatedNoteJumpInput {
	note: Note;
	notes: Note[];
	backlinkIds: NoteId[];
	limitPerSection?: number;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
	let count = 0;
	for (const value of a) {
		if (b.has(value)) count += 1;
	}
	return count;
}

function collectObjectRefIds(note: Note): Set<string> {
	return new Set(extractObjectEmbeds(note.content).map((embed) => String(embed.id)));
}

export function buildRelatedNoteJumps({
	note,
	notes,
	backlinkIds,
	limitPerSection = 6,
}: BuildRelatedNoteJumpInput): RelatedNoteJumpSet {
	if (limitPerSection <= 0) {
		return { sameTags: [], backlinks: [], sameObjectReferences: [] };
	}

	const activeNotes = notes.filter((entry) => !entry.deleted && entry.id !== note.id);
	const noteById = new Map<NoteId, Note>(activeNotes.map((entry) => [entry.id, entry]));
	const noteTagSet = new Set(note.tags);
	const noteObjectRefIds = collectObjectRefIds(note);

	const sameTags = activeNotes
		.map((candidate) => {
			const overlap = sharedCount(noteTagSet, new Set(candidate.tags));
			if (overlap === 0) return null;
			return {
				noteId: candidate.id,
				title: candidate.title,
				overlap,
				reason: `${overlap} shared ${overlap === 1 ? 'tag' : 'tags'}`,
			};
		})
		.filter((entry): entry is RelatedNoteJump & { overlap: number } => !!entry)
		.sort((a, b) => b.overlap - a.overlap || a.title.localeCompare(b.title))
		.slice(0, limitPerSection)
		.map(({ noteId, title, reason }) => ({ noteId, title, reason }));

	const backlinks = backlinkIds
		.map((id) => noteById.get(id))
		.filter((entry): entry is Note => !!entry)
		.sort((a, b) => a.title.localeCompare(b.title))
		.slice(0, limitPerSection)
		.map((entry) => ({
			noteId: entry.id,
			title: entry.title,
			reason: 'Links to this note',
		}));

	const sameObjectReferences = activeNotes
		.map((candidate) => {
			const overlap = sharedCount(noteObjectRefIds, collectObjectRefIds(candidate));
			if (overlap === 0) return null;
			return {
				noteId: candidate.id,
				title: candidate.title,
				overlap,
				reason: `${overlap} shared object ${overlap === 1 ? 'reference' : 'references'}`,
			};
		})
		.filter((entry): entry is RelatedNoteJump & { overlap: number } => !!entry)
		.sort((a, b) => b.overlap - a.overlap || a.title.localeCompare(b.title))
		.slice(0, limitPerSection)
		.map(({ noteId, title, reason }) => ({ noteId, title, reason }));

	return { sameTags, backlinks, sameObjectReferences };
}
