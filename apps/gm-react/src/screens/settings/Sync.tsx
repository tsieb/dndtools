import { useEffect, useState } from 'react';
import { Badge, Button, Dialog, Icon, StatusDot, Switch, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { pickTextFile } from '../../platform/filePick';
import {
	MAX_VAULT_BACKUP_FILE_BYTES,
	exportFullVault,
	importFullVault,
	validateVaultBackup,
	type VaultBackup,
} from '../../platform/backup';
import { useEntitlements } from '../../cloud/entitlements';
import { errMsg } from './shared';
import { RecoveryKeyPanel, VaultPrivacyPanel } from './SyncPrivacy';
/* ---- Backup activity: local operation history + optional encrypted off-device copy. -------------- */
/* The two `humanize*` helpers below read a core command id ('scene.create') and spell it as English
 * prose ('Scene created'). They are the one thing on this screen the catalog cannot reach: the words
 * are derived from identifiers the core owns, not from copy this screen authors, so translating them
 * needs a per-command label catalog next to those ids rather than 200 keys invented here.
 * HANDOFF RC-UX-1.2 → packages/core command registry: a translatable label per command id. */
function humanizeOp(opType: string): string {
	const [scope = 'change', action = 'updated'] = opType.split('.', 2);
	const [verb = 'updated', ...detail] = action.split(/[-_]/g);
	const pastTense: Record<string, string> = {
		add: 'added',
		advance: 'advanced',
		assign: 'assigned',
		create: 'created',
		delete: 'deleted',
		deliver: 'delivered',
		end: 'ended',
		import: 'imported',
		move: 'moved',
		remove: 'removed',
		reorder: 'reordered',
		revoke: 'revoked',
		set: 'changed',
		start: 'started',
		stop: 'stopped',
		update: 'updated',
	};
	const subject = (detail.length > 0 ? detail : scope.split(/[-_]/g)).join(' ');
	const readableSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
	return `${readableSubject} ${pastTense[verb] ?? verb}`;
}

function humanizeEntity(entityType: string): string {
	const readable = entityType.replace(/[._-]+/g, ' ').trim();
	return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : 'Campaign item';
}

/** E2EE cloud-backup controls. This is an off-device copy for the current key-holding device, not a
 *  bidirectional multi-device sync surface; restore is explicit and destructive. */
function CloudSyncPanel({ online, localChanges }: { online: boolean; localChanges: number }) {
	const { t, formatTime } = useI18n();
	const cloud = useCloudSync();
	const ent = useEntitlements();
	const [busy, setBusy] = useState(false);
	const [restoreOpen, setRestoreOpen] = useState(false);

	if (!cloud.available) {
		return (
			<Panel title={t('settings.sync.cloudTitle')}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<StatusDot status={online ? 'live' : 'error'} pulse={online} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `600 13.5px ${T.sans}` }}>
							{t('settings.sync.localOnlyState', {
								state: t(online ? 'settings.sync.online' : 'settings.sync.offline'),
							})}
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{t('settings.sync.localOnlyCount', { count: localChanges })}
						</div>
					</div>
					<Button variant="secondary" size="sm" icon="retry" disabled>
						{t('settings.sync.backUpNow')}
					</Button>
				</div>
			</Panel>
		);
	}

	const gate = cloud.gate;
	const canEnable = cloud.includedInPlan && (gate?.canEnableOnThisDevice ?? false);
	const es = cloud.engineStatus;
	const lastSynced = es?.lastSyncedAt
		? formatTime(new Date(es.lastSyncedAt), { timeStyle: 'medium' })
		: t('settings.sync.never');

	const run = async (fn: () => Promise<unknown>, okMsg: string) => {
		setBusy(true);
		try {
			const r = await fn();
			if (r === 'no-snapshot') Toaster.info(t('settings.sync.noSnapshot'));
			else Toaster.success(okMsg);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.sync.cloudFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel
			title={t('settings.sync.cloudTitle')}
			action={
				<Badge status={cloud.enabled ? 'success' : 'neutral'}>
					{t(cloud.enabled ? 'settings.sync.on' : 'settings.sync.off')}
				</Badge>
			}
		>
			<SetRow
				label={t('settings.sync.cloudRow')}
				help={t(
					!cloud.includedInPlan
						? ent.canChangePlan
							? 'settings.sync.helpNotInPlan'
							: 'settings.sync.helpNotInPlanLocked'
						: canEnable
							? 'settings.sync.help'
							: gate?.custodyAvailable === false
								? 'settings.sync.helpNoCustody'
								: 'settings.sync.helpUnavailable',
				)}
				control={
					<Switch
						checked={cloud.enabled}
						// `busy` flips synchronously inside this switch's own change handler, so a hard
						// `disabled` disabled the control under the user's focus and the browser dropped
						// focus to `<body>` mid-toggle. The durable `!canEnable` gate stays native.
						disabled={!canEnable}
						aria-disabled={busy || undefined}
						aria-label={t('settings.sync.cloudRow')}
						onChange={() =>
							void run(
								() => (cloud.enabled ? cloud.disable() : cloud.enable()),
								t(cloud.enabled ? 'settings.sync.turnedOff' : 'settings.sync.turnedOn'),
							)
						}
					/>
				}
			/>
			{cloud.enabled && canEnable ? (
				<div
					role="status"
					aria-live="polite"
					aria-atomic="true"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						marginTop: 12,
						flexWrap: 'wrap',
					}}
				>
					<StatusDot
						status={es?.lastError ? 'error' : es?.busy || busy ? 'pending' : 'live'}
						pulse={es?.busy}
					/>
					<div style={{ flex: 1, minWidth: 180 }}>
						<div style={{ font: `600 13px ${T.sans}` }}>
							{t(
								es?.busy || busy
									? 'settings.sync.stateBusy'
									: es?.lastError
										? 'settings.sync.stateError'
										: es?.lastSyncedAt
											? 'settings.sync.stateUpToDate'
											: 'settings.sync.stateWaiting',
							)}
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{es?.lastError ? es.lastError : t('settings.sync.lastBackedUp', { when: lastSynced })}
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						disabled={busy || es?.busy}
						onClick={() => void run(cloud.syncNow, t('settings.sync.backedUp'))}
					>
						{t('settings.sync.backUpNow')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="download"
						disabled={busy || es?.busy}
						onClick={() => setRestoreOpen(true)}
					>
						{t('settings.sync.restoreDevice')}
					</Button>
					<Dialog
						open={restoreOpen}
						onClose={() => setRestoreOpen(false)}
						title={t('settings.sync.restoreTitle')}
						description={t('settings.sync.restoreDescription')}
						tone="danger"
						size="sm"
						dismissible={!busy}
						initialFocus="#cancel-cloud-restore"
						role="alertdialog"
						aria-busy={busy}
						footer={
							<>
								<Button
									id="cancel-cloud-restore"
									variant="secondary"
									size="sm"
									disabled={busy}
									onClick={() => setRestoreOpen(false)}
								>
									{t('common.action.cancel')}
								</Button>
								<Button
									variant="danger"
									size="sm"
									disabled={busy}
									onClick={() => {
										setRestoreOpen(false);
										void run(cloud.restore, t('settings.sync.restored'));
									}}
								>
									{t('settings.sync.replaceLocal')}
								</Button>
							</>
						}
					>
						<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
							{t('settings.sync.restoreBody')}
						</div>
					</Dialog>
				</div>
			) : null}
		</Panel>
	);
}
export function SettingsSync() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const ops = runtime.state.sync.operations;
	const [online, setOnline] = useState<boolean>(
		typeof navigator !== 'undefined' ? navigator.onLine : true,
	);
	useEffect(() => {
		const on = () => setOnline(true);
		const off = () => setOnline(false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	}, []);
	const recent = [...ops].slice(-8).reverse();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{/* Local backup stays first: it is the section's daily-use action, and on the compact
			    shell the Android acceptance run proved that panels stacked above it push the
			    backup button's tap target under the fixed navigation. The ADR-026 consent and
			    recovery panels are set-once controls and read fine below it. */}
			<CloudSyncPanel online={online} localChanges={ops.length} />
			<LocalBackupPanel />
			<VaultPrivacyPanel />
			<RecoveryKeyPanel />
			<Panel
				title={t('settings.sync.recentChanges')}
				action={<Badge status="neutral">{ops.length}</Badge>}
			>
				{recent.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{t('settings.sync.noChanges')}
					</div>
				) : (
					recent.map((q) => (
						<div
							key={q.id}
							title={t('settings.sync.changeTitle', { entity: humanizeEntity(q.entityType) })}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '7px 0',
								font: `12.5px ${T.sans}`,
								color: T.sub,
								flexWrap: 'wrap',
							}}
						>
							<Icon name="connection" size={15} color={T.ter} />
							<Badge status="info">{humanizeOp(q.opType)}</Badge>
							<span style={{ flex: '1 1 150px', font: `11.5px ${T.sans}`, color: T.ter }}>
								{t('settings.sync.saved', {
									when: formatDate(new Date(q.issuedAt), {
										dateStyle: 'medium',
										timeStyle: 'short',
									}),
								})}
							</span>
						</div>
					))
				)}
			</Panel>
		</div>
	);
}

