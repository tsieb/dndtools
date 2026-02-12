import type { Note, NoteId, FolderId, Link, TagEntry } from '$lib/types/note.js';
import { createNoteId, createFolderId } from '$lib/types/note.js';
import type { AppSettings } from '$lib/types/settings.js';
import { DEFAULT_SETTINGS } from '$lib/types/settings.js';
import type { StorageAdapter, ImportResult } from '$lib/types/storage.js';
import { nowISO } from '$lib/utils/date.js';
import { db, type StoredNote, type StoredLink, type DndToolsDB } from './database.js';

function noteToStored(note: Note): StoredNote {
	return {
		id: note.id,
		title: note.title,
		content: note.content,
		folder: note.folder,
		tags: [...note.tags],
		frontmatter: { ...note.frontmatter },
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		deleted: note.deleted ? 1 : 0,
		deletedAt: note.deletedAt,
	};
}

function storedToNote(stored: StoredNote): Note {
	return {
		id: createNoteId(stored.id),
		title: stored.title,
		content: stored.content,
		folder: createFolderId(stored.folder),
		tags: [...stored.tags],
		frontmatter: { ...stored.frontmatter },
		createdAt: stored.createdAt,
		updatedAt: stored.updatedAt,
		deleted: stored.deleted === 1,
		deletedAt: stored.deletedAt,
	};
}

function linkToStored(link: Link): StoredLink {
	return {
		sourceId: link.sourceId,
		targetId: link.targetId,
		displayText: link.displayText,
		position: link.position,
	};
}

function storedToLink(stored: StoredLink): Link {
	return {
		sourceId: createNoteId(stored.sourceId),
		targetId: createNoteId(stored.targetId),
		displayText: stored.displayText,
		position: stored.position,
	};
}

export class IndexedDBAdapter implements StorageAdapter {
	private database: DndToolsDB;

	constructor(database?: DndToolsDB) {
		this.database = database ?? db;
	}

	async initialize(): Promise<void> {
		await this.database.open();
	}

	async close(): Promise<void> {
		this.database.close();
	}

	async getNote(id: NoteId): Promise<Note | null> {
		const stored = await this.database.notes.get(id);
		return stored ? storedToNote(stored) : null;
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		let notes: StoredNote[];
		if (options?.includeDeleted) {
			notes = await this.database.notes.toArray();
		} else {
			notes = await this.database.notes.where('deleted').equals(0).toArray();
		}
		return notes.map(storedToNote);
	}

	async saveNote(note: Note): Promise<void> {
		await this.database.notes.put(noteToStored(note));
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		if (permanent) {
			await this.database.transaction('rw', [this.database.notes, this.database.links], async () => {
				await this.database.notes.delete(id);
				await this.database.links.where('sourceId').equals(id).delete();
				await this.database.links.where('targetId').equals(id).delete();
			});
		} else {
			await this.database.notes.update(id, {
				deleted: 1,
				deletedAt: nowISO(),
				updatedAt: nowISO(),
			});
		}
	}

	async restoreNote(id: NoteId): Promise<void> {
		await this.database.notes.update(id, {
			deleted: 0,
			deletedAt: null,
			updatedAt: nowISO(),
		});
	}

	async getNotesByFolder(folder: FolderId): Promise<Note[]> {
		const notes = await this.database.notes
			.where('folder')
			.equals(folder)
			.toArray();
		return notes.filter((n) => n.deleted === 0).map(storedToNote);
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		const notes = await this.database.notes
			.where('tags')
			.equals(tag)
			.toArray();
		return notes.filter((n) => n.deleted === 0).map(storedToNote);
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		const notes = await this.database.notes
			.where('deleted')
			.equals(0)
			.reverse()
			.sortBy('updatedAt');
		return notes.slice(0, limit).map(storedToNote);
	}

	async getDeletedNotes(): Promise<Note[]> {
		const notes = await this.database.notes
			.where('deleted')
			.equals(1)
			.toArray();
		return notes.map(storedToNote);
	}

	async resolveTitle(title: string): Promise<Note | null> {
		const lowerTitle = title.toLowerCase();
		const notes = await this.database.notes
			.where('deleted')
			.equals(0)
			.toArray();
		const match = notes.find((n) => n.title.toLowerCase() === lowerTitle);
		return match ? storedToNote(match) : null;
	}

	async getLinksFrom(noteId: NoteId): Promise<Link[]> {
		const links = await this.database.links
			.where('sourceId')
			.equals(noteId)
			.toArray();
		return links.map(storedToLink);
	}

	async getLinksTo(noteId: NoteId): Promise<Link[]> {
		const links = await this.database.links
			.where('targetId')
			.equals(noteId)
			.toArray();
		return links.map(storedToLink);
	}

	async setLinksFrom(noteId: NoteId, links: Link[]): Promise<void> {
		await this.database.transaction('rw', this.database.links, async () => {
			await this.database.links.where('sourceId').equals(noteId).delete();
			if (links.length > 0) {
				await this.database.links.bulkAdd(links.map(linkToStored));
			}
		});
	}

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		const record = await this.database.settings.get(key);
		if (record) {
			return record.value as AppSettings[K];
		}
		return DEFAULT_SETTINGS[key];
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		await this.database.settings.put({ key, value });
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		let imported = 0;
		let skipped = 0;
		const errors: string[] = [];

		for (const note of notes) {
			try {
				const existing = await this.database.notes.get(note.id);
				if (existing) {
					skipped++;
				} else {
					await this.database.notes.put(noteToStored(note));
					imported++;
				}
			} catch (e) {
				errors.push(`Failed to import "${note.title}": ${String(e)}`);
			}
		}

		return { imported, skipped, errors };
	}

	async exportAllNotes(): Promise<Note[]> {
		const notes = await this.database.notes
			.where('deleted')
			.equals(0)
			.toArray();
		return notes.map(storedToNote);
	}

	async getNoteCount(): Promise<number> {
		return this.database.notes.where('deleted').equals(0).count();
	}

	async getTagCounts(): Promise<TagEntry[]> {
		const notes = await this.database.notes
			.where('deleted')
			.equals(0)
			.toArray();

		const tagMap = new Map<string, number>();
		for (const note of notes) {
			for (const tag of note.tags) {
				tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
			}
		}

		return Array.from(tagMap.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count);
	}
}
