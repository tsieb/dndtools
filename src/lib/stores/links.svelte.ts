import type { NoteId, Link } from '$lib/types/note.js';
import { getStorage } from '$lib/storage/index.js';

export interface BacklinkInfo {
	sourceId: NoteId;
	sourceTitle: string;
	contextSnippet: string;
}

class LinksState {
	/** Forward links map: noteId -> targetIds */
	private forwardMap = $state<Map<string, Set<string>>>(new Map());
	/** Backward links map: noteId -> sourceIds */
	private backwardMap = $state<Map<string, Set<string>>>(new Map());

	async buildGraph(): Promise<void> {
		const storage = getStorage();
		const allNotes = await storage.getAllNotes();
		const forward = new Map<string, Set<string>>();
		const backward = new Map<string, Set<string>>();

		for (const note of allNotes) {
			const links = await storage.getLinksFrom(note.id);
			const targets = new Set<string>();
			for (const link of links) {
				targets.add(link.targetId);
				if (!backward.has(link.targetId)) {
					backward.set(link.targetId, new Set());
				}
				backward.get(link.targetId)!.add(note.id);
			}
			forward.set(note.id, targets);
		}

		this.forwardMap = forward;
		this.backwardMap = backward;
	}

	getBacklinkIds(noteId: NoteId): string[] {
		return Array.from(this.backwardMap.get(noteId) ?? []);
	}

	getForwardLinkIds(noteId: NoteId): string[] {
		return Array.from(this.forwardMap.get(noteId) ?? []);
	}

	updateNoteLinks(noteId: NoteId, targetIds: NoteId[]): void {
		// Remove old backlinks
		const oldTargets = this.forwardMap.get(noteId) ?? new Set();
		for (const oldTarget of oldTargets) {
			this.backwardMap.get(oldTarget)?.delete(noteId);
		}

		// Set new forward links
		const newTargets = new Set(targetIds.map(String));
		this.forwardMap.set(noteId, newTargets);

		// Set new backlinks
		for (const target of targetIds) {
			if (!this.backwardMap.has(target)) {
				this.backwardMap.set(target, new Set());
			}
			this.backwardMap.get(target)!.add(noteId);
		}
	}
}

export const linksState = new LinksState();
