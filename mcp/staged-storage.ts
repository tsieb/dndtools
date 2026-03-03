import type {
	ImportResult,
	SafetySnapshot,
	SnapshotRestoreResult,
} from '../src/lib/types/storage.js';
import type { AppSettings } from '../src/lib/types/settings.js';
import type { FolderId, Link, Note, NoteId, TagEntry } from '../src/lib/types/note.js';
import { createNoteId } from '../src/lib/types/note.js';
import type {
	SessionBoard,
	SessionBoardId,
	RelatedNoteSuggestion,
} from '../src/lib/types/session-board.js';
import type { McpChangeRecord, McpChangeType } from '../src/lib/types/mcp.js';
import type {
	ObjectLintIssue,
	ObjectRelationshipGraph,
	VaultObject,
	VaultObjectHistoryEntry,
	VaultObjectId,
	VaultObjectType,
} from '../src/lib/types/object.js';
import type { NoteTemplate, ReusableSnippet } from '../src/lib/types/template-library.js';
import { nowISO } from '../src/lib/utils/date.js';
import { slugify } from '../src/lib/utils/slug.js';
import { extractWikilinks } from '../src/lib/domain/link-extractor.js';
import { buildTwoSentenceContextSnippetAtPosition } from '../src/lib/domain/backlink-context.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	resolveLinkTargetId,
} from '../src/lib/domain/link-resolution.js';
import { buildRelatedNoteSuggestions } from '../src/lib/domain/related-note-suggestions.js';
import { buildMcpChangePreview } from '../src/lib/domain/mcp-change-preview.js';
import { normalizeContentVisibility } from '../src/lib/types/visibility.js';
import { FileSystemAdapter } from './storage.js';

function cloneNote(note: Note): Note {
	return {
		...note,
		tags: [...note.tags],
		frontmatter: { ...note.frontmatter },
		visibility: normalizeContentVisibility(note.visibility),
	};
}

function normalizeFolder(folder: string): string {
	return folder.replace(/^\/+/, '');
}

export class StagedMcpAdapter extends FileSystemAdapter {
	private readonly base: FileSystemAdapter;

	constructor(vaultDir: string) {
		super(vaultDir);
		this.base = new FileSystemAdapter(vaultDir);
	}

	async initialize(): Promise<void> {
		await this.base.initialize();
	}

	async close(): Promise<void> {
		await this.base.close();
	}

	async refreshFromDisk(): Promise<void> {
		await this.base.refreshFromDisk();
	}

	private defaultFilePathFor(note: Note): string {
		const folder = normalizeFolder(String(note.folder));
		const baseName = `${slugify(note.title) || 'untitled'}.md`;
		return folder ? `${folder}/${baseName}` : baseName;
	}

	private nextProposedFilePath(note: Note, existingNotes: Note[]): string {
		const folder = normalizeFolder(String(note.folder));
		const slug = slugify(note.title) || 'untitled';
		const used = new Set(
			existingNotes
				.filter((entry) => entry.id !== note.id)
				.map((entry) => entry.filePath ?? this.defaultFilePathFor(entry)),
		);

		let candidate = `${slug}.md`;
		let counter = 2;
		const withFolder = (filename: string): string => (folder ? `${folder}/${filename}` : filename);
		while (used.has(withFolder(candidate))) {
			candidate = `${slug}-${counter}.md`;
			counter += 1;
		}
		return withFolder(candidate);
	}

	private async getPendingChanges(): Promise<McpChangeRecord[]> {
		return this.base.getPendingMcpChanges();
	}

	private async getVirtualNotes(includeDeleted = true): Promise<Note[]> {
		const baseNotes = await this.base.getAllNotes({ includeDeleted: true });
		const notesById = new Map<string, Note>(baseNotes.map((note) => [note.id, note]));
		const pending = await this.getPendingChanges();
		pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

		for (const change of pending) {
			if (change.after?.note) {
				notesById.set(change.noteId, cloneNote(change.after.note));
			} else {
				notesById.delete(change.noteId);
			}
		}

		const merged = [...notesById.values()];
		return includeDeleted ? merged : merged.filter((note) => !note.deleted);
	}

	private summarizeChange(type: McpChangeType, note: Note | null): string {
		const title = note?.title ?? 'note';
		switch (type) {
			case 'create':
				return `Create "${title}"`;
			case 'update':
				return `Update "${title}"`;
			case 'soft_delete':
				return `Move "${title}" to trash`;
			case 'restore':
				return `Restore "${title}" from trash`;
			case 'permanent_delete':
				return `Permanently delete "${title}"`;
		}
	}

