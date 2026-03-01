import type { Note, NoteId, Link } from '$lib/types/note.js';
import { SvelteMap } from 'svelte/reactivity';
import { createNoteId } from '$lib/types/note.js';
import { getStorage } from '$lib/platform/storage/index.js';
import { createNewNote } from '$lib/utils/note-factory.js';
import { nowISO } from '$lib/utils/date.js';
import { extractFrontmatter, extractTags, extractTitle } from '$lib/markdown/frontmatter.js';
import { searchService } from '$lib/domain/search.js';
import { extractWikilinks } from '$lib/domain/link-extractor.js';
import { hasMeaningfulNoteContent } from '$lib/domain/note-persistence.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	resolveUniqueLinkTargetId,
	resolveLinkTargetId,
	type LinkResolutionCandidate,
	type LinkResolutionEntry,
} from '$lib/domain/link-resolution.js';
import { linksState } from './links.svelte.js';
import { recordPerformanceMeasurement } from '$lib/runtime/diagnostics.js';

class NotesState {
	notes = $state<Note[]>([]);
	activeNoteId = $state<NoteId | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	private draftNoteIds = new Set<NoteId>();
	private linkSyncRevision = new Map<string, string>();
	private saveMeasureCounter = 0;

	noteById = $derived.by(() => {
		const map = new SvelteMap<NoteId, Note>();
		for (const note of this.notes) {
			map.set(note.id, note);
		}
		return map;
	});

	activeNotes = $derived(
		this.notes.filter(
			(n) => !n.deleted && (!this.draftNoteIds.has(n.id) || hasMeaningfulNoteContent(n)),
		),
	);

	activeNoteById = $derived.by(() => {
		const map = new SvelteMap<NoteId, Note>();
		for (const note of this.activeNotes) {
			map.set(note.id, note);
		}
		return map;
	});

	private linkResolutionEntries = $derived.by<LinkResolutionEntry[]>(() =>
		this.activeNotes.map((note) => ({
			id: String(note.id),
			title: note.title,
			updatedAt: note.updatedAt,
			aliases: extractAliasesFromFrontmatter(note.frontmatter),
		})),
	);

	activeNote = $derived<Note | null>(
		this.activeNoteId ? (this.activeNoteById.get(this.activeNoteId) ?? null) : null,
	);

