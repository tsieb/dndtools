import { useState } from 'react';
import { MIN_RECOVERY_PASSPHRASE_CHARS, type VaultPrivacyMode } from '@dndtools/core';
import { Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { recoveryPassphraseIssue, recoveryPassphraseOk } from '../settings-validation';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { useAuth } from '../../cloud/AuthContext';
import {
	setVaultPrivacyMode,
	storedVaultPrivacyMode,
	vaultPrivacyMode,
} from '../../cloud/vaultMode';
import { vaultKeyManager } from '../../cloud/vaultKey';
import { CLOUD_VAULT_ID } from '../../cloud/syncEngine';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { pickTextFile } from '../../platform/filePick';
/* ---- Vault privacy + recovery key (ADR-026 — the consented switch and the sealed key export) ----- */
/** ADR-026 — shows the recorded per-vault privacy mode and hosts the consented switch dialog. */
export function VaultPrivacyPanel() {
	const { t } = useI18n();
	const [mode, setMode] = useState<VaultPrivacyMode>(() => vaultPrivacyMode());
	const [explicit, setExplicit] = useState(() => storedVaultPrivacyMode() !== null);
	const [switchOpen, setSwitchOpen] = useState(false);
	const [phrase, setPhrase] = useState('');
	const isPrivate = mode === 'private-e2ee';
	const target: VaultPrivacyMode = isPrivate ? 'cloud-enhanced' : 'private-e2ee';
	// ADR-026 — the typed phrases confirming the switch are copy, not magic tokens (the
	// AccountDangerPanel pattern): a reader confirms in the language the dialog is written in, and
	// the comparison reads the same catalog entry.
	const targetPhrase = t(
		target === 'private-e2ee' ? 'settings.privacy.phrasePrivate' : 'settings.privacy.phraseCloud',
	);
	const phraseOk = phrase.trim().toLowerCase() === targetPhrase;

	const applySwitch = () => {
		setVaultPrivacyMode(target);
		setMode(target);
		setExplicit(true);
		setSwitchOpen(false);
		setPhrase('');
		Toaster.success(
			t(
				target === 'private-e2ee'
					? 'settings.privacy.nowPrivate'
					: 'settings.privacy.consentRecorded',
			),
		);
	};

	// The phrase is emphasised mid-sentence, so format the whole prompt and split it around that
	// value rather than freezing English word order into two fragments.
	const ackPrompt = t('settings.privacy.ackPrompt', { phrase: targetPhrase });
	const [ackBefore, ackAfter = ''] = ackPrompt.split(targetPhrase);
	return (
		<Panel
			title={t('settings.privacy.title')}
			action={
				<Badge status={isPrivate ? 'success' : 'info'}>
					{t(isPrivate ? 'settings.privacy.badgePrivate' : 'settings.privacy.badgeCloud')}
				</Badge>
			}
		>
			<SetRow
				label={t(isPrivate ? 'settings.privacy.rowPrivate' : 'settings.privacy.rowCloud')}
				help={
					isPrivate
						? t('settings.privacy.helpPrivate', {
								chose: t(explicit ? 'settings.privacy.youChose' : 'settings.privacy.thisVaultUses'),
							})
						: t('settings.privacy.helpCloud')
				}
				control={
					<Button variant="secondary" size="sm" onClick={() => setSwitchOpen(true)}>
						{t(isPrivate ? 'settings.privacy.switchToCloud' : 'settings.privacy.switchToPrivate')}
					</Button>
				}
			/>
			<Dialog
				open={switchOpen}
				onClose={() => {
					setSwitchOpen(false);
					setPhrase('');
				}}
				title={t(
					target === 'private-e2ee'
						? 'settings.privacy.dialogPrivateTitle'
						: 'settings.privacy.dialogCloudTitle',
				)}
				description={t(
					target === 'private-e2ee'
						? 'settings.privacy.dialogPrivateDescription'
						: 'settings.privacy.dialogCloudDescription',
				)}
				tone="danger"
				size="sm"
				role="alertdialog"
				initialFocus="#cancel-vault-mode-switch"
				footer={
					<>
						<Button
							id="cancel-vault-mode-switch"
							variant="secondary"
							size="sm"
							onClick={() => {
								setSwitchOpen(false);
								setPhrase('');
							}}
						>
							{t('common.action.cancel')}
						</Button>
						<Button variant="danger" size="sm" disabled={!phraseOk} onClick={applySwitch}>
							{t(
								target === 'private-e2ee'
									? 'settings.privacy.makePrivate'
									: 'settings.privacy.recordConsent',
							)}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 10 }}>
					{t(
						target === 'private-e2ee'
							? 'settings.privacy.bodyToPrivate'
							: 'settings.privacy.bodyToCloud',
					)}{' '}
					{ackBefore}
					<strong style={{ color: T.ink }}>{targetPhrase}</strong>
					{ackAfter}
				</div>
				<Input
					value={phrase}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhrase(e.target.value)}
					placeholder={targetPhrase}
					aria-label={t('settings.privacy.ackFieldLabel', { phrase: targetPhrase })}
					maxLength={targetPhrase.length}
					style={{ width: '100%' }}
				/>
			</Dialog>
		</Panel>
	);
}

