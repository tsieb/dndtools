import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

/**
 * RC-KNW-1.2 — the note editor's write path: autosave, save-and-close, and conflict detection.
 * Split out of NoteEditor.tsx (RC-POL-1.11) unchanged in behaviour.
 *
 * Every write carries the `baseRevision` the draft diverged from, so when the note changed elsewhere
 * the core records a `content.item-conflicted` operation and leaves the item ALONE. The hook then
 * reports `conflict` rather than a save that did not happen.
 */

/** What the host's dispatch made of the write. `conflict` means NOTHING was written. */
export type NoteSaveOutcome =
	| { status: 'saved' }
	| { status: 'conflict' }
	| { status: 'rejected'; message: string };

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'failed';

/** Idle time after the last keystroke before the draft is written. */
const AUTOSAVE_MS = 1200;

export function useNoteAutosave({
	title,
	body,
	revision,
	draftTitle,
	draftBody,
	onSave,
	onCancel,
	busy,
}: {
	/** The PERSISTED title/body/revision. */
	title: string;
	body: string;
	revision: number;
	draftTitle: string;
	draftBody: string;
	onSave: (draft: {
		title: string;
		body: string;
		baseRevision: number;
	}) => Promise<NoteSaveOutcome>;
	onCancel: () => void;
	busy: boolean;
}) {
	const { t } = useI18n();
	const dirty = draftTitle !== title || draftBody !== body;
	const [base, setBase] = useState(revision);
	const [state, setState] = useState<SaveState>('clean');
	const [savedAt, setSavedAt] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);

	// The save path runs from refs, never from a render closure: an autosave that fires 1.2s after
	// the last keystroke, and a manual save that waits for it, must both write the CURRENT draft
	// against the CURRENT base — a stale closure here would silently save the wrong revision.
	const live = useRef({ title, body, revision, draftTitle, draftBody, base, dirty, onSave, t });
	live.current = { title, body, revision, draftTitle, draftBody, base, dirty, onSave, t };
	const pendingRef = useRef<Promise<void> | null>(null);
	const discardRef = useRef(false);

	// Adopt the persisted revision only while the draft MATCHES what is stored. A note that moves
	// underneath an unsaved draft leaves `base` stale on purpose — that staleness is precisely what
	// makes the next write conflict instead of quietly overwriting the other author.
	useEffect(() => {
		if (!dirty && base !== revision) setBase(revision);
	}, [dirty, base, revision]);

	useEffect(() => {
		if (dirty && state === 'clean') setState('dirty');
	}, [dirty, state]);

	/** One write. Returns true when the note was actually persisted. */
	const write = useCallback(async (rebase: boolean): Promise<boolean> => {
		const now = live.current;
		if (!now.draftTitle.trim()) return false;
		const baseRevision = rebase ? now.revision : now.base;
		setError(null);
		setState('saving');
		let ok = false;
		const run = (async () => {
			try {
				const outcome = await now.onSave({
					title: now.draftTitle,
					body: now.draftBody,
					baseRevision,
				});
				if (outcome.status === 'saved') {
					setBase(baseRevision);
					setSavedAt(new Date());
					setState('saved');
					ok = true;
				} else if (outcome.status === 'conflict') {
					setState('conflict');
				} else {
					setState('failed');
					setError(outcome.message);
				}
			} catch (err) {
				setState('failed');
				setError(err instanceof Error ? err.message : now.t('knowledge.saveFailed'));
			}
		})();
		pendingRef.current = run;
		try {
			await run;
		} finally {
			pendingRef.current = null;
		}
		return ok;
	}, []);

	// AUTOSAVE — debounced, armed only while there is something to write. It stops dead on a
	// conflict: retrying on a timer would either spam the conflict log or, worse, look like it had
	// succeeded. The DM picks a side first.
	useEffect(() => {
		if (!dirty || busy || state === 'conflict' || !draftTitle.trim()) return;
		const timer = setTimeout(() => {
			if (!pendingRef.current) void write(false);
		}, AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [dirty, busy, state, draftTitle, draftBody, write]);

	// Leaving the editor while a debounce is still counting down must not throw the paragraph away.
	// Cancel and Delete set `discardRef` first, so only an incidental unmount — a preview wikilink
	// opening another note, a route change — flushes.
	useEffect(
		() => () => {
			if (!discardRef.current && live.current.dirty && live.current.draftTitle.trim()) {
				void write(false);
			}
		},
		[write],
	);

	/** Save now and leave. Waits out an autosave already on the wire so the two cannot race. */
	async function saveAndClose() {
		if (!draftTitle.trim()) {
			// The core would reject it anyway; saying so here keeps the typed body on screen.
			setError(t('knowledge.needsTitle'));
			return;
		}
		if (pendingRef.current) await pendingRef.current;
		if (!live.current.dirty) {
			discardRef.current = true;
			onCancel();
			return;
		}
		if (await write(false)) {
			discardRef.current = true;
			onCancel();
		}
	}

	/** Leave without writing: Cancel and Delete call this so the unmount flush stays quiet. */
	function discard() {
		discardRef.current = true;
	}

	return {
		dirty,
		state,
		setState,
		savedAt,
		error,
		setError,
		setBase,
		write,
		saveAndClose,
		discard,
	};
}