	pinnedNotes = $derived(
		[...this.activeNotes]
			.filter((n) => n.pinned)
			.sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? '')),
	);

	deletedNotes = $derived(this.notes.filter((n) => n.deleted));

	private setNoteById(updated: Note): void {
		const index = this.notes.findIndex((n) => n.id === updated.id);
		if (index < 0) return;
		const next = [...this.notes];
		next[index] = updated;
		this.notes = next;
	}

	private async syncNoteLinks(note: Note): Promise<void> {
		const storage = getStorage();
		if (note.deleted) {
			await storage.setLinksFrom(note.id, []);
			linksState.removeNote(note.id);
			this.linkSyncRevision.delete(String(note.id));
			return;
		}

		const links: Link[] = extractWikilinks(note.content)
			.map((link): Link | null => {
				if (link.targetIdHint) {
					const targetId = createNoteId(link.targetIdHint);
					if (!this.activeNoteById.get(targetId)) return null;
					return {
						sourceId: note.id,
						targetId,
						displayText: link.displayText,
						position: link.position,
						resolvedBy: 'id' as const,
						resolvedAlias: null,
					};
				}

				const candidates = this.resolveTitleCandidates(link.title);
				if (candidates.length !== 1) return null;
				const winner = candidates[0]!;
				return {
					sourceId: note.id,
					targetId: createNoteId(winner.id),
					displayText: link.displayText,
					position: link.position,
					resolvedBy: winner.matchedBy,
					resolvedAlias: winner.matchedAlias ?? null,
				};
			})
			.filter((entry): entry is Link => !!entry);

		await storage.setLinksFrom(note.id, links);
		linksState.updateNoteLinks(
			note.id,
			links.map((link) => link.targetId),
		);
		this.linkSyncRevision.set(String(note.id), note.updatedAt);
	}

	private async syncLinksFromStorageSnapshot(): Promise<void> {
		const storage = getStorage();
		const active = [...this.activeNotes];
		const activeIdSet = new Set(active.map((note) => String(note.id)));

		linksState.syncNotes(active.map((note) => note.id));
		for (const id of [...this.linkSyncRevision.keys()]) {
			if (!activeIdSet.has(id)) {
				this.linkSyncRevision.delete(id);
				linksState.removeNote(createNoteId(id));
			}
		}

		const changed = active.filter(
			(note) => this.linkSyncRevision.get(String(note.id)) !== note.updatedAt,
		);
		if (changed.length === 0) return;

		const perNoteLinks = await Promise.all(
			changed.map(async (note) => ({
				id: note.id,
				updatedAt: note.updatedAt,
				links: await storage.getLinksFrom(note.id),
			})),
		);

		for (const entry of perNoteLinks) {
			linksState.updateNoteLinks(
				entry.id,
				entry.links.map((link) => link.targetId),
			);
			this.linkSyncRevision.set(String(entry.id), entry.updatedAt);
		}
	}

	getNoteById(id: NoteId): Note | null {
		return this.noteById.get(id) ?? null;
	}

	getActiveNoteById(id: NoteId): Note | null {
		return this.activeNoteById.get(id) ?? null;
	}

	async loadAll(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const storage = getStorage();
			this.notes = await storage.getAllNotes({ includeDeleted: true });
			this.draftNoteIds.clear();
			await this.syncLinksFromStorageSnapshot();
		} catch (e) {
			this.error = String(e);
		} finally {
			this.loading = false;
		}
	}

	async createNote(overrides?: Partial<Note>): Promise<Note> {
		const note = createNewNote(overrides);
		const shouldPersist = hasMeaningfulNoteContent(note);

		if (!shouldPersist) {
			this.draftNoteIds.add(note.id);
			this.notes = [...this.notes, note];
			return note;
		}

		const storage = getStorage();
		await storage.saveNote(note);
		const persisted = (await storage.getNote(note.id)) ?? note;
		this.notes = [...this.notes, persisted];
		searchService.addNote(persisted);
		await this.syncNoteLinks(persisted);
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
		return persisted;
	}

	async updateNote(id: NoteId, updates: Partial<Note>): Promise<void> {
		const storage = getStorage();
		const existing = this.noteById.get(id);
		if (!existing) return;
		const isDraft = this.draftNoteIds.has(id);

		// Parse frontmatter for metadata updates when content changes
		let parsedUpdates = { ...updates };
		if (updates.content !== undefined) {
			const { frontmatter } = extractFrontmatter(updates.content);
			const tags = extractTags(frontmatter, updates.content);
			const title = extractTitle(frontmatter, updates.content);
			parsedUpdates = {
				...parsedUpdates,
				tags,
				frontmatter,
				title: title !== 'Untitled' ? title : existing.title,
			};
		}

		const updated: Note = {
			...existing,
			...parsedUpdates,
			updatedAt: nowISO(),
		};

		if (isDraft && !hasMeaningfulNoteContent(updated)) {
			this.setNoteById(updated);
			return;
		}

		const measureId = `note-save-${Date.now()}-${this.saveMeasureCounter++}`;
		const startMark = `dndtools:${measureId}:start`;
		const endMark = `dndtools:${measureId}:end`;
		const measureName = `dndtools:${measureId}:measure`;
		const saveStartedAt = performance.now();
		performance.mark(startMark);
		await storage.saveNote(updated);
		performance.mark(endMark);
		performance.measure(measureName, startMark, endMark);
		const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
		const durationMs = Number(
			((measured?.duration ?? performance.now() - saveStartedAt) || 0).toFixed(2),
		);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		performance.clearMeasures(measureName);
		void recordPerformanceMeasurement({
			operation: 'note_save',
			durationMs,
			context: {
				contentChanged: updates.content !== undefined,
				titleChanged: updates.title !== undefined,
				folderChanged: updates.folder !== undefined,
				isDraft,
				contentLength: updated.content.length,
			},
		});
		const requiresStorageRefresh = updates.title !== undefined || updates.folder !== undefined;
		const persisted = requiresStorageRefresh ? ((await storage.getNote(id)) ?? updated) : updated;
		this.setNoteById(persisted);
		this.draftNoteIds.delete(id);
		searchService.addNote(persisted);
		if (updates.content !== undefined || persisted.deleted || isDraft) {
			// Link synchronization is intentionally asynchronous so save latency
			// reflects content persistence, not downstream graph recomputation.
			void this.syncNoteLinks(persisted);
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async deleteNote(id: NoteId): Promise<void> {
		if (this.draftNoteIds.has(id)) {
			this.draftNoteIds.delete(id);
			this.notes = this.notes.filter((n) => n.id !== id);
			if (this.activeNoteId === id) this.activeNoteId = null;
			return;
		}

		const storage = getStorage();
		await storage.deleteNote(id);
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const timestamp = nowISO();
			const next = [...this.notes];
			next[index] = {
				...next[index]!,
				deleted: true,
				deletedAt: timestamp,
				updatedAt: timestamp,
			};
			this.notes = next;
		}
		searchService.removeNote(id);
		linksState.removeNote(id);
		this.linkSyncRevision.delete(String(id));
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async restoreNote(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.restoreNote(id);
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const next = [...this.notes];
			next[index] = {
				...next[index]!,
				deleted: false,
				deletedAt: null,
				updatedAt: nowISO(),
			};
			this.notes = next;
			searchService.addNote(next[index]!);
			await this.syncNoteLinks(next[index]!);
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async permanentDelete(id: NoteId): Promise<void> {
		const storage = getStorage();
		await storage.deleteNote(id, true);
		this.draftNoteIds.delete(id);
		this.notes = this.notes.filter((n) => n.id !== id);
		searchService.removeNote(id);
		linksState.removeNote(id);
		this.linkSyncRevision.delete(String(id));
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async permanentDeleteMany(ids: NoteId[]): Promise<void> {
		if (ids.length === 0) return;
		const storage = getStorage();
		await Promise.all(ids.map((id) => storage.deleteNote(id, true)));
		const idSet = new Set(ids);
		for (const id of ids) this.draftNoteIds.delete(id);
		this.notes = this.notes.filter((n) => !idSet.has(n.id));
		for (const id of ids) {
			searchService.removeNote(id);
			linksState.removeNote(id);
			this.linkSyncRevision.delete(String(id));
		}
		linksState.syncNotes(this.activeNotes.map((entry) => entry.id));
	}

	async togglePin(id: NoteId): Promise<boolean | null> {
		const note = this.noteById.get(id);
		if (!note) return null;
		const isDraft = this.draftNoteIds.has(id);

		const pinned = !note.pinned;
		const updated: Note = {
			...note,
			pinned,
			pinnedAt: pinned ? nowISO() : null,
			updatedAt: nowISO(),
		};

		if (isDraft && !hasMeaningfulNoteContent(updated)) {
			this.setNoteById(updated);
			return updated.pinned;
		}

		const storage = getStorage();
		await storage.saveNote(updated);
		const persisted = (await storage.getNote(id)) ?? updated;
		this.draftNoteIds.delete(id);
		const index = this.notes.findIndex((n) => n.id === id);
		if (index >= 0) {
			const next = [...this.notes];
			next[index] = persisted;
			this.notes = next;
		}
		return persisted.pinned;
	}

	discardDraftIfUntouched(id: NoteId): boolean {
		if (!this.draftNoteIds.has(id)) return false;
		const note = this.noteById.get(id);
		if (!note || hasMeaningfulNoteContent(note)) return false;

		this.draftNoteIds.delete(id);
		this.notes = this.notes.filter((entry) => entry.id !== id);
		if (this.activeNoteId === id) this.activeNoteId = null;
		return true;
	}

	setActive(id: NoteId | null): void {
		this.activeNoteId = id;
	}

	resolveTitle(title: string): NoteId | null {
		return resolveLinkTargetId(title, this.linkResolutionEntries);
	}

	resolveTitleStrict(title: string): NoteId | null {
		return resolveUniqueLinkTargetId(title, this.linkResolutionEntries);
	}

	resolveTitleCandidates(title: string): LinkResolutionCandidate[] {
		return resolveLinkCandidates(title, this.linkResolutionEntries);
	}
}

export const notesState = new NotesState();
