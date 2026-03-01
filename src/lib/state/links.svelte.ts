import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { NoteId } from '$lib/types/note.js';
import { getStorage } from '$lib/platform/storage/index.js';
import { recordPerformanceMeasurement } from '$lib/runtime/diagnostics.js';
import { workerBridge } from '$lib/runtime/worker-bridge.js';

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
	private updateMeasureCounter = 0;

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
		const activeIds = allNotes.map((note) => String(note.id));
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

		const graph = await workerBridge.buildLinkGraph({
			noteIds: activeIds,
			links: allLinks.map((link) => ({
				sourceId: String(link.sourceId),
				targetId: String(link.targetId),
			})),
		});

		const forward = new SvelteMap<string, SvelteSet<string>>();
		for (const [sourceId, targets] of graph.forwardEntries) {
			forward.set(sourceId, new SvelteSet(targets));
		}

		const backward = new SvelteMap<string, SvelteSet<string>>();
		for (const [targetId, sources] of graph.backwardEntries) {
			backward.set(targetId, new SvelteSet(sources));
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
		const measureId = `graph-incremental-${Date.now()}-${this.updateMeasureCounter++}`;
		const startMark = `dndtools:${measureId}:start`;
		const endMark = `dndtools:${measureId}:end`;
		const measureName = `dndtools:${measureId}:measure`;
		const startedAt = performance.now();
		performance.mark(startMark);

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

		performance.mark(endMark);
		performance.measure(measureName, startMark, endMark);
		const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
		const durationMs = Number(
			((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
		);
		performance.clearMarks(startMark);
		performance.clearMarks(endMark);
		performance.clearMeasures(measureName);
		void recordPerformanceMeasurement({
			operation: 'graph_rebuild_incremental',
			durationMs,
			context: {
				sourceId,
				targetCount: newTargets.size,
			},
		});
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
