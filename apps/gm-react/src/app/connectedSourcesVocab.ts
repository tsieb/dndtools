import { useEffect, useMemo, useState } from 'react';
import { getContentItemsForActor, parseMarkdownNote, type ContentItemView } from '@dndtools/core';
import { Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n, type MessageKey } from '../i18n';
import {
	WALK_MAX_FILES,
	connectFolderSource,
	disconnectFolderSource,
	ensureFolderPermission,
	importFromFolder,
	listFolderSources,
	planNotesPush,
	touchFolderSource,
	writeBack,
	type FolderSourceRecord,
	type PushPlan,
	type PushPlanNote,
} from '../platform/fsSource';
import {
	addGdocConnection,
	connectGoogleAccount,
	createGoogleDoc,
	docToMarkdown,
	fetchGoogleDoc,
	isGoogleDocsRuntimeSupported,
	isGoogleSignedIn,
	listGdocConnections,
	pushMarkdownToDoc,
	removeGdocConnection,
	touchGdocConnection,
	type GdocConnection,
} from '../cloud/googleDocs';
import { useCloudActions } from '../cloud/offline';

/**
 * The connected-sources panel's non-visual half: the pull-collision policy table, the last-synced
 * stamp, the filename stem a pushed note is written under, and `useConnectedSources`, the
 * controller that owns every pull, push, sign-in and disconnect the panel offers.
 *
 * RC-POL-1.17 moved the controller here from `ConnectedSources.tsx` so the panel file renders only
 * and both stay under the 500-line target (RC-STB-2.7). The behaviour is unchanged.
 */

export const PULL_POLICIES: { value: string; label: MessageKey }[] = [
	{ value: 'skip', label: 'sources.policy.skip' },
	{ value: 'overwrite', label: 'sources.policy.overwrite' },
	{ value: 'keep-both', label: 'sources.policy.keepBoth' },
];

/** The last-synced stamp, in the reader's locale — the caller passes the i18n date formatter and
 * the word for "no sync yet", since this is a plain function outside the component. */
export function when(
	iso: string | null,
	formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
	never: string,
): string {
	if (!iso) return never;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return never;
	return formatDate(d, { month: 'short', day: 'numeric' });
}

export function slugStem(title: string, fallback: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stem === '' ? fallback : stem;
}

export function viewToPlanNote(note: ContentItemView): PushPlanNote {
	return {
		id: note.id,
		title: note.title,
		body: note.body,
		fields: note.fields,
		visibility: note.visibility,
	};
}

export function errText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Created/overwritten totals from an accepted `content.commit-import`'s emitted event. */
function importCounts(events: readonly unknown[]): { created: number; over: number } {
	const ev = events.find((e) => (e as { kind?: string }).kind === 'content.import-committed') as
		| { createdItemIds?: string[]; overwrittenItemIds?: string[] }
		| undefined;
	return { created: ev?.createdItemIds?.length ?? 0, over: ev?.overwrittenItemIds?.length ?? 0 };
}

export interface PendingPush {
	kind: 'folder' | 'gdoc';
	/** Folder record id or Doc id — the row the status/busy state belongs to. */
	sourceKey: string;
	label: string;
	plan: PushPlan;
	record?: FolderSourceRecord;
	conn?: GdocConnection;
	/** The pushed note is DM-only and the target is an external (shareable) Google Doc. */
	dmOnlyToExternal?: boolean;
}

/** A source pending the disconnect confirm (folder handles can't be restored — honest copy). */
export interface DisconnectTarget {
	kind: 'folder' | 'gdoc';
	id: string;
	name: string;
}

/**
 * Every source row offers PULL (source → `content.commit-import`, the core's transactional import)
 * and PUSH (per note: `content.write-to-source`, the CONTENT-012 authority gate — only an ACCEPTED
 * dispatch's emitted `content.written-to-source` event triggers the byte/API transport here). A
 * lossy push is confirmed up front with the plan's union loss summary; each item still carries its
 * own acknowledgment token, so the core re-checks per item.
 */
