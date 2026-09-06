import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getContentItemsForActor, parseMarkdownNote } from '@dndtools/core';
import { Badge, Button, Dialog, Icon, Input, Select, Toaster, VisibilityChip } from '../ds';
import { Panel, T } from './screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useI18n } from '../i18n';
import { PULL_POLICIES, errText, slugStem, viewToPlanNote, when } from './connectedSourcesVocab';
import {
	WALK_MAX_FILES,
	connectFolderSource,
	disconnectFolderSource,
	ensureFolderPermission,
	importFromFolder,
	isFsSourceSupported,
	listFolderSources,
	planNotesPush,
	touchFolderSource,
	writeBack,
	type FolderSourceRecord,
	type PushPlan,
} from '../platform/fsSource';
import {
	addGdocConnection,
	connectGoogleAccount,
	createGoogleDoc,
	docToMarkdown,
	fetchGoogleDoc,
	isGoogleDocsConfigured,
	isGoogleDocsRuntimeSupported,
	isGoogleSignedIn,
	listGdocConnections,
	pushMarkdownToDoc,
	removeGdocConnection,
	signOutGoogle,
	touchGdocConnection,
	type GdocConnection,
} from '../cloud/googleDocs';

/**
 * ConnectedSources — the vault-source panel (WS-7, product decision E): LOCAL FOLDERS via the File
 * System Access API (Chromium; the affordance is hidden elsewhere) and GOOGLE DOCS via the GIS token
 * (hidden fail-closed until `VITE_GOOGLE_CLIENT_ID` is configured — see the setup runbook).
 *
 * Every source row offers PULL (source → `content.commit-import`, the core's transactional import)
 * and PUSH (per note: `content.write-to-source`, the CONTENT-012 authority gate — only an ACCEPTED
 * dispatch's emitted `content.written-to-source` event triggers the byte/API transport here). A
 * lossy push is confirmed up front with the plan's union loss summary; each item still carries its
 * own acknowledgment token, so the core re-checks per item.
 */

interface PendingPush {
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
interface DisconnectTarget {
	kind: 'folder' | 'gdoc';
	id: string;
	name: string;
}

function SourceRow({
	icon,
	name,
	meta,
	badge,
	children,
	first,
}: {
	icon: string;
	name: string;
	meta: string;
	badge?: ReactNode;
	children?: ReactNode;
	first?: boolean;
}) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '12px 0',
				borderTop: first ? 'none' : `1px solid ${T.bd}`,
				flexWrap: 'wrap',
			}}
		>
			<span
				style={{
					width: 36,
					height: 36,
					borderRadius: 8,
					background: T.alt,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: T.acc,
					flex: '0 0 auto',
				}}
			>
				<Icon name={icon} size={18} />
			</span>
			<div style={{ flex: 1, minWidth: 180 }}>
				<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{name}</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{meta}</div>
			</div>
			{badge}
			{children}
		</div>
	);
}

