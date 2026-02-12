import type { PageLoad } from './$types';
import { createNoteId, type NoteId } from '$lib/types/note.js';

export const load: PageLoad = ({ params }) => {
	return {
		noteId: createNoteId(params.id) as NoteId,
	};
};
