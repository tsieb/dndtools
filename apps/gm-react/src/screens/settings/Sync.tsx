import { useEffect, useState } from 'react';
import { Badge, Button, Dialog, Icon, StatusDot, Switch, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
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
	const cloud = useCloudSync();
	const ent = useEntitlements();
	const [busy, setBusy] = useState(false);
	const [restoreOpen, setRestoreOpen] = useState(false);

	if (!cloud.available) {
		return (
			<Panel title="Encrypted cloud backup">
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<StatusDot status={online ? 'live' : 'error'} pulse={online} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `600 13.5px ${T.sans}` }}>
							{online ? 'Online' : 'Offline'} · local-only
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{localChanges} {localChanges === 1 ? 'change is' : 'changes are'} recorded locally ·
							cloud backup is unavailable in this build.
						</div>
					</div>
					<Button variant="secondary" size="sm" icon="retry" disabled>
						Back up now
					</Button>
				</div>
			</Panel>
		);
	}

	const gate = cloud.gate;
	const canEnable = cloud.includedInPlan && (gate?.canEnableOnThisDevice ?? false);
	const es = cloud.engineStatus;
	const lastSynced = es?.lastSyncedAt ? new Date(es.lastSyncedAt).toLocaleTimeString() : 'never';

	const run = async (fn: () => Promise<unknown>, okMsg: string) => {
		setBusy(true);
		try {
			const r = await fn();
			if (r === 'no-snapshot') Toaster.info('No cloud backup found for this account yet.');
			else Toaster.success(okMsg);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : 'Cloud backup failed.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel
			title="Encrypted cloud backup"
			action={
				<Badge status={cloud.enabled ? 'success' : 'neutral'}>{cloud.enabled ? 'On' : 'Off'}</Badge>
			}
		>
			<SetRow
				label="End-to-end encrypted cloud backup"
				help={
					!cloud.includedInPlan
						? ent.canChangePlan
							? 'Included in the Lantern and Beacon preview plans. You can change preview plans at no charge.'
							: 'Not included in your current plan. Self-service plan changes are unavailable in this release.'
						: canEnable
							? 'Campaign state is encrypted on this device before upload, so the online service stores only unreadable data. Device-local media bytes are not uploaded. Off by default. Export a recovery key below and keep it somewhere safe: without your devices or that exported file, the cloud copy cannot be opened.'
							: gate?.custodyAvailable === false
								? 'Unavailable on this device: encrypted cloud backup needs an OS credential store to protect your key (available in the desktop and Android apps).'
								: 'Secure cloud backup is not available on this device.'
				}
				control={
					<Switch
						checked={cloud.enabled}
						// `busy` flips synchronously inside this switch's own change handler, so a hard
						// `disabled` disabled the control under the user's focus and the browser dropped
						// focus to `<body>` mid-toggle. The durable `!canEnable` gate stays native.
						disabled={!canEnable}
						aria-disabled={busy || undefined}
						aria-label="End-to-end encrypted cloud backup"
						onChange={() =>
							void run(
								() => (cloud.enabled ? cloud.disable() : cloud.enable()),
								cloud.enabled ? 'Cloud backup turned off.' : 'Cloud backup enabled.',
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
							{es?.busy || busy
								? 'Backing up…'
								: es?.lastError
									? 'Backup error'
									: es?.lastSyncedAt
										? 'Backup up to date'
										: 'Backup waiting to start'}
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{es?.lastError ? es.lastError : `Last backed up: ${lastSynced}`}
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						disabled={busy || es?.busy}
						onClick={() => void run(cloud.syncNow, 'Backed up to the cloud.')}
					>
						Back up now
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon="download"
						disabled={busy || es?.busy}
						onClick={() => setRestoreOpen(true)}
					>
						Restore this device
					</Button>
					<Dialog
						open={restoreOpen}
						onClose={() => setRestoreOpen(false)}
						title="Replace this device’s vault?"
						description="Restore the latest encrypted cloud copy using this device’s existing key."
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
									Cancel
								</Button>
								<Button
									variant="danger"
									size="sm"
									disabled={busy}
									onClick={() => {
										setRestoreOpen(false);
										void run(cloud.restore, 'Restored from the cloud backup.');
									}}
								>
									Replace local vault
								</Button>
							</>
						}
					>
						<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
							This overwrites the campaign data currently stored on this device. Export a local
							backup first if you may need to return to it. The cloud copy can only be opened with
							the key already held by this device. It does not contain media bytes; only matching
							media already stored on this device remains available.
						</div>
					</Dialog>
				</div>
			) : null}
		</Panel>
	);
}
export function SettingsSync() {
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
			<Panel title="Recent changes" action={<Badge status="neutral">{ops.length}</Badge>}>
				{recent.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No changes recorded yet.</div>
				) : (
					recent.map((q) => (
						<div
							key={q.id}
							title={`${humanizeEntity(q.entityType)} change`}
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
								Saved{' '}
								{new Date(q.issuedAt).toLocaleString(undefined, {
									dateStyle: 'medium',
									timeStyle: 'short',
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
				'Save Lamplight vault backup',
			);
			if (result.status === 'exported') {
				Toaster.success(
					`Backup ${result.method === 'download' ? 'downloaded' : 'exported'} — ${data.assets.length} media ${data.assets.length === 1 ? 'asset' : 'assets'} included.`,
				);
			}
		} catch (e: unknown) {
			Toaster.error(errMsg(e, 'Could not build or export the backup.'));
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
			Toaster.error(errMsg(e, 'That file is not a valid vault backup.'));
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
				Toaster.error(
					errMsg(e, 'Restore did not finish. Reload the app before making more changes.'),
				);
				setBusy(false);
			});
	};
	return (
		<Panel title="Local backup">
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 260px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>Back up or restore this device’s vault</div>
					<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
						One JSON file with campaign data and stored media bytes. It does not include app
						preferences, connected-folder permissions, account credentials, or AI provider keys.
						Restoring replaces the current vault on this device.
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={backup}>
					Download backup
				</Button>
				<Button
					variant="secondary"
					size="sm"
					icon="import"
					disabled={busy}
					onClick={() => void pickBackup()}
				>
					Restore from backup…
				</Button>
			</div>
			<Dialog
				open={pendingRestore !== null}
				onClose={() => setPendingRestore(null)}
				title="Replace this vault?"
				description="The backup replaces all campaign data and stored media in this vault."
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
							Cancel
						</Button>
						<Button variant="danger" size="sm" icon="import" disabled={busy} onClick={restore}>
							{busy ? 'Restoring…' : 'Replace vault & reload'}
						</Button>
					</>
				}
			>
				{pendingRestore && (
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Backup from{' '}
						<strong style={{ color: T.ink }}>
							{new Date(pendingRestore.createdAt).toLocaleString()}
						</strong>{' '}
						with {pendingRestore.assets.length} media{' '}
						{pendingRestore.assets.length === 1 ? 'asset' : 'assets'}. The file is checked
						completely before campaign data and media are replaced together; a failed restore leaves
						this vault unchanged. Download a backup of the current vault first if you may need to
						return to it.
					</div>
				)}
			</Dialog>
		</Panel>
	);
}
