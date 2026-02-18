import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { NoteId } from '$lib/types/note.js';
import { getStorage } from '$lib/storage/index.js';

export interface BacklinkInfo {
	sourceId: NoteId;
	sourceTitle: string;
	contextSnippet: string;
}

class LinksState {
	/** Forward links map: noteId -> targetIds */
	private forwardMap = $state<SvelteMap<string, SvelteSet<string>>>(new SvelteMap());
	/** Backward links map: noteId -> sourceIds */
	private backwardMap = $state<SvelteMap<string, SvelteSet<string>>>(new SvelteMap());

	private removeBackwardIfEmpty(targetId: string): void {
		const backlinks = this.backwardMap.get(targetId);
		if (backlinks && backlinks.size === 0) {
			this.backwardMap.delete(targetId);
		}
	}

	private removeOutgoingLinks(sourceId: string): void {
		const oldTargets = this.forwardMap.get(sourceId);
		if (!oldTargets) return;
		for (const targetId of oldTargets) {
			this.backwardMap.get(targetId)?.delete(sourceId);
			this.removeBackwardIfEmpty(targetId);
		}
	}

	async buildGraph(): Promise<void> {
		const storage = getStorage();
		const allNotes = await storage.getAllNotes();
		const activeIds = new Set(allNotes.map((note) => String(note.id)));
		const forward = new SvelteMap<string, SvelteSet<string>>();
		const backward = new SvelteMap<string, SvelteSet<string>>();
		let allLinks = storage.getAllLinks ? await storage.getAllLinks() : null;

		if (!allLinks) {
			const perNoteLinks = await Promise.all(
				allNotes.map(async (note) => ({
					noteId: String(note.id),
					links: await storage.getLinksFrom(note.id),
				})),
			);
			allLinks = perNoteLinks.flatMap(({ links }) => links);
		}

		for (const note of allNotes) {
			forward.set(String(note.id), new SvelteSet());
		}

		for (const link of allLinks) {
			const sourceId = String(link.sourceId);
			const targetId = String(link.targetId);
			if (!activeIds.has(sourceId)) continue;
			const sourceTargets = forward.get(sourceId);
			if (!sourceTargets) continue;

			sourceTargets.add(targetId);
			if (!backward.has(targetId)) {
				backward.set(targetId, new SvelteSet());
			}
			backward.get(targetId)!.add(sourceId);
		}

		this.forwardMap = forward;
		this.backwardMap = backward;
	}

	getBacklinkIds(noteId: NoteId): string[] {
		return Array.from(this.backwardMap.get(String(noteId)) ?? []);
	}

	getBacklinkCount(noteId: NoteId): number {
		return this.backwardMap.get(String(noteId))?.size ?? 0;
	}

	getForwardLinkIds(noteId: NoteId): string[] {
		return Array.from(this.forwardMap.get(String(noteId)) ?? []);
	}

	getForwardLinkCount(noteId: NoteId): number {
		return this.forwardMap.get(String(noteId))?.size ?? 0;
	}

	updateNoteLinks(noteId: NoteId, targetIds: NoteId[]): void {
		const sourceId = String(noteId);
		this.removeOutgoingLinks(sourceId);

		const newTargets = new SvelteSet(targetIds.map((targetId) => String(targetId)));
		this.forwardMap.set(sourceId, newTargets);

		for (const targetId of newTargets) {
			if (!this.backwardMap.has(targetId)) {
				this.backwardMap.set(targetId, new SvelteSet());
			}
			this.backwardMap.get(targetId)!.add(sourceId);
		}
	}

	removeNote(noteId: NoteId): void {
		const id = String(noteId);
		this.removeOutgoingLinks(id);
		this.forwardMap.delete(id);
		this.backwardMap.delete(id);
	}

	syncNotes(noteIds: Iterable<NoteId>): void {
		const activeIds = new Set(Array.from(noteIds, (id) => String(id)));
		for (const id of Array.from(this.forwardMap.keys())) {
			if (!activeIds.has(id)) {
				this.removeNote(id as NoteId);
			}
		}
		for (const id of activeIds) {
			if (!this.forwardMap.has(id)) {
				this.forwardMap.set(id, new SvelteSet());
			}
		}
	}
}

export const linksState = new LinksState();
