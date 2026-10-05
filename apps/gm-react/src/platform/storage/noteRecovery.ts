/** Synchronous recovery journal: IndexedDB cannot finish reliably during document unload. */
export interface NoteRecoveryDraft {
	title: string;
	body: string;
	baseRevision: number;
}

export function readNoteRecovery(key: string): NoteRecoveryDraft | null {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? 'null');
		return value &&
			typeof value.title === 'string' &&
			typeof value.body === 'string' &&
			Number.isInteger(value.baseRevision) &&
			value.baseRevision >= 0
			? value
			: null;
	} catch {
		return null;
	}
}

/** Synchronous by design: the document may be destroyed immediately after this returns.
 * Storage failures propagate so the editor can warn before losing an unprotected draft.
 */
export function writeNoteRecovery(key: string, draft: NoteRecoveryDraft | null): void {
	if (draft === null) localStorage.removeItem(key);
	else localStorage.setItem(key, JSON.stringify(draft));
}