	private async stageChange(
		type: McpChangeType,
		noteId: NoteId,
		before: Note | null,
		after: Note | null,
	): Promise<void> {
		const reference = after ?? before;
		await this.base.recordMcpChange({
			type,
			noteId,
			title: reference?.title ?? 'Untitled',
			summary: this.summarizeChange(type, reference ?? null),
			agentId: process.env.DNDTOOLS_MCP_AGENT,
			before: before ? { note: cloneNote(before) } : null,
			after: after ? { note: cloneNote(after) } : null,
			preview: buildMcpChangePreview({
				id: '',
				createdAt: '',
				resolvedAt: null,
				source: 'mcp',
				status: 'pending',
				type,
				noteId,
				title: reference?.title ?? 'Untitled',
				summary: this.summarizeChange(type, reference ?? null),
				agentId: process.env.DNDTOOLS_MCP_AGENT,
				before: before ? { note: cloneNote(before) } : null,
				after: after ? { note: cloneNote(after) } : null,
			}),
		});
	}

	async getNote(id: NoteId): Promise<Note | null> {
		const notes = await this.getVirtualNotes(true);
		return notes.find((note) => note.id === id) ?? null;
	}

	async getAllNotes(options?: { includeDeleted?: boolean }): Promise<Note[]> {
		return this.getVirtualNotes(options?.includeDeleted ?? false);
	}

	async saveNote(note: Note): Promise<void> {
		const notes = await this.getVirtualNotes(true);
		const existing = notes.find((entry) => entry.id === note.id) ?? null;
		const filePath = note.filePath ?? this.nextProposedFilePath(note, notes);
		const stagedNote: Note = {
			...cloneNote(note),
			filePath,
		};

		await this.stageChange(existing ? 'update' : 'create', note.id, existing, stagedNote);
	}

	async deleteNote(id: NoteId, permanent?: boolean): Promise<void> {
		const existing = await this.getNote(id);
		if (!existing) {
			return;
		}

		if (permanent) {
			await this.stageChange('permanent_delete', id, existing, null);
			return;
		}

		const softDeleted: Note = {
			...cloneNote(existing),
			deleted: true,
			deletedAt: nowISO(),
			updatedAt: nowISO(),
		};
		await this.stageChange('soft_delete', id, existing, softDeleted);
	}

	async restoreNote(id: NoteId): Promise<void> {
		const existing = await this.getNote(id);
		if (!existing) {
			return;
		}

		const restored: Note = {
			...cloneNote(existing),
			deleted: false,
			deletedAt: null,
			updatedAt: nowISO(),
		};
		await this.stageChange('restore', id, existing, restored);
	}

	async getNotesByFolder(folder: FolderId): Promise<Note[]> {
		const notes = await this.getVirtualNotes(false);
		return notes.filter((note) => note.folder === folder);
	}

	async getNotesByTag(tag: string): Promise<Note[]> {
		const notes = await this.getVirtualNotes(false);
		return notes.filter((note) => note.tags.includes(tag));
	}

	async getRecentNotes(limit: number): Promise<Note[]> {
		const notes = await this.getVirtualNotes(false);
		return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
	}

	async getDeletedNotes(): Promise<Note[]> {
		const notes = await this.getVirtualNotes(true);
		return notes.filter((note) => note.deleted);
	}

	async resolveTitle(title: string): Promise<Note | null> {
		const notes = await this.getVirtualNotes(false);
		const resolvedId = resolveLinkTargetId(
			title,
			notes.map((note) => ({
				id: String(note.id),
				title: note.title,
				updatedAt: note.updatedAt,
				aliases: extractAliasesFromFrontmatter(note.frontmatter),
			})),
		);
		return resolvedId ? (notes.find((note) => note.id === resolvedId) ?? null) : null;
	}

	private async computeLinks(): Promise<Link[]> {
		const notes = await this.getVirtualNotes(false);
		const resolutionEntries = notes.map((note) => ({
			id: String(note.id),
			title: note.title,
			updatedAt: note.updatedAt,
			aliases: extractAliasesFromFrontmatter(note.frontmatter),
		}));
		const idToId = new Map<string, NoteId>(notes.map((note) => [String(note.id), note.id]));
		const links: Link[] = [];

		for (const note of notes) {
			const extracted = extractWikilinks(note.content);
			for (const link of extracted) {
				if (link.targetIdHint) {
					const targetId = idToId.get(link.targetIdHint);
					if (!targetId) {
						continue;
					}
					links.push({
						sourceId: note.id,
						targetId,
						displayText: link.displayText,
						position: link.position,
						resolvedBy: 'id',
						resolvedAlias: null,
						contextSnippet: buildTwoSentenceContextSnippetAtPosition(note.content, link.position),
					});
					continue;
				}

				const candidates = resolveLinkCandidates(link.title, resolutionEntries);
				if (candidates.length !== 1) {
					continue;
				}
				const target = candidates[0]!;
				links.push({
					sourceId: note.id,
					targetId: createNoteId(target.id),
					displayText: link.displayText,
					position: link.position,
					resolvedBy: target.matchedBy,
					resolvedAlias: target.matchedAlias ?? null,
					contextSnippet: buildTwoSentenceContextSnippetAtPosition(note.content, link.position),
				});
			}
		}

		return links;
	}