/** ADR-026 P0 #3 — passphrase-sealed recovery-key export/import for the E2EE backup keyring. */
export function RecoveryKeyPanel() {
	const { t } = useI18n();
	const auth = useAuth();
	const cloud = useCloudSync();
	const accountId = auth.status === 'signed-in' && auth.user?.sub ? auth.user.sub : null;
	const custodyAvailable = cloud.gate?.custodyAvailable ?? false;
	const [busy, setBusy] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [pass, setPass] = useState('');
	const [passConfirm, setPassConfirm] = useState('');
	const passOk = recoveryPassphraseOk(pass, passConfirm);
	// WCAG 3.3.1: the only feedback for a too-short or MISMATCHED passphrase used to be an inert
	// Export button. A mismatch is invisible by construction (both fields are `type="password"`),
	// so nothing on screen told you which of the two you had mistyped.
	const passIssue = recoveryPassphraseIssue(pass, passConfirm);
	const passIssueText = passIssue ? t(passIssue.key, passIssue.values) : null;

	const closeDialogs = () => {
		setExportOpen(false);
		setImportOpen(false);
		setPass('');
		setPassConfirm('');
	};

	const doExport = async () => {
		if (!accountId) return;
		setBusy(true);
		try {
			const text = await vaultKeyManager.exportRecoveryFile(accountId, CLOUD_VAULT_ID, pass);
			const result = await downloadJsonFile(
				`dndtools-recovery-key-${fileDateStamp()}.json`,
				JSON.parse(text) as unknown,
				t('settings.recovery.fileTitle'),
			);
			closeDialogs();
			Toaster.success(
				t(
					result.method === 'download'
						? 'settings.recovery.downloaded'
						: 'settings.recovery.exported',
				),
			);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.recovery.exportFailed'));
		} finally {
			setBusy(false);
		}
	};

	const doImport = async () => {
		if (!accountId) return;
		setBusy(true);
		try {
			const picked = await pickTextFile('.json,application/json', 512 * 1024);
			if (!picked) return;
			await vaultKeyManager.importRecoveryFile(accountId, CLOUD_VAULT_ID, picked.text, pass);
			closeDialogs();
			await cloud.refresh().catch(() => undefined);
			Toaster.success(t('settings.recovery.imported'));
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : t('settings.recovery.importFailed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title={t('settings.recovery.title')}>
			<SetRow
				label={t('settings.recovery.custody')}
				help={t(
					!accountId
						? 'settings.recovery.helpSignedOut'
						: custodyAvailable
							? 'settings.recovery.help'
							: 'settings.recovery.helpNoCustody',
				)}
				control={
					<span style={{ display: 'inline-flex', gap: 8 }}>
						<Button
							variant="secondary"
							size="sm"
							icon="download"
							disabled={!accountId || !custodyAvailable || busy}
							onClick={() => setExportOpen(true)}
						>
							{t('settings.recovery.export')}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon="import"
							disabled={!accountId || !custodyAvailable || busy}
							onClick={() => setImportOpen(true)}
						>
							{t('settings.recovery.import')}
						</Button>
					</span>
				}
			/>
			<Dialog
				open={exportOpen || importOpen}
				onClose={closeDialogs}
				title={t(exportOpen ? 'settings.recovery.exportTitle' : 'settings.recovery.importTitle')}
				description={t(
					exportOpen
						? 'settings.recovery.exportDescription'
						: 'settings.recovery.importDescription',
				)}
				size="sm"
				dismissible={!busy}
				aria-busy={busy}
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={closeDialogs}>
							{t('common.action.cancel')}
						</Button>
						{exportOpen ? (
							<Button
								variant="primary"
								size="sm"
								disabled={busy}
								aria-disabled={!passOk || undefined}
								title={
									passOk
										? undefined
										: (passIssueText ??
											t('settings.recovery.needPassphrase', {
												min: MIN_RECOVERY_PASSPHRASE_CHARS,
											}))
								}
								onClick={() => void doExport()}
							>
								{t('settings.recovery.exportFile')}
							</Button>
						) : (
							<Button
								variant="primary"
								size="sm"
								disabled={busy || pass.length === 0}
								onClick={() => void doImport()}
							>
								{t('settings.recovery.chooseFile')}
							</Button>
						)}
					</>
				}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{exportOpen
							? t('settings.recovery.exportBody', { min: MIN_RECOVERY_PASSPHRASE_CHARS })
							: t('settings.recovery.importBody')}
					</div>
					<Input
						type="password"
						value={pass}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPass(e.target.value)}
						placeholder={t('settings.recovery.passphrase')}
						aria-label={t('settings.recovery.passphrase')}
						style={{ width: '100%' }}
					/>
					{exportOpen && (
						<Input
							type="password"
							value={passConfirm}
							invalid={passConfirm.length > 0 && pass !== passConfirm}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassConfirm(e.target.value)}
							placeholder={t('settings.recovery.repeat')}
							aria-label={t('settings.recovery.repeatLabel')}
							style={{ width: '100%' }}
						/>
					)}
					{exportOpen && passIssueText && (
						<div
							role="alert"
							style={{ font: `12px/1.5 ${T.sans}`, color: 'var(--color-status-error)' }}
						>
							{passIssueText}
						</div>
					)}
				</div>
			</Dialog>
		</Panel>
	);
}
