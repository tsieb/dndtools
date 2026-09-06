import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, EmptyState, Icon, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import {
	isFsSourceSupported,
	listFolderSources,
	disconnectFolderSource,
	type FolderSourceRecord,
} from '../../platform/fsSource';
import {
	addGdocConnection,
	isGoogleDocsConfigured,
	listGdocConnections,
	removeGdocConnection,
	type GdocConnection,
} from '../../cloud/googleDocs';
import { errMsg } from './shared';
/* ---- Vault (REAL — the connected-source registry; pull/push/manage lives in Knowledge → Sources) ---- */
export function SettingsVault() {
	const navigate = useNavigate();
	// null = the async folder-source listing hasn't resolved yet — without this sentinel the panel
	// flashes "No sources connected" for a beat on every open.
	const [folders, setFolders] = useState<FolderSourceRecord[] | null>(null);
	const [gdocs, setGdocs] = useState<GdocConnection[]>([]);
	// Folder disconnect drops a granted directory handle that can only come back through the OS
	// picker — no clean undo — so it confirms first. (Google Docs rows undo via their toast instead.)
	const [pendingDisconnect, setPendingDisconnect] = useState<FolderSourceRecord | null>(null);
	// `folders === null` doubles as the loading sentinel, so a REJECTED listing left the panel
	// shimmering two skeletons for ever — a fake "Loading…" with no way out. Failure is its own state.
	const [foldersFailed, setFoldersFailed] = useState(false);
	const loadFolders = useCallback(() => {
		setFoldersFailed(false);
		setFolders(null);
		void listFolderSources()
			.then(setFolders)
			.catch(() => {
				setFoldersFailed(true);
				setFolders([]);
			});
	}, []);
	useEffect(() => {
		loadFolders();
		setGdocs(listGdocConnections());
	}, [loadFolders]);
	const when = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never';
	const disconnectFolder = (f: FolderSourceRecord) => {
		void disconnectFolderSource(f.id)
			.then(listFolderSources)
			.then((list) => {
				setFolders(list);
				setPendingDisconnect(null);
				Toaster.success(
					`“${f.name}” disconnected — reconnect it any time from Knowledge → Sources.`,
				);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not disconnect that folder.')));
	};
	const disconnectGdoc = (g: GdocConnection) => {
		// Connection metadata is all a Google Doc row holds, so removal is cleanly undoable in place.
		removeGdocConnection(g.docId);
		setGdocs(listGdocConnections());
		Toaster.success(`“${g.title}” disconnected.`, {
			action: 'Undo',
			onAction: () => {
				addGdocConnection(g.docId, g.title);
				setGdocs(listGdocConnections());
				Toaster.success(`“${g.title}” reconnected.`);
			},
		});
	};
	const loading = folders === null;
	const rows = [
		...(folders ?? []).map((f) => ({
			key: `folder-${f.id}`,
			name: f.name,
			kind: 'Local folder',
			meta: `pulled ${when(f.lastImportAt)} · pushed ${when(f.lastWriteAt)}`,
			disconnect: () => setPendingDisconnect(f),
		})),
		...gdocs.map((g) => ({
			key: `gdoc-${g.docId}`,
			name: g.title,
			kind: 'Google Doc',
			meta: `pulled ${when(g.lastPullAt)} · pushed ${when(g.lastPushAt)}`,
			disconnect: () => disconnectGdoc(g),
		})),
	];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title="Vault connections"
				action={
					<Button
						variant="secondary"
						size="sm"
						icon="import"
						onClick={() => navigate('/knowledge')}
					>
						Manage in Knowledge
					</Button>
				}
			>
				{/* Real WS-7 source registry (fsSource + googleDocs) — import/write-back actions live in the
				    Knowledge → Sources panel, which dispatches content.commit-import / content.write-to-source. */}
				{loading ? (
					<LoadingRegion
						label="Loading vault connections"
						style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
					>
						<Skeleton height={52} />
						<Skeleton height={52} />
					</LoadingRegion>
				) : foldersFailed ? (
					<EmptyState
						inset
						icon="warning"
						title="Could not read your connected folders"
						description="The vault's source registry did not answer. Your connections are still stored — this is only the listing."
						action={
							<Button variant="secondary" size="sm" icon="retry" onClick={loadFolders}>
								Try again
							</Button>
						}
					/>
				) : rows.length === 0 ? (
					<EmptyState
						inset
						icon="vault"
						title="No sources connected"
						description={`Connect a local markdown folder${isGoogleDocsConfigured ? ' or a Google Doc' : ''} from Knowledge → Sources; pull and push live there too.`}
						action={
							<Button
								variant="secondary"
								size="sm"
								icon="import"
								onClick={() => navigate('/knowledge')}
							>
								Open Knowledge → Sources
							</Button>
						}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{rows.map((s, i) => (
							<div
								key={s.key}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '12px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
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
									<Icon name="vault" size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{s.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{s.kind} · {s.meta}
									</div>
								</div>
								<Badge status="success">connected</Badge>
								<Button variant="ghost" size="sm" icon="trash" onClick={s.disconnect}>
									Disconnect
								</Button>
							</div>
						))}
					</div>
				)}
				<Dialog
					open={pendingDisconnect !== null}
					onClose={() => setPendingDisconnect(null)}
					title="Disconnect this folder?"
					description="The folder and everything already imported stay untouched."
					tone="danger"
					size="sm"
					footer={
						<>
							<Button variant="secondary" size="sm" onClick={() => setPendingDisconnect(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="trash"
								onClick={() => pendingDisconnect && disconnectFolder(pendingDisconnect)}
							>
								Disconnect
							</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Disconnecting <strong style={{ color: T.ink }}>{pendingDisconnect?.name}</strong> drops
						this app’s permission to the folder. Nothing on disk or in your vault is deleted — but
						reconnecting means picking the folder again in Knowledge → Sources.
					</div>
				</Dialog>
				{!isFsSourceSupported() && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						This browser cannot connect a local folder. Use the desktop app or a supported Chromium
						browser instead.
					</div>
				)}
				{!isGoogleDocsConfigured && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						Google Docs connections aren’t available in this edition.
					</div>
				)}
			</Panel>
		</div>
	);
}