	async getLinksFrom(noteId: NoteId): Promise<Link[]> {
		const links = await this.computeLinks();
		return links.filter((link) => link.sourceId === noteId);
	}

	async getLinksTo(noteId: NoteId): Promise<Link[]> {
		const links = await this.computeLinks();
		return links.filter((link) => link.targetId === noteId);
	}

	async setLinksFrom(_noteId: NoteId, _links: Link[]): Promise<void> {
		// Link graph is derived from staged content in this adapter.
	}

	async getAllLinks(): Promise<Link[]> {
		return this.computeLinks();
	}

	async getSessionBoards(): Promise<SessionBoard[]> {
		return this.base.getSessionBoards();
	}

	async getSessionBoard(id: SessionBoardId): Promise<SessionBoard | null> {
		return this.base.getSessionBoard(id);
	}

	async saveSessionBoard(board: SessionBoard): Promise<void> {
		await this.base.saveSessionBoard(board);
	}

	async deleteSessionBoard(id: SessionBoardId): Promise<void> {
		await this.base.deleteSessionBoard(id);
	}

	async suggestRelatedNotes(noteIds: NoteId[], limit = 8): Promise<RelatedNoteSuggestion[]> {
		if (noteIds.length === 0) return [];
		const [notes, links] = await Promise.all([this.getVirtualNotes(false), this.computeLinks()]);
		return buildRelatedNoteSuggestions({
			notes,
			links,
			selectedNoteIds: noteIds,
			limit,
		});
	}

	async getObject(id: VaultObjectId): Promise<VaultObject | null> {
		return this.base.getObject(id);
	}

	async getAllObjects(options?: {
		type?: VaultObjectType;
		query?: string;
	}): Promise<VaultObject[]> {
		return this.base.getAllObjects(options);
	}

	async saveObject(object: VaultObject): Promise<void> {
		await this.base.saveObject(object);
	}

	async deleteObject(id: VaultObjectId): Promise<void> {
		await this.base.deleteObject(id);
	}

	async getObjectRelationshipGraph(): Promise<ObjectRelationshipGraph> {
		return this.base.getObjectRelationshipGraph();
	}

	async lintObjects(): Promise<ObjectLintIssue[]> {
		return this.base.lintObjects();
	}

	async getObjectHistory(
		id: VaultObjectId,
		options?: { limit?: number },
	): Promise<VaultObjectHistoryEntry[]> {
		return this.base.getObjectHistory(id, options);
	}

	async revertObjectToHistory(
		id: VaultObjectId,
		historyEntryId: string,
	): Promise<VaultObject | null> {
		return this.base.revertObjectToHistory(id, historyEntryId);
	}