export function useConnectedSources() {
	const runtime = useRuntime();
	const { t, formatDate } = useI18n();
	const whenStamp = (iso: string | null) => when(iso, formatDate, t('sources.never'));
	const actorId = runtime.defaultActorId;
	const notes = useMemo(
		() =>
			getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId).filter(
				(n) => n.kind === 'note',
			),
		[runtime.state, actorId],
	);

	const [folders, setFolders] = useState<FolderSourceRecord[]>([]);
	const [gdocs, setGdocs] = useState<GdocConnection[]>([]);
	const [statusBySource, setStatusBySource] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState<string | null>(null);
	const [policy, setPolicy] = useState('skip');
	const [pendingPush, setPendingPush] = useState<PendingPush | null>(null);
	// RC-PLT-2.4: only the Google half is cloud-only; folder handles stay live offline.
	const cloudActions = useCloudActions('cloud.offline.docs');
	const [disconnectTarget, setDisconnectTarget] = useState<DisconnectTarget | null>(null);
	const googleRuntimeSupported = isGoogleDocsRuntimeSupported(
		window.location.protocol,
		window.location.origin,
	);
	const [googleSignedIn, setGoogleSignedIn] = useState(
		googleRuntimeSupported && isGoogleSignedIn(),
	);
	const [docInput, setDocInput] = useState('');
	const [pushNoteBySource, setPushNoteBySource] = useState<Record<string, string>>({});

	const refresh = async () => {
		setFolders(await listFolderSources());
		setGdocs(listGdocConnections());
	};

	useEffect(() => {
		void refresh();
	}, []);

	// Google access tokens expire while this long-lived panel can remain mounted. Reconcile on focus
	// and once a minute so actions and badges return to “Sign in” instead of showing stale access.
	useEffect(() => {
		if (!googleRuntimeSupported) return;
		const reconcileGoogleAuth = () => setGoogleSignedIn(isGoogleSignedIn());
		const timer = window.setInterval(reconcileGoogleAuth, 60_000);
		window.addEventListener('focus', reconcileGoogleAuth);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener('focus', reconcileGoogleAuth);
		};
	}, [googleRuntimeSupported]);

	const setStatusFor = (key: string, message: string) =>
		setStatusBySource((prev) => ({ ...prev, [key]: message }));
	// Each operation clears the key it reports to first: an identical outcome left standing made a
	// retry look like a dead button.
	const clearStatusFor = (key: string) =>
		setStatusBySource((prev) => {
			if (!(key in prev)) return prev;
			const next = { ...prev };
			delete next[key];
			return next;
		});

	/** Both source kinds pull through the core's transactional markdown import. */
	const commitImport = (files: { path: string; text: string }[]) =>
		runtime.dispatch({
			type: 'content.commit-import',
			actorId,
			payload: { sourceKind: 'markdown-archive', policy, files, appliedEntryIds: [] },
		});

	async function connectFolder() {
		// A later success writes to `record.id`, so a stale picker failure must be dropped here.
		setStatusBySource(({ 'connect-folder': _dropped, ...rest }) => rest);
		try {
			const record = await connectFolderSource();
			if (!record) return; // user cancelled the picker
			await refresh();
			setStatusFor(record.id, t('sources.folderConnected'));
		} catch (error) {
			setStatusFor('connect-folder', errText(error));
		}
	}

	async function pullFolder(record: FolderSourceRecord) {
		setBusy(record.id);
		clearStatusFor(record.id);
		try {
			const ok = await ensureFolderPermission(record.handle, 'read');
			if (!ok) {
				setStatusFor(record.id, t('sources.readDenied'));
				return;
			}
			const walked = await importFromFolder(record.handle);
			if (walked.fileCount === 0) {
				setStatusFor(record.id, t('sources.noMarkdown'));
				return;
			}
			const result = await commitImport(walked.files);
			if (result.status === 'accepted') {
				const { created, over } = importCounts(result.events);
				await touchFolderSource(record.id, { lastImportAt: new Date().toISOString() });
				setStatusFor(
					record.id,
					walked.truncated
						? over
							? t('sources.importedOverwritesPartial', { created, over, max: WALK_MAX_FILES })
							: t('sources.importedPartial', { created, max: WALK_MAX_FILES })
						: over
							? t('sources.importedOverwrites', { created, over })
							: t('sources.imported', { created }),
				);
			} else {
				setStatusFor(record.id, result.rejection.message);
			}
		} catch (error) {
			setStatusFor(record.id, errText(error));
		} finally {
			setBusy(null);
			await refresh();
		}
	}

	async function startFolderPush(record: FolderSourceRecord) {
		clearStatusFor(record.id);
		if (notes.length === 0) {
			setStatusFor(record.id, t('sources.noNotesToPush'));
			return;
		}
		setBusy(record.id);
		const ok = await ensureFolderPermission(record.handle, 'readwrite');
		setBusy(null);
		if (!ok) {
			setStatusFor(record.id, t('sources.writeDenied'));
			return;
		}
		const plan = planNotesPush(notes.map(viewToPlanNote), 'local-markdown');
		const pending: PendingPush = {
			kind: 'folder',
			sourceKey: record.id,
			label: record.name,
			plan,
			record,
		};
		if (plan.requiresAcknowledgment) setPendingPush(pending);
		else void executePush(pending);
	}

	async function executePush(pending: PendingPush) {
		setPendingPush(null);
		setBusy(pending.sourceKey);
		let written = 0;
		let firstError: string | null = null;
		try {
			for (const entry of pending.plan.entries) {
				// content.write-to-source (CONTENT-012) — the core re-runs the loss check and gates on the
				// acknowledgment token. Only an ACCEPTED dispatch authorizes the transport below.
				const result = await runtime.dispatch({
					type: 'content.write-to-source',
					actorId,
					payload: {
						itemId: entry.itemId,
						source: pending.plan.source,
						noteText: entry.noteText,
						...(entry.check.acknowledgmentToken
							? { acknowledgmentToken: entry.check.acknowledgmentToken }
							: {}),
					},
				});
				if (result.status !== 'accepted') {
					firstError ??= `“${entry.title}”: ${result.rejection.message}`;
					continue;
				}
				const event = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.written-to-source',
				);
				if (!event) {
					firstError ??= t('sources.pushPrepareFailed', { title: entry.title });
					continue;
				}
				try {
					if (pending.kind === 'folder' && pending.record) {
						await writeBack(pending.record.handle, entry.path, entry.noteText);
					} else if (pending.kind === 'gdoc' && pending.conn) {
						// Google Docs cannot represent front matter (declared + acknowledged above), so the
						// transport writes the BODY; the dropped structures were audited by the core op.
						await pushMarkdownToDoc(pending.conn.docId, parseMarkdownNote(entry.noteText).body);
					}
					written += 1;
				} catch (error) {
					firstError ??= t('sources.pushEntryError', {
						title: entry.title,
						message: errText(error),
					});
				}
			}
			const stamp = new Date().toISOString();
			if (pending.kind === 'folder' && pending.record) {
				await touchFolderSource(pending.record.id, { lastWriteAt: stamp });
			} else if (pending.kind === 'gdoc' && pending.conn) {
				touchGdocConnection(pending.conn.docId, { lastPushAt: stamp });
			}
			setStatusFor(
				pending.sourceKey,
				firstError
					? t('sources.pushedWithProblem', {
							written,
							total: pending.plan.entries.length,
							label: pending.label,
							problem: firstError,
						})
					: t('sources.pushed', {
							written,
							total: pending.plan.entries.length,
							label: pending.label,
						}),
			);
		} catch (error) {
			// `runtime.dispatch` THROWS on a persist failure; without this the row went idle silently
			// after some notes had already been written to disk.
			setStatusFor(pending.sourceKey, errText(error));
		} finally {
			setBusy(null);
			await refresh();
		}
	}

	async function signInGoogle() {
		// `busy` disables the whole panel, and a consent popup left open never settles the GIS
		// promise — `finally` is what makes that recoverable.
		setBusy('google-auth');
		clearStatusFor('google');
		try {
			const outcome = await connectGoogleAccount();
			if (outcome.status === 'signed-in') {
				setGoogleSignedIn(true);
				setStatusFor('google', t('sources.googleSignedIn'));
			} else if (outcome.status === 'failed') {
				setStatusFor('google', outcome.message);
			}
			// 'redirecting' — the page is navigating away; nothing to render.
		} catch (e) {
			setStatusFor('google', e instanceof Error ? e.message : t('sources.googleSignInFailed'));
		} finally {
			setBusy(null);
		}
	}

	async function createNewDoc() {
		const title = docInput.trim() || t('sources.defaultDocTitle');
		setBusy('google-connect');
		clearStatusFor('google');
		try {
			const doc = await createGoogleDoc(title);
			if (!doc.documentId) throw new Error(t('sources.googleNoDocId'));
			addGdocConnection(doc.documentId, doc.title ?? title);
			setDocInput('');
			setStatusFor('google', t('sources.docCreated', { title: doc.title ?? title }));
			await refresh();
		} catch (error) {
			setStatusFor('google', errText(error));
		} finally {
			setBusy(null);
		}
	}

	async function pullGdoc(conn: GdocConnection) {
		setBusy(conn.docId);
		clearStatusFor(conn.docId);
		try {
			const doc = await fetchGoogleDoc(conn.docId);
			const markdown = docToMarkdown(doc);
			if (!markdown.trim()) {
				setStatusFor(conn.docId, t('sources.docEmpty'));
				return;
			}
			const title = doc.title ?? conn.title;
			const path = `google-docs/${slugStem(title, conn.docId)}.md`;
			const result = await commitImport([{ path, text: markdown }]);
			if (result.status === 'accepted') {
				const { created, over } = importCounts(result.events);
				touchGdocConnection(conn.docId, { title, lastPullAt: new Date().toISOString() });
				setStatusFor(
					conn.docId,
					over
						? t('sources.importedFromDocOverwrites', { created, over })
						: t('sources.importedFromDoc', { created }),
				);
			} else {
				setStatusFor(conn.docId, result.rejection.message);
			}
		} catch (error) {
			setStatusFor(conn.docId, errText(error));
		} finally {
			setBusy(null);
			await refresh();
		}
	}

	function startGdocPush(conn: GdocConnection) {
		const note = notes.find((n) => n.id === pushNoteBySource[conn.docId]);
		if (!note) {
			setStatusFor(conn.docId, t('sources.pickNote'));
			return;
		}
		if (!isGoogleSignedIn()) {
			setGoogleSignedIn(false);
			setStatusFor(conn.docId, t('sources.signInExpired'));
			return;
		}
		const plan = planNotesPush([viewToPlanNote(note)], 'google-docs');
		// A dm-only note leaving the vault for an external, shareable Doc is confirmed even when the
		// push itself is lossless — the exposure risk deserves its own explicit gate.
		const dmOnlyToExternal = note.visibility === 'dm-only';
		const pending: PendingPush = {
			kind: 'gdoc',
			sourceKey: conn.docId,
			label: conn.title,
			plan,
			conn,
			dmOnlyToExternal,
		};
		if (plan.requiresAcknowledgment || dmOnlyToExternal) setPendingPush(pending);
		else void executePush(pending);
	}

	// Both source kinds confirm first; a folder disconnect is not undoable.
	async function confirmDisconnect() {
		if (!disconnectTarget) return;
		const { kind, id, name } = disconnectTarget;
		setDisconnectTarget(null);
		try {
			if (kind === 'folder') await disconnectFolderSource(id);
			else removeGdocConnection(id);
			await refresh();
			Toaster.success(t('sources.disconnected', { name }));
		} catch (error) {
			Toaster.error(errText(error));
		}
	}

	return {
		notes,
		whenStamp,
		folders,
		gdocs,
		statusBySource,
		busy,
		policy,
		setPolicy,
		pendingPush,
		setPendingPush,
		cloudActions,
		disconnectTarget,
		setDisconnectTarget,
		googleRuntimeSupported,
		googleSignedIn,
		setGoogleSignedIn,
		docInput,
		setDocInput,
		pushNoteBySource,
		setPushNoteBySource,
		connectFolder,
		pullFolder,
		startFolderPush,
		executePush,
		signInGoogle,
		createNewDoc,
		pullGdoc,
		startGdocPush,
		confirmDisconnect,
	};
}
