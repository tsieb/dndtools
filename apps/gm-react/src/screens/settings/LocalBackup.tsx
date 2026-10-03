import { useState } from 'react';
import { Button, Dialog, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { pickTextFile } from '../../platform/filePick';
import {
	MAX_VAULT_BACKUP_FILE_BYTES,
	exportFullVault,
	importFullVault,
	validateVaultBackup,
	type VaultBackup,
} from '../../platform/backup';
import { SettingsSection } from './Experience';
import { errMsg } from './shared';

/** Full local vault backup + restore (WS-1): the whole persisted core slice + every stored asset
 * byte in one JSON file. Restore is authoritative and destructive — it replaces the current vault
 * (validated fail-closed first), then hard-reloads so every runtime rebuilds from the restored data. */
export function LocalBackupPanel() {
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
		<SettingsSection gateKey="settings.backup.title">
			<Panel title={t('settings.backup.title')}>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: T.space.three, flexWrap: 'wrap' }}
				>
					<div style={{ flex: '1 1 260px' }}>
						<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>
							{t('settings.backup.heading')}
						</div>
						<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
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
						<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
							{restoreBefore}
							<strong style={{ color: T.ink }}>{restoreStamp}</strong>
							{restoreAfter}
						</div>
					)}
				</Dialog>
			</Panel>
		</SettingsSection>
	);
}