	async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
		return this.base.getSetting(key);
	}

	async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
		await this.base.setSetting(key, value);
	}

	async getNoteTemplates(): Promise<NoteTemplate[]> {
		return this.base.getNoteTemplates();
	}

	async getReusableSnippets(): Promise<ReusableSnippet[]> {
		return this.base.getReusableSnippets();
	}

	async createSafetySnapshot(reason?: string): Promise<SafetySnapshot> {
		return this.base.createSafetySnapshot(reason);
	}

	async listSafetySnapshots(): Promise<SafetySnapshot[]> {
		return this.base.listSafetySnapshots();
	}

	async restoreDeletedFromSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
		return this.base.restoreDeletedFromSnapshot(snapshotId);
	}

	async importNotes(notes: Note[]): Promise<ImportResult> {
		let imported = 0;
		let skipped = 0;
		const errors: string[] = [];

		const existing = new Set((await this.getVirtualNotes(true)).map((note) => note.id));
		for (const note of notes) {
			if (existing.has(note.id)) {
				skipped += 1;
				continue;
			}

			try {
				await this.saveNote(note);
				imported += 1;
				existing.add(note.id);
			} catch (error) {
				errors.push(`Failed to import "${note.title}": ${String(error)}`);
			}
		}

		return { imported, skipped, errors };
	}

	async exportAllNotes(): Promise<Note[]> {
		return this.getVirtualNotes(true);
	}

	async getNoteCount(): Promise<number> {
		const notes = await this.getVirtualNotes(false);
		return notes.length;
	}

	async getTagCounts(): Promise<TagEntry[]> {
		const counts = new Map<string, number>();
		for (const note of await this.getVirtualNotes(false)) {
			for (const tag of note.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		return [...counts.entries()]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count);
	}

	getIndexEntries(): Array<{
		id: string;
		title: string;
		folder: string;
		filePath: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		deleted: boolean;
		deletedAt: string | null;
	}> {
		throw new Error('getIndexEntries requires async staged snapshot; use getIndexEntriesAsync()');
	}

	async getIndexEntriesAsync(): Promise<
		Array<{
			id: string;
			title: string;
			folder: string;
			filePath: string;
			tags: string[];
			createdAt: string;
			updatedAt: string;
			deleted: boolean;
			deletedAt: string | null;
		}>
	> {
		const notes = await this.getVirtualNotes(true);
		return notes.map((note) => ({
			id: note.id,
			title: note.title,
			folder: String(note.folder),
			filePath: note.filePath ?? this.defaultFilePathFor(note),
			tags: [...note.tags],
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			deleted: note.deleted,
			deletedAt: note.deletedAt,
		}));
	}

	getAllLinksFromIndex(): Array<{
		sourceId: string;
		targetId: string;
		displayText: string;
		position: number;
	}> {
		throw new Error(
			'getAllLinksFromIndex requires async staged snapshot; use getAllLinksFromIndexAsync()',
		);
	}

	async getAllLinksFromIndexAsync(): Promise<
		Array<{
			sourceId: string;
			targetId: string;
			displayText: string;
			position: number;
		}>
	> {
		const links = await this.computeLinks();
		return links.map((link) => ({
			sourceId: link.sourceId,
			targetId: link.targetId,
			displayText: link.displayText,
			position: link.position,
		}));
	}

	getFolderTree(): Array<{ path: string; noteCount: number; subfolders: string[] }> {
		throw new Error('getFolderTree requires async staged snapshot; use getFolderTreeAsync()');
	}

	async getFolderTreeAsync(): Promise<
		Array<{ path: string; noteCount: number; subfolders: string[] }>
	> {
		const notes = await this.getVirtualNotes(false);
		const folderCounts = new Map<string, number>();
		const folders = new Set<string>();

		for (const note of notes) {
			const folder = String(note.folder);
			folders.add(folder);
			folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
		}

		const childrenByParent = new Map<string, string[]>();
		for (const folder of folders) {
			const parent = folder.substring(0, folder.lastIndexOf('/')) || '/';
			if (folder === parent) continue;
			const siblings = childrenByParent.get(parent);
			if (siblings) {
				siblings.push(folder);
			} else {
				childrenByParent.set(parent, [folder]);
			}
		}

		for (const siblings of childrenByParent.values()) {
			siblings.sort((a, b) => a.localeCompare(b));
		}

		const tree: Array<{ path: string; noteCount: number; subfolders: string[] }> = [];
		for (const folder of folders) {
			tree.push({
				path: folder,
				noteCount: folderCounts.get(folder) ?? 0,
				subfolders: childrenByParent.get(folder) ?? [],
			});
		}

		return tree.sort((a, b) => a.path.localeCompare(b.path));
	}

	async resolveAndIndexLinks(_noteId: NoteId, _content: string): Promise<void> {
		// Link graph is computed on demand for staged snapshots.
	}

	async searchNotes(query: string): Promise<Array<{ note: Note; score: number }>> {
		const notes = await this.getVirtualNotes(false);
		const lower = query.toLowerCase();
		const results: Array<{ note: Note; score: number }> = [];

		for (const note of notes) {
			let score = 0;
			const titleLower = note.title.toLowerCase();
			const contentLower = note.content.toLowerCase();
			const filePathLower = (note.filePath ?? this.defaultFilePathFor(note)).toLowerCase();

			if (titleLower.includes(lower)) {
				score += titleLower === lower ? 100 : 50;
			}
			if (filePathLower.includes(lower)) {
				score += 25;
			}
			for (const tag of note.tags) {
				if (tag.toLowerCase().includes(lower)) {
					score += 30;
				}
			}
			if (contentLower.includes(lower)) {
				score += 10;
			}

			if (score > 0) {
				results.push({ note, score });
			}
		}

		return results.sort((a, b) => b.score - a.score);
	}

	async getPendingMcpChanges(): Promise<McpChangeRecord[]> {
		return this.base.getPendingMcpChanges();
	}

	async approveMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		return this.base.approveMcpChange(changeId);
	}

	async approveAllMcpChanges(): Promise<McpChangeRecord[]> {
		return this.base.approveAllMcpChanges();
	}

	async rejectMcpChange(changeId: string): Promise<McpChangeRecord | null> {
		return this.base.rejectMcpChange(changeId);
	}

	async rejectAllMcpChanges(): Promise<McpChangeRecord[]> {
		return this.base.rejectAllMcpChanges();
	}
}
