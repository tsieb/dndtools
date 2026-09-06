import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Dialog, EmptyState, Icon, Skeleton, Toaster } from '../../ds';
import { LoadingRegion, Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
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
	const { t, formatDate } = useI18n();
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
		iso ? formatDate(new Date(iso), { month: 'short', day: 'numeric' }) : t('settings.vault.never');
	const disconnectFolder = (f: FolderSourceRecord) => {
		void disconnectFolderSource(f.id)
			.then(listFolderSources)
			.then((list) => {
				setFolders(list);
				setPendingDisconnect(null);
				Toaster.success(t('settings.vault.folderDisconnected', { name: f.name }));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.vault.disconnectFailed'))));
	};
	const disconnectGdoc = (g: GdocConnection) => {
		// Connection metadata is all a Google Doc row holds, so removal is cleanly undoable in place.
		removeGdocConnection(g.docId);
		setGdocs(listGdocConnections());
		Toaster.success(t('settings.vault.docDisconnected', { name: g.title }), {
			action: t('common.action.undo'),
			onAction: () => {
				addGdocConnection(g.docId, g.title);
				setGdocs(listGdocConnections());
				Toaster.success(t('settings.vault.docReconnected', { name: g.title }));
			},
		});
	};
	const loading = folders === null;
	// The folder name is emphasised mid-sentence, so format the whole sentence and split it around
	// that value rather than freezing English word order into two fragments.
	const disconnectName = pendingDisconnect?.name ?? '';
	const disconnectSentence = t('settings.vault.disconnectBody', { name: disconnectName });
	const [disconnectBefore, disconnectAfter = ''] = disconnectSentence.split(disconnectName);
	const rows = [
		...(folders ?? []).map((f) => ({
			key: `folder-${f.id}`,
			name: f.name,
			kind: t('settings.vault.kindFolder'),
			meta: t('settings.vault.pulledPushed', {
				pulled: when(f.lastImportAt),
				pushed: when(f.lastWriteAt),
			}),
			disconnect: () => setPendingDisconnect(f),
		})),
		...gdocs.map((g) => ({
			key: `gdoc-${g.docId}`,
			name: g.title,
			kind: t('settings.vault.kindDoc'),
			meta: t('settings.vault.pulledPushed', {
				pulled: when(g.lastPullAt),
				pushed: when(g.lastPushAt),
			}),
			disconnect: () => disconnectGdoc(g),
		})),
	];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title={t('settings.vault.title')}
				action={
					<Button
						variant="secondary"
						size="sm"
						icon="import"
						onClick={() => navigate('/knowledge')}
					>
						{t('settings.vault.manageInKnowledge')}
					</Button>
				}
			>
				{/* Real WS-7 source registry (fsSource + googleDocs) — import/write-back actions live in the
				    Knowledge → Sources panel, which dispatches content.commit-import / content.write-to-source. */}
				{loading ? (
					<LoadingRegion
						label={t('settings.vault.loading')}
						style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
					>
						<Skeleton height={52} />
						<Skeleton height={52} />
					</LoadingRegion>
				) : foldersFailed ? (
					<EmptyState
						inset
						icon="warning"
						title={t('settings.vault.readFailedTitle')}
						description={t('settings.vault.readFailedBody')}
						action={
							<Button variant="secondary" size="sm" icon="retry" onClick={loadFolders}>
								{t('settings.vault.tryAgain')}
							</Button>
						}
					/>
				) : rows.length === 0 ? (
					<EmptyState
						inset
						icon="vault"
						title={t('settings.vault.emptyTitle')}
						description={t(
							isGoogleDocsConfigured
								? 'settings.vault.emptyBodyWithDocs'
								: 'settings.vault.emptyBody',
						)}
						action={
							<Button
								variant="secondary"
								size="sm"
								icon="import"
								onClick={() => navigate('/knowledge')}
							>
								{t('settings.vault.openSources')}
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
								<Badge status="success">{t('settings.vault.connected')}</Badge>
								<Button variant="ghost" size="sm" icon="trash" onClick={s.disconnect}>
									{t('settings.vault.disconnect')}
								</Button>
							</div>
						))}
					</div>
				)}
				<Dialog
					open={pendingDisconnect !== null}
					onClose={() => setPendingDisconnect(null)}
					title={t('settings.vault.disconnectTitle')}
					description={t('settings.vault.disconnectDescription')}
					tone="danger"
					size="sm"
					footer={
						<>
							<Button variant="secondary" size="sm" onClick={() => setPendingDisconnect(null)}>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="trash"
								onClick={() => pendingDisconnect && disconnectFolder(pendingDisconnect)}
							>
								{t('settings.vault.disconnect')}
							</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{disconnectBefore}
						<strong style={{ color: T.ink }}>{disconnectName}</strong>
						{disconnectAfter}
					</div>
				</Dialog>
				{!isFsSourceSupported() && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						{t('settings.vault.noFolderSupport')}
					</div>
				)}
				{!isGoogleDocsConfigured && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						{t('settings.vault.noGoogleDocs')}
					</div>
				)}
			</Panel>
		</div>
	);
}
