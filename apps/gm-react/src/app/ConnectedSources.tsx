import type { ReactNode } from 'react';
import { Badge, Button, Dialog, Icon, Input, Select, VisibilityChip } from '../ds';
import { Panel, T } from './screen-kit';
import { useI18n } from '../i18n';
import { PULL_POLICIES, useConnectedSources } from './connectedSourcesVocab';
import { isFsSourceSupported } from '../platform/fsSource';
import { isGoogleDocsConfigured, signOutGoogle } from '../cloud/googleDocs';
import { CloudOfflineNotice } from '../cloud/offline';

/**
 * ConnectedSources — the vault-source panel (WS-7, product decision E): LOCAL FOLDERS via the File
 * System Access API (Chromium; the affordance is hidden elsewhere) and GOOGLE DOCS via the GIS token
 * (hidden fail-closed until `VITE_GOOGLE_CLIENT_ID` is configured — see the setup runbook).
 *
 * This file renders; `useConnectedSources` (connectedSourcesVocab.ts) owns the pull/push flow and
 * its CONTENT-012 authority gate.
 */

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
				gap: T.space.three,
				padding: `${T.space.three} ${T.space.zero}`,
				borderTop: first ? 'none' : `1px solid ${T.bd}`,
				flexWrap: 'wrap',
			}}
		>
			<span
				style={{
					width: 36,
					height: 36,
					borderRadius: T.radius.md,
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
				<div style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}>{name}</div>
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>{meta}</div>
			</div>
			{badge}
			{children}
		</div>
	);
}

/**
 * One row's operation outcome. The region stays mounted so a screen reader hears each new outcome
 * (a live region inserted together with its text is often skipped); it takes no space while empty.
 */
function StatusLine({ message, tone }: { message?: string; tone?: 'error' }) {
	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				font: `var(--text-xs)/1.5 ${T.sans}`,
				color: tone === 'error' ? T.err : T.sub,
				paddingBottom: message ? T.space.two : T.space.zero,
			}}
		>
			{message}
		</div>
	);
}

export function ConnectedSourcesPanel() {
	const {
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
	} = useConnectedSources();
	const { t } = useI18n();

	const fsSupported = isFsSourceSupported();
	const noteOptions = [
		{ value: '', label: t('sources.chooseNote') },
		...notes.map((n) => ({ value: n.id, label: n.title })),
	];

	return (
		<Panel
			title={t('sources.title')}
			action={
				<div style={{ display: 'flex', gap: T.space.two, alignItems: 'center' }}>
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
			style={{ marginBottom: T.space.four }}
		>
			<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>{t('sources.intro')}</div>

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
								{...(pendingPush.kind === 'gdoc' ? cloudActions.offlineProps : {})}
								onClick={() => void executePush(pendingPush)}
							>
								{pendingPush.plan.requiresAcknowledgment
									? t('sources.acknowledgePush')
									: t('sources.pushAnyway')}
							</Button>
						</>
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.three }}>
						{pendingPush.dmOnlyToExternal && (
							<div style={{ display: 'flex', alignItems: 'flex-start', gap: T.space.two }}>
								<VisibilityChip level="dm-only" compact />
								<span
									style={{
										font: `var(--text-xs)/1.6 ${T.sans}`,
										color: 'var(--color-status-warning-text)',
									}}
								>
									{t('sources.dmOnlyWarning')}
								</span>
							</div>
						)}
						<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
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
					<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
						{disconnectTarget.kind === 'folder'
							? t('sources.disconnectFolderBody')
							: t('sources.disconnectDocBody')}
					</div>
				</Dialog>
			)}

			{/* Local folders (File System Access API — Chromium only; hidden as an affordance elsewhere) */}
			{!fsSupported && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
					{t('sources.noFsSupport')}
				</div>
			)}
			<StatusLine message={statusBySource['connect-folder']} tone="error" />
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
					<StatusLine message={statusBySource[record.id]} />
				</div>
			))}
			{fsSupported && folders.length === 0 && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
					{t('sources.noFolders')}
				</div>
			)}

			{/* Google Docs is enabled only when this build and runtime can complete GIS authorization. */}
			<div
				style={{
					borderTop: `1px solid ${T.bd}`,
					paddingTop: T.space.three,
					display: 'flex',
					flexDirection: 'column',
					gap: T.space.three,
				}}
			>
				{isGoogleDocsConfigured && <CloudOfflineNotice body="cloud.offline.docs" />}
				<div style={{ display: 'flex', alignItems: 'center', gap: T.space.three }}>
					<div style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink, flex: 1 }}>
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
								{...cloudActions.offlineProps}
								onClick={() => void signInGoogle()}
							>
								{t('sources.signInGoogle')}
							</Button>
						))}
				</div>
				{!isGoogleDocsConfigured ? (
					<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
						{t('sources.googleUnavailable')}
					</div>
				) : !googleRuntimeSupported ? (
					<div style={{ font: `var(--text-xs)/1.6 ${T.sans}`, color: T.sub }}>
						{t('sources.googleWebOnly')}
					</div>
				) : (
					<>
						{!googleSignedIn && (
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('sources.scopeBefore')} <code style={{ fontFamily: T.mono }}>drive.file</code>{' '}
								{t('sources.scopeAfter')}
							</div>
						)}
						<div
							style={{ display: 'flex', gap: T.space.two, alignItems: 'center', flexWrap: 'wrap' }}
						>
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
								{...cloudActions.offlineProps}
								onClick={() => void createNewDoc()}
							>
								{t('sources.createDoc')}
							</Button>
						</div>
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
							{t('sources.existingDocsNote')}
						</div>
						<StatusLine message={statusBySource['google']} />
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
											{...cloudActions.offlineProps}
											onClick={() => void pullGdoc(conn)}
										>
											{t('sources.pullNotes')}
										</Button>
										<Button
											variant="secondary"
											size="sm"
											icon="send"
											disabled={busy !== null}
											{...cloudActions.offlineProps}
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
									<StatusLine message={statusBySource[conn.docId]} />
								</div>
							);
						})}
					</>
				)}
			</div>
		</Panel>
	);
}
