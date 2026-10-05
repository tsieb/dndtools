import { UNSAFE_NavigationContext } from 'react-router-dom';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { writeNoteRecovery } from '../../platform/storage/noteRecovery';

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
	recoveryKey,
	recoveredRevision,
	title,
	body,
	revision,
	draftTitle,
	draftBody,
	onSave,
	onCancel,
	busy,
}: {
	recoveryKey?: string;
	recoveredRevision?: number;
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
	const navigation = useContext(UNSAFE_NavigationContext);
	const acknowledged = useRef({ title, body, revision: recoveredRevision ?? revision });
	const failed = useRef(false);
	const dirty = draftTitle !== title || draftBody !== body;
	const [base, setBase] = useState(recoveredRevision ?? revision);
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

	// Layout effects journal every committed edit before the browser can leave. The lifecycle
	// handlers repeat this synchronously, without depending on the asynchronous core dispatch.
	const journal = useCallback(() => {
		if (!recoveryKey) return true;
		const now = live.current;
		try {
			writeNoteRecovery(
				recoveryKey,
				discardRef.current || !now.dirty
					? null
					: {
							title: now.draftTitle,
							body: now.draftBody,
							baseRevision: now.base,
						},
			);
			return true;
		} catch {
			return false;
		}
	}, [recoveryKey]);
	useLayoutEffect(() => {
		journal();
	}, [journal, draftTitle, draftBody, dirty]);

	// Adopt the persisted revision only while the draft MATCHES what is stored. A note that moves
	// underneath an unsaved draft leaves `base` stale on purpose — that staleness is precisely what
	// makes the next write conflict instead of quietly overwriting the other author.
	useEffect(() => {
		if (!dirty) {
			acknowledged.current = { title, body, revision };
			if (base !== revision) setBase(revision);
		}
	}, [dirty, base, revision, title, body]);

	useEffect(() => {
		if (dirty && state === 'clean') setState('dirty');
	}, [dirty, state]);

	/** One write. Returns true when the note was actually persisted. */
	const write = useCallback(
		async (rebase: boolean): Promise<boolean> => {
			while (pendingRef.current) await pendingRef.current;
			if (discardRef.current) return true;
			const now = live.current;
			const saved = acknowledged.current;
			if (now.draftTitle === saved.title && now.draftBody === saved.body) return true;
			if (!now.draftTitle.trim()) {
				failed.current = true;
				setError(now.t('knowledge.needsTitle'));
				setState('failed');
				return false;
			}
			const baseRevision = rebase ? now.revision : Math.max(now.base, saved.revision);
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
						acknowledged.current = {
							title: now.draftTitle,
							body: now.draftBody,
							revision: baseRevision + 1,
						};
						live.current.base = baseRevision + 1;
						// Do not delete a newer edit when an older in-flight write completes.
						live.current.dirty =
							live.current.draftTitle !== now.draftTitle ||
							live.current.draftBody !== now.draftBody;
						journal();
						setBase(baseRevision + 1);
						failed.current = false;
						setSavedAt(new Date());
						setState('saved');
						ok = true;
					} else if (outcome.status === 'conflict') {
						failed.current = true;
						setState('conflict');
					} else {
						failed.current = true;
						setState('failed');
						setError(outcome.message);
					}
				} catch (err) {
					failed.current = true;
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
		},
		[journal],
	);

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

	// Serialize lifecycle flushes with autosave; a keystroke during an in-flight write must
	// get a second write against the revision that the first write actually committed.
	const flush = useCallback(async (): Promise<boolean> => {
		do {
			if (!(await write(false))) return false;
		} while (
			!discardRef.current &&
			(live.current.draftTitle !== acknowledged.current.title ||
				live.current.draftBody !== acknowledged.current.body)
		);
		return true;
	}, [write]);

	useEffect(() => {
		const visibility = () => {
			if (document.visibilityState === 'hidden') {
				journal();
				void flush();
			}
		};
		const unload = (event: BeforeUnloadEvent) => {
			const protectedDraft = journal();
			void flush();
			// Browsers cannot await IndexedDB in beforeunload. Start the write, and warn only
			// if a write failed, including the synchronous recovery write.
			if ((failed.current || !protectedDraft) && live.current.dirty && !discardRef.current) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('beforeunload', unload);
		return () => {
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('beforeunload', unload);
			if (!discardRef.current) void flush();
		};
	}, [flush, journal]);

	// HashRouter has no data-router blocker. Hold its programmatic transitions until the
	// durable write completes, retaining the mounted draft if the user cancels a failed leave.
	useEffect(() => {
		if (!navigation) return;
		const navigator = navigation.navigator;
		const { push, replace, go } = navigator;
		const originState = window.history.state;
		const originIndex = originState?.idx;
		const originUrl = window.location.href;
		let replaying = false;
		let restoring = false;
		const pop = (event: PopStateEvent) => {
			if (replaying) return;
			event.stopImmediatePropagation();
			if (restoring) {
				restoring = false;
				return;
			}
			const targetIndex = event.state?.idx;
			void (async () => {
				const saved = await flush();
				if (saved || window.confirm(live.current.t('knowledge.failedLeave'))) {
					discardRef.current = !saved;
					replaying = true;
					window.dispatchEvent(new PopStateEvent('popstate', { state: event.state }));
					replaying = false;
				} else if (
					typeof originIndex === 'number' &&
					typeof targetIndex === 'number' &&
					originIndex !== targetIndex
				) {
					restoring = true;
					window.history.go(originIndex - targetIndex);
				} else {
					window.history.replaceState(originState, '', originUrl);
				}
			})();
		};
		window.addEventListener('popstate', pop, true);
		let leaving = false;
		const leave = async (proceed: () => void) => {
			if (leaving) return;
			leaving = true;
			const saved = await flush();
			if (saved || window.confirm(live.current.t('knowledge.failedLeave'))) {
				discardRef.current = !saved;
				proceed();
			}
			leaving = false;
		};
		navigator.push = (...args) => {
			void leave(() => push(...args));
		};
		navigator.replace = (...args) => {
			void leave(() => replace(...args));
		};
		navigator.go = (...args) => {
			void leave(() => go(...args));
		};
		return () => {
			window.removeEventListener('popstate', pop, true);
			navigator.push = push;
			navigator.replace = replace;
			navigator.go = go;
		};
	}, [navigation, flush]);

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
		if (await flush()) {
			discardRef.current = true;
			onCancel();
		}
	}

	/** Leave without writing: Cancel and Delete call this so the unmount flush stays quiet. */
	function discard(skip = true) {
		discardRef.current = skip;
		journal();
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