export function ConnectedSourcesPanel() {
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
	// Every operation below writes its outcome to the SAME key it just read, so leaving the previous
	// line up made a retry look like a dead button whenever the new outcome text was identical
	// ("Folder access was denied or revoked" twice in a row is indistinguishable from nothing
	// happening). `connectFolder` already clears its key; this is that idiom, reusable.
	const clearStatusFor = (key: string) =>
		setStatusBySource((prev) => {
			if (!(key in prev)) return prev;
			const next = { ...prev };
			delete next[key];
			return next;
		});

	// --- local folders -----------------------------------------------------------------------

	async function connectFolder() {
		// Nothing ever deleted this key — one picker failure pinned a red line above the folder list
		// for the life of the panel, including after a later connect succeeded (which writes to
		// `record.id`, a different key).
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
			const result = await runtime.dispatch({
				type: 'content.commit-import',
				actorId,
				payload: {
					sourceKind: 'markdown-archive',
					policy,
					files: walked.files,
					appliedEntryIds: [],
				},
			});
			if (result.status === 'accepted') {
				const ev = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.import-committed',
				) as { createdItemIds?: string[]; overwrittenItemIds?: string[] } | undefined;
				const created = ev?.createdItemIds?.length ?? 0;
				const over = ev?.overwrittenItemIds?.length ?? 0;
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

	// --- push execution (core gate first, transport second) -----------------------------------

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
					firstError ??= `“${entry.title}”: this note couldn’t be prepared for the push — try again.`;
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
			// `runtime.dispatch` THROWS on a persist failure, so without this the loop escaped before
			// the status line was written: the row went from busy back to idle saying nothing at all,
			// after some notes had already been written to disk. The three sibling paths all catch.
			setStatusFor(pending.sourceKey, errText(error));
		} finally {
			setBusy(null);
			await refresh();
		}
	}

	// --- google docs ---------------------------------------------------------------------------

	async function signInGoogle() {
		// `busy` is a single panel-wide slot and EVERY control here is `disabled={busy !== null}`, so
		// an unsettled await froze the whole panel until remount with nothing on screen to explain it.
		// The GIS promise only settles from its callback/error_callback, so a consent popup the user
		// simply leaves open never resolves — `finally` is what makes that recoverable.
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
		const title = docInput.trim() || 'Lamplight notes';
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
			const result = await runtime.dispatch({
				type: 'content.commit-import',
				actorId,
				payload: {
					sourceKind: 'markdown-archive',
					policy,
					files: [{ path: `google-docs/${slugStem(title, conn.docId)}.md`, text: markdown }],
					appliedEntryIds: [],
				},
			});
			if (result.status === 'accepted') {
				const ev = result.events.find(
					(e) => (e as { kind?: string }).kind === 'content.import-committed',
				) as { createdItemIds?: string[]; overwrittenItemIds?: string[] } | undefined;
				const created = ev?.createdItemIds?.length ?? 0;
				const over = ev?.overwrittenItemIds?.length ?? 0;
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

	// --- disconnect (both source kinds confirm first; a folder disconnect is not undoable) --------

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

	// --- render ---------------------------------------------------------------------------------

	const fsSupported = isFsSourceSupported();
	const noteOptions = [
		{ value: '', label: t('sources.chooseNote') },
		...notes.map((n) => ({ value: n.id, label: n.title })),
	];

	return (
		<Panel
			title={t('sources.title')}
			action={
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<Select
						aria-label={t('sources.policyLabel')}
						options={PULL_POLICIES.map((option) => ({
							value: option.value,
							label: t(option.label),
						}))}
						value={policy}
						onChange={(e: { target: { value: string } }) => setPolicy(e.target.value)}
					/>
					{fsSupported && (
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							disabled={busy !== null}
							onClick={() => void connectFolder()}
						>
							{t('sources.connectFolder')}
						</Button>
					)}
				</div>
			}
			style={{ marginBottom: 14 }}
		>
			<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>{t('sources.intro')}</div>

			{/* Push confirm — a data-writing gate, so it gets the DS Dialog's modal contract (focus-in,
			    Tab trap, Escape, focus return) instead of an inline card that can scroll off-screen.
			    The per-item acknowledgment-token logic in executePush is untouched (core contract). */}
			{pendingPush && (
				<Dialog
					open
					onClose={() => setPendingPush(null)}
					tone="warning"
					size="sm"
					title={
						pendingPush.plan.requiresAcknowledgment
							? t('sources.pushLossyTitle', {
									label: pendingPush.label,
									lossy: pendingPush.plan.lossyEntries.length,
									total: pendingPush.plan.entries.length,
								})
							: t('sources.pushDmOnlyTitle', { label: pendingPush.label })
					}
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setPendingPush(null)}>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon="check"
								disabled={busy !== null}
								onClick={() => void executePush(pendingPush)}
							>
								{pendingPush.plan.requiresAcknowledgment
									? t('sources.acknowledgePush')
									: t('sources.pushAnyway')}
							</Button>
						</>
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{pendingPush.dmOnlyToExternal && (
							<div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
								<VisibilityChip level="dm-only" compact />
								<span
									style={{ font: `12px/1.6 ${T.sans}`, color: 'var(--color-status-warning-text)' }}
								>
									{t('sources.dmOnlyWarning')}
								</span>
							</div>
						)}
						<div style={{ font: `12px/1.6 ${T.sans}`, color: T.sub }}>
							{pendingPush.plan.droppedFeatures.length > 0 && (
								<>
									{t('sources.dropped', {
										features: pendingPush.plan.droppedFeatures.join(', '),
									})}{' '}
								</>
							)}
							{pendingPush.plan.lossyFeatures.length > 0 && (
								<>
									{t('sources.downgraded', {
										features: pendingPush.plan.lossyFeatures.join(', '),
									})}{' '}
								</>
							)}
							{t('sources.vaultUntouched')}
						</div>
					</div>
				</Dialog>
			)}

			{/* Disconnect confirm — honest copy: a folder disconnect deletes the persisted handle and
			    CANNOT be undone (reconnect = re-pick + permission re-grant); a Doc disconnect only
			    forgets the connection. */}
			{disconnectTarget && (
				<Dialog
					open
					onClose={() => setDisconnectTarget(null)}
					tone="danger"
					size="sm"
					title={t('sources.disconnectTitle', { name: disconnectTarget.name })}
					description={
						disconnectTarget.kind === 'folder'
							? t('sources.disconnectFolderDesc')
							: t('sources.disconnectDocDesc')
					}
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setDisconnectTarget(null)}>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="trash"
								onClick={() => void confirmDisconnect()}
							>
								{t('sources.disconnect')}
							</Button>
						</>
					}
				>
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.sub }}>
						{disconnectTarget.kind === 'folder'
							? t('sources.disconnectFolderBody')
							: t('sources.disconnectDocBody')}
					</div>
				</Dialog>
			)}

			{/* Local folders (File System Access API — Chromium only; hidden as an affordance elsewhere) */}
			{!fsSupported && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('sources.noFsSupport')}</div>
			)}
			{statusBySource['connect-folder'] && (
				// The only status block in this file without a live region.
				<div role="status" style={{ font: `12px ${T.sans}`, color: T.err }}>
					{statusBySource['connect-folder']}
				</div>
			)}
			{folders.map((record, i) => (
				<div key={record.id} style={{ display: 'flex', flexDirection: 'column' }}>
					<SourceRow
						icon="vault"
						name={record.name}
						meta={t('sources.folderMeta', {
							pulled: whenStamp(record.lastImportAt),
							pushed: whenStamp(record.lastWriteAt),
						})}
						badge={<Badge status="success">{t('sources.connected')}</Badge>}
						first={i === 0}
					>
						<Button
							variant="secondary"
							size="sm"
							icon="import"
							disabled={busy !== null}
							onClick={() => void pullFolder(record)}
						>
							{t('sources.pullNotes')}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							icon="send"
							disabled={busy !== null}
							onClick={() => void startFolderPush(record)}
						>
							{t('sources.pushNotes')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon="trash"
							disabled={busy !== null}
							onClick={() =>
								setDisconnectTarget({ kind: 'folder', id: record.id, name: record.name })
							}
						>
							{t('sources.disconnect')}
						</Button>
					</SourceRow>
					{statusBySource[record.id] && (
						// Pull/push/connect outcomes land here; without a live region a screen-reader user
						// never learns whether the sync succeeded, partially succeeded, or failed.
						<div
							role="status"
							aria-live="polite"
							style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, paddingBottom: 8 }}
						>
							{statusBySource[record.id]}
						</div>
					)}
				</div>
			))}
			{fsSupported && folders.length === 0 && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('sources.noFolders')}</div>
			)}

			{/* Google Docs is enabled only when this build and runtime can complete GIS authorization. */}
			<div
				style={{
					borderTop: `1px solid ${T.bd}`,
					paddingTop: 12,
					display: 'flex',
					flexDirection: 'column',
					gap: 10,
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink, flex: 1 }}>
						{t('sources.googleDocs')}
					</div>
					{isGoogleDocsConfigured &&
						googleRuntimeSupported &&
						(googleSignedIn ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									signOutGoogle();
									setGoogleSignedIn(false);
								}}
							>
								{t('sources.signOut')}
							</Button>
						) : (
							<Button
								variant="secondary"
								size="sm"
								disabled={busy !== null}
								onClick={() => void signInGoogle()}
							>
								{t('sources.signInGoogle')}
							</Button>
						))}
				</div>
				{!isGoogleDocsConfigured ? (
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
						{t('sources.googleUnavailable')}
					</div>
				) : !googleRuntimeSupported ? (
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
						{t('sources.googleWebOnly')}
					</div>
				) : (
					<>
						{!googleSignedIn && (
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
								{t('sources.scopeBefore')} <code style={{ fontFamily: T.mono }}>drive.file</code>{' '}
								{t('sources.scopeAfter')}
							</div>
						)}
						<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
							<Input
								aria-label={t('sources.newDocTitle')}
								value={docInput}
								onChange={(e: { target: { value: string } }) => setDocInput(e.target.value)}
								placeholder={t('sources.newDocTitle')}
								style={{ flex: 1, minWidth: 220 }}
							/>
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={busy !== null || !googleSignedIn}
								onClick={() => void createNewDoc()}
							>
								{t('sources.createDoc')}
							</Button>
						</div>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							{t('sources.existingDocsNote')}
						</div>
						{statusBySource['google'] && (
							<div
								role="status"
								aria-live="polite"
								style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}
							>
								{statusBySource['google']}
							</div>
						)}
						{gdocs.map((conn, i) => {
							const pushNote = notes.find((n) => n.id === pushNoteBySource[conn.docId]) ?? null;
							return (
								<div key={conn.docId} style={{ display: 'flex', flexDirection: 'column' }}>
									<SourceRow
										icon="knowledge-book"
										name={conn.title}
										meta={t('sources.docMeta', {
											pulled: whenStamp(conn.lastPullAt),
											pushed: whenStamp(conn.lastPushAt),
										})}
										badge={
											<Badge status={googleSignedIn ? 'success' : 'warning'}>
												{googleSignedIn ? t('sources.connected') : t('sources.needsSignIn')}
											</Badge>
										}
										first={i === 0}
									>
										<Select
											// One picker per connected doc — unnamed, they were indistinguishable.
											aria-label={t('sources.noteToPushTo', { title: conn.title })}
											options={noteOptions}
											value={pushNoteBySource[conn.docId] ?? ''}
											onChange={(e: { target: { value: string } }) =>
												setPushNoteBySource((prev) => ({ ...prev, [conn.docId]: e.target.value }))
											}
										/>
										{/* The selected note's visibility, visible BEFORE pushing — a dm-only note headed
									    for an external Doc should never be a surprise. */}
										{pushNote && (
											<VisibilityChip
												level={pushNote.visibility === 'dm-only' ? 'dm-only' : 'players'}
												compact
											/>
										)}
										<Button
											variant="secondary"
											size="sm"
											icon="import"
											disabled={busy !== null}
											onClick={() => void pullGdoc(conn)}
										>
											{t('sources.pullNotes')}
										</Button>
										<Button
											variant="secondary"
											size="sm"
											icon="send"
											disabled={busy !== null}
											onClick={() => startGdocPush(conn)}
										>
											{t('sources.pushNotes')}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											icon="trash"
											disabled={busy !== null}
											onClick={() =>
												setDisconnectTarget({ kind: 'gdoc', id: conn.docId, name: conn.title })
											}
										>
											{t('sources.disconnect')}
										</Button>
									</SourceRow>
									{statusBySource[conn.docId] && (
										<div
											role="status"
											aria-live="polite"
											style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, paddingBottom: 8 }}
										>
											{statusBySource[conn.docId]}
										</div>
									)}
								</div>
							);
						})}
					</>
				)}
			</div>
		</Panel>
	);
}
