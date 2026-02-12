import Dexie, { type Table } from 'dexie';
import type { NoteId, Link } from '$lib/types/note.js';
import type { SettingRecord } from '$lib/types/settings.js';

/** Internal note shape stored in IndexedDB (deleted as number for indexing) */
export interface StoredNote {
	id: string;
	title: string;
	content: string;
	folder: string;
	tags: string[];
	frontmatter: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	deleted: number; // 0 or 1 — IndexedDB can't index booleans
	deletedAt: string | null;
}

/** Internal link shape stored in IndexedDB */
export interface StoredLink {
	sourceId: string;
	targetId: string;
	displayText: string;
	position: number;
}

export class DndToolsDB extends Dexie {
	notes!: Table<StoredNote, string>;
	links!: Table<StoredLink, [string, string]>;
	settings!: Table<SettingRecord, string>;

	constructor() {
		super('dndtools');
		this.version(1).stores({
			notes: 'id, title, folder, updatedAt, deleted, *tags',
			links: '[sourceId+targetId], sourceId, targetId',
			settings: 'key',
		});
	}
}

export const db = new DndToolsDB();