/** Full local vault backup + restore (WS-1): the whole persisted core slice + every stored asset
 * byte in one JSON file. Restore is authoritative and destructive — it replaces the current vault
 * (validated fail-closed first), then hard-reloads so every runtime rebuilds from the restored data. */
function LocalBackupPanel() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const [busy, setBusy] = useState(false);
	const [pendingRestore, setPendingRestore] = useState<VaultBackup | null>(null);
	const backup = async () => {
		setBusy(true);
		try {
			const data = await exportFullVault();
			const result = await downloadJsonFile(
				`dndtools-vault-backup-${fileDateStamp()}.json`,
				data,
				t('settings.backup.fileTitle'),
			);
			if (result.status === 'exported') {
				Toaster.success(
					t(
						result.method === 'download'
							? 'settings.backup.downloaded'
							: 'settings.backup.exported',
						{ count: data.assets.length },
					),
				);
			}
		} catch (e: unknown) {
			Toaster.error(errMsg(e, t('settings.backup.exportFailed')));
		} finally {
			setBusy(false);
		}
	};
	const pickBackup = async () => {
		try {
			const file = await pickTextFile('.json', MAX_VAULT_BACKUP_FILE_BYTES);
			if (!file) return;
			// validateVaultBackup is fail-closed: anything structurally off is rejected with a reason
			// BEFORE the confirm dialog ever offers to overwrite the current vault.
			setPendingRestore(validateVaultBackup(JSON.parse(file.text)));
		} catch (e: unknown) {
			Toaster.error(errMsg(e, t('settings.backup.invalidFile')));
		}
	};
	const restore = () => {
		if (!pendingRestore) return;
		setBusy(true);
		runtime
			.runExclusiveMaintenance(async () => {
				await importFullVault(pendingRestore);
				// Keep later commands behind the maintenance lock until the runtime reflects the restored
				// vault. Otherwise a queued command could persist stale in-memory state before reload.
				await runtime.reloadFromStorage();
			})
			.then(() => window.location.reload())
			.catch((e: unknown) => {
				Toaster.error(errMsg(e, t('settings.backup.restoreFailed')));
				setBusy(false);
			});
	};
	// The backup's timestamp is emphasised mid-sentence, so format the whole sentence and split it
	// around that value rather than freezing English word order into two fragments.
	const restoreStamp = pendingRestore
		? formatDate(new Date(pendingRestore.createdAt), { dateStyle: 'medium', timeStyle: 'short' })
		: null;
	const restoreSentence = pendingRestore
		? t('settings.backup.replaceBody', {
				when: restoreStamp ?? '',
				count: pendingRestore.assets.length,
			})
		: '';
	const [restoreBefore, restoreAfter = ''] = restoreSentence.split(restoreStamp ?? '\u0000');
	return (
		<Panel title={t('settings.backup.title')}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 260px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>{t('settings.backup.heading')}</div>
					<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
						{t('settings.backup.body')}
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={backup}>
					{t('settings.backup.download')}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					icon="import"
					disabled={busy}
					onClick={() => void pickBackup()}
				>
					{t('settings.backup.restore')}
				</Button>
			</div>
			<Dialog
				open={pendingRestore !== null}
				onClose={() => setPendingRestore(null)}
				title={t('settings.backup.replaceTitle')}
				description={t('settings.backup.replaceDescription')}
				icon="warning"
				size="md"
				dismissible={!busy}
				initialFocus="#cancel-local-restore"
				role="alertdialog"
				aria-busy={busy}
				footer={
					<>
						<Button
							id="cancel-local-restore"
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setPendingRestore(null)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button variant="danger" size="sm" icon="import" disabled={busy} onClick={restore}>
							{busy ? t('settings.backup.restoring') : t('settings.backup.replaceReload')}
						</Button>
					</>
				}
			>
				{pendingRestore && restoreStamp && (
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{restoreBefore}
						<strong style={{ color: T.ink }}>{restoreStamp}</strong>
						{restoreAfter}
					</div>
				)}
			</Dialog>
		</Panel>
	);
}
