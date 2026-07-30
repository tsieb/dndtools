import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getContentItemsForActor, parseMarkdownNote, type ContentItemView } from '@dndtools/core';
import { Badge, Button, Dialog, Icon, Input, Select, Toaster, VisibilityChip } from '../ds';
import { Panel, T } from './screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
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
	type PushPlanNote,
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

const PULL_POLICIES = [
	{ value: 'skip', label: 'Pull: skip collisions' },
	{ value: 'overwrite', label: 'Pull: overwrite existing' },
	{ value: 'keep-both', label: 'Pull: keep both' },
];

function when(iso: string | null): string {
	if (!iso) return 'never';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return 'never';
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function slugStem(title: string, fallback: string): string {
	const stem = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return stem === '' ? fallback : stem;
}

function viewToPlanNote(note: ContentItemView): PushPlanNote {
	return {
		id: note.id,
		title: note.title,
		body: note.body,
		fields: note.fields,
		visibility: note.visibility,
	};
}

function errText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

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

	// --- local folders -----------------------------------------------------------------------

	async function connectFolder() {
		try {
			const record = await connectFolderSource();
			if (!record) return; // user cancelled the picker
			await refresh();
			setStatusFor(
				record.id,
				'Connected. Pull walks its .md files into the vault; Push writes notes back.',
			);
		} catch (error) {
			setStatusFor('connect-folder', errText(error));
		}
	}

	async function pullFolder(record: FolderSourceRecord) {
		setBusy(record.id);
		try {
			const ok = await ensureFolderPermission(record.handle, 'read');
			if (!ok) {
				setStatusFor(
					record.id,
					'Folder access was denied or revoked. Disconnect and reconnect the folder to grant it again.',
				);
				return;
			}
			const walked = await importFromFolder(record.handle);
			if (walked.fileCount === 0) {
				setStatusFor(record.id, 'No markdown (.md) files found in this folder.');
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
					`Imported ${created} new${over ? `, ${over} overwritten` : ''}${walked.truncated ? ` — stopped at ${WALK_MAX_FILES} files (partial import)` : ''}.`,
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
		if (notes.length === 0) {
			setStatusFor(record.id, 'No notes to push yet.');
			return;
		}
		setBusy(record.id);
		const ok = await ensureFolderPermission(record.handle, 'readwrite');
		setBusy(null);
		if (!ok) {
			setStatusFor(
				record.id,
				'Write access was denied or revoked. Disconnect and reconnect the folder to grant it again.',
			);
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
					firstError ??= `“${entry.title}”: ${errText(error)}`;
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
				`Pushed ${written} of ${pending.plan.entries.length} ${pending.plan.entries.length === 1 ? 'note' : 'notes'} to “${pending.label}”${firstError ? ` — first problem: ${firstError}` : '.'}`,
			);
		} finally {
			setBusy(null);
			await refresh();
		}
	}

	// --- google docs ---------------------------------------------------------------------------

	async function signInGoogle() {
		setBusy('google-auth');
		const outcome = await connectGoogleAccount();
		setBusy(null);
		if (outcome.status === 'signed-in') {
			setGoogleSignedIn(true);
			setStatusFor('google', 'Signed in. Create a Doc below, then push a note into it.');
		} else if (outcome.status === 'failed') {
			setStatusFor('google', outcome.message);
		}
		// 'redirecting' — the page is navigating away; nothing to render.
	}

	async function createNewDoc() {
		const title = docInput.trim() || 'DND Tools notes';
		setBusy('google-connect');
		try {
			const doc = await createGoogleDoc(title);
			if (!doc.documentId) throw new Error('Google returned no document id.');
			addGdocConnection(doc.documentId, doc.title ?? title);
			setDocInput('');
			setStatusFor('google', `Created “${doc.title ?? title}”. Push a note into it below.`);
			await refresh();
		} catch (error) {
			setStatusFor('google', errText(error));
		} finally {
			setBusy(null);
		}
	}

	async function pullGdoc(conn: GdocConnection) {
		setBusy(conn.docId);
		try {
			const doc = await fetchGoogleDoc(conn.docId);
			const markdown = docToMarkdown(doc);
			if (!markdown.trim()) {
				setStatusFor(conn.docId, 'The Doc is empty — nothing to import.');
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
					`Imported ${created} new${over ? `, ${over} overwritten` : ''} from the Doc.`,
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
			setStatusFor(conn.docId, 'Pick which note to push into this Doc first.');
			return;
		}
		if (!isGoogleSignedIn()) {
			setGoogleSignedIn(false);
			setStatusFor(conn.docId, 'Google sign-in expired — sign in again to push.');
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
			Toaster.success(`Disconnected “${name}”`);
		} catch (error) {
			Toaster.error(errText(error));
		}
	}

	// --- render ---------------------------------------------------------------------------------

	const fsSupported = isFsSourceSupported();
	const noteOptions = [
		{ value: '', label: 'Choose a note…' },
		...notes.map((n) => ({ value: n.id, label: n.title })),
	];

	return (
		<Panel
			title="Connected sources"
			action={
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<Select
						aria-label="Import collision policy"
					options={PULL_POLICIES}
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
							Connect folder…
						</Button>
					)}
				</div>
			}
			style={{ marginBottom: 14 }}
		>
			<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
				Pull imports Markdown into your campaign. Push writes selected notes back to their source,
				and asks for confirmation before a format change could leave out structured details.
			</div>

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
							? `Pushing to “${pendingPush.label}” loses some formatting on ${pendingPush.plan.lossyEntries.length} of ${pendingPush.plan.entries.length} ${pendingPush.plan.entries.length === 1 ? 'note' : 'notes'}`
							: `Push a DM-only note to “${pendingPush.label}”?`
					}
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setPendingPush(null)}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon="check"
								disabled={busy !== null}
								onClick={() => void executePush(pendingPush)}
							>
								{pendingPush.plan.requiresAcknowledgment
									? 'Acknowledge loss & push'
									: 'Push anyway'}
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
									This note is DM-only. Pushing copies it into an external Google Doc — anyone that
									document is shared with can read it there.
								</span>
							</div>
						)}
						<div style={{ font: `12px/1.6 ${T.sans}`, color: T.sub }}>
							{pendingPush.plan.droppedFeatures.length > 0 && (
								<>
									Dropped (cannot be represented): {pendingPush.plan.droppedFeatures.join(', ')}
									.{' '}
								</>
							)}
							{pendingPush.plan.lossyFeatures.length > 0 && (
								<>Downgraded: {pendingPush.plan.lossyFeatures.join(', ')}. </>
							)}
							Your notes in the vault are untouched either way.
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
					title={`Disconnect “${disconnectTarget.name}”?`}
					description={
						disconnectTarget.kind === 'folder'
							? 'This can’t be undone — reconnecting means picking the folder and granting access again.'
							: 'The Doc itself and your vault notes are untouched.'
					}
					footer={
						<>
							<Button variant="ghost" size="sm" onClick={() => setDisconnectTarget(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="trash"
								onClick={() => void confirmDisconnect()}
							>
								Disconnect
							</Button>
						</>
					}
				>
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.sub }}>
						{disconnectTarget.kind === 'folder'
							? 'Disconnecting forgets the saved folder connection and its access permission. Notes already in the vault and the files in the folder stay exactly as they are.'
							: 'This removes only the saved connection — you can reconnect the Doc later by pasting its URL or id.'}
					</div>
				</Dialog>
			)}

			{/* Local folders (File System Access API — Chromium only; hidden as an affordance elsewhere) */}
			{!fsSupported && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					This browser cannot connect a local folder. Use the desktop app or a supported Chromium
					browser instead.
				</div>
			)}
			{statusBySource['connect-folder'] && (
				<div style={{ font: `12px ${T.sans}`, color: T.err }}>
					{statusBySource['connect-folder']}
				</div>
			)}
			{folders.map((record, i) => (
				<div key={record.id} style={{ display: 'flex', flexDirection: 'column' }}>
					<SourceRow
						icon="vault"
						name={record.name}
						meta={`Local folder · pulled ${when(record.lastImportAt)} · pushed ${when(record.lastWriteAt)}`}
						badge={<Badge status="success">connected</Badge>}
						first={i === 0}
					>
						<Button
							variant="secondary"
							size="sm"
							icon="import"
							disabled={busy !== null}
							onClick={() => void pullFolder(record)}
						>
							Pull notes
						</Button>
						<Button
							variant="secondary"
							size="sm"
							icon="send"
							disabled={busy !== null}
							onClick={() => void startFolderPush(record)}
						>
							Push notes
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
							Disconnect
						</Button>
					</SourceRow>
					{statusBySource[record.id] && (
						<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, paddingBottom: 8 }}>
							{statusBySource[record.id]}
						</div>
					)}
				</div>
			))}
			{fsSupported && folders.length === 0 && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					No folders connected yet. Connect an Obsidian vault or any markdown folder.
				</div>
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
					<div style={{ font: `600 12.5px ${T.sans}`, color: T.ink, flex: 1 }}>Google Docs</div>
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
								Sign out
							</Button>
						) : (
							<Button
								variant="secondary"
								size="sm"
								disabled={busy !== null}
								onClick={() => void signInGoogle()}
							>
								Sign in with Google
							</Button>
						))}
				</div>
				{!isGoogleDocsConfigured ? (
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
						Google Docs connections are not available in this release. Local folders and files
						remain available above.
					</div>
				) : !googleRuntimeSupported ? (
					<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
						Google Docs connections are currently available in the web app. Desktop authorization
						will arrive in a future release.
					</div>
				) : (
					<>
						{!googleSignedIn && (
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
								Sign in to connect Docs. Access uses the per-file{' '}
								<code style={{ fontFamily: T.mono }}>drive.file</code> scope — only Docs created
								here are reachable.
							</div>
						)}
						<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
							<Input
								aria-label="Title for a new Google Doc"
								value={docInput}
								onChange={(e: { target: { value: string } }) => setDocInput(e.target.value)}
								placeholder="Title for a new Google Doc"
								style={{ flex: 1, minWidth: 220 }}
							/>
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={busy !== null || !googleSignedIn}
								onClick={() => void createNewDoc()}
							>
								Create new Doc
							</Button>
						</div>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							Existing Docs cannot be connected in this release because the limited Google scope
							requires a Picker grant. DND Tools does not request broader Drive access.
						</div>
						{statusBySource['google'] && (
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
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
										meta={`Google Doc · pulled ${when(conn.lastPullAt)} · pushed ${when(conn.lastPushAt)}`}
										badge={
											<Badge status={googleSignedIn ? 'success' : 'warning'}>
												{googleSignedIn ? 'connected' : 'needs sign-in'}
											</Badge>
										}
										first={i === 0}
									>
										<Select
											// One picker per connected doc — unnamed, they were indistinguishable.
										aria-label={`Note to push to ${conn.title}`}
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
											Pull notes
										</Button>
										<Button
											variant="secondary"
											size="sm"
											icon="send"
											disabled={busy !== null}
											onClick={() => startGdocPush(conn)}
										>
											Push notes
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
											Disconnect
										</Button>
									</SourceRow>
									{statusBySource[conn.docId] && (
										<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub, paddingBottom: 8 }}>
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
