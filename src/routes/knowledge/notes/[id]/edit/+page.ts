import type { PageLoad } from './$types';
import { createNoteId, type NoteId } from '$lib/types/note.js';
import type { BreadcrumbItem } from '$lib/types/breadcrumb.js';

export const load: PageLoad = ({ params }) => {
	const id = decodeURIComponent(params.id);
	const breadcrumb: BreadcrumbItem[] = [
		{ label: 'Knowledge', href: '/knowledge' },
		{ label: 'Notes', href: '/knowledge/notes' },
		{ label: `Note ${id}`, href: `/knowledge/notes/${encodeURIComponent(id)}` },
		{ label: 'Edit', href: null },
	];
	return {
		noteId: createNoteId(params.id) as NoteId,
		breadcrumb,
	};
};
