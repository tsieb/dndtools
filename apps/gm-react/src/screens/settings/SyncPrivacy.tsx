import { useState } from 'react';
import { MIN_RECOVERY_PASSPHRASE_CHARS, type VaultPrivacyMode } from '@dndtools/core';
import { Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
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
/** ADR-026 — the typed phrases confirming a vault-privacy-mode switch (AccountDangerPanel pattern). */
const TO_PRIVATE_PHRASE = 'i hold the keys';
const TO_CLOUD_PHRASE = 'read my vault';

/** ADR-026 — shows the recorded per-vault privacy mode and hosts the consented switch dialog. */
export function VaultPrivacyPanel() {
	const [mode, setMode] = useState<VaultPrivacyMode>(() => vaultPrivacyMode());
	const [explicit, setExplicit] = useState(() => storedVaultPrivacyMode() !== null);
	const [switchOpen, setSwitchOpen] = useState(false);
	const [phrase, setPhrase] = useState('');
	const isPrivate = mode === 'private-e2ee';
	const target: VaultPrivacyMode = isPrivate ? 'cloud-enhanced' : 'private-e2ee';
	const targetPhrase = target === 'private-e2ee' ? TO_PRIVATE_PHRASE : TO_CLOUD_PHRASE;
	const phraseOk = phrase.trim().toLowerCase() === targetPhrase;

	const applySwitch = () => {
		setVaultPrivacyMode(target);
		setMode(target);
		setExplicit(true);
		setSwitchOpen(false);
		setPhrase('');
		Toaster.success(
			target === 'private-e2ee'
				? 'This vault is now Private — end-to-end encrypted with your keys only.'
				: 'Consent recorded — this vault will use Cloud-Enhanced features when they arrive.',
		);
	};

	return (
		<Panel
			title="Vault privacy mode"
			action={
				<Badge status={isPrivate ? 'success' : 'info'}>
					{isPrivate ? 'Private (end-to-end encrypted)' : 'Cloud-Enhanced'}
				</Badge>
			}
		>
			<SetRow
				label={isPrivate ? 'Private vault (end-to-end encrypted)' : 'Cloud-Enhanced vault'}
				help={
					isPrivate
						? `${explicit ? 'You chose' : 'This vault uses'} the Private model: everything is encrypted on your devices before it leaves them, and only your devices hold the keys. Server-powered features (campaign AI, cloud search, browser access without your key) stay unavailable to this vault.`
						: 'You consented to the Cloud-Enhanced model: encrypted in transit and at rest with service-managed keys, readable by the service to power upcoming features (campaign AI, cloud search, any-browser access). Until those features ship, your data still travels through the end-to-end-encrypted pipeline.'
				}
				control={
					<Button variant="secondary" size="sm" onClick={() => setSwitchOpen(true)}>
						{isPrivate ? 'Switch to Cloud-Enhanced…' : 'Switch to Private…'}
					</Button>
				}
			/>
			<Dialog
				open={switchOpen}
				onClose={() => {
					setSwitchOpen(false);
					setPhrase('');
				}}
				title={target === 'private-e2ee' ? 'Make this vault Private?' : 'Switch to Cloud-Enhanced?'}
				description={
					target === 'private-e2ee'
						? 'Only your devices will hold the keys from here on.'
						: 'You are consenting to service-readable storage for this vault.'
				}
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
							Cancel
						</Button>
						<Button variant="danger" size="sm" disabled={!phraseOk} onClick={applySwitch}>
							{target === 'private-e2ee' ? 'Make it Private' : 'Record my consent'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 10 }}>
					{target === 'private-e2ee' ? (
						<>
							Content the service could read while this vault was Cloud-Enhanced may already have
							been read — switching back cannot undo that. Going forward, cloud copies can only be
							opened with keys on your devices; export a recovery key and keep it safe, because the
							service cannot recover a Private vault for you.
						</>
					) : (
						<>
							When Cloud-Enhanced features ship, the service will be able to read this vault’s
							content to power them — that is the point of the mode, and it is a real widening of
							trust. Switching modes later re-uploads your vault under the new model. Nothing is
							server-readable until those features arrive and you are notified.
						</>
					)}{' '}
					Type <strong style={{ color: T.ink }}>{targetPhrase}</strong> to confirm.
				</div>
				<Input
					value={phrase}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhrase(e.target.value)}
					placeholder={targetPhrase}
					aria-label={`Type "${targetPhrase}" to confirm`}
					maxLength={targetPhrase.length}
					style={{ width: '100%' }}
				/>
			</Dialog>
		</Panel>
	);
}

/** ADR-026 P0 #3 — passphrase-sealed recovery-key export/import for the E2EE backup keyring. */
export function RecoveryKeyPanel() {
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
				'Lamplight recovery key',
			);
			closeDialogs();
			Toaster.success(
				`Recovery key ${result.method === 'download' ? 'downloaded' : 'exported'} — store the file and its passphrase separately and safely.`,
			);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : 'Recovery-key export failed.');
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
			Toaster.success(
				'Recovery key imported — this device can now open your encrypted cloud backups.',
			);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : 'Recovery-key import failed.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="Recovery key">
			<SetRow
				label="Backup key custody"
				help={
					!accountId
						? 'Sign in to export or import the recovery key for your account’s encrypted cloud backups.'
						: custodyAvailable
							? 'The recovery key is your vault’s encryption keyring sealed under a passphrase you choose. Export it once and keep it safe: it is the only way to open your encrypted cloud backup if every signed-in device is lost. Import it on a new device to restore access.'
							: 'Recovery keys need the operating-system credential store (desktop and Android apps). This device cannot durably hold a vault key.'
				}
				control={
					<span style={{ display: 'inline-flex', gap: 8 }}>
						<Button
							variant="secondary"
							size="sm"
							icon="download"
							disabled={!accountId || !custodyAvailable || busy}
							onClick={() => setExportOpen(true)}
						>
							Export…
						</Button>
						<Button
							variant="ghost"
							size="sm"
							icon="import"
							disabled={!accountId || !custodyAvailable || busy}
							onClick={() => setImportOpen(true)}
						>
							Import…
						</Button>
					</span>
				}
			/>
			<Dialog
				open={exportOpen || importOpen}
				onClose={closeDialogs}
				title={exportOpen ? 'Export recovery key' : 'Import recovery key'}
				description={
					exportOpen
						? 'Seal your vault keyring under a passphrase and save the file.'
						: 'Unlock a recovery file and install its keys on this device.'
				}
				size="sm"
				dismissible={!busy}
				aria-busy={busy}
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={closeDialogs}>
							Cancel
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
										: (passIssue ??
											`Enter a passphrase of at least ${MIN_RECOVERY_PASSPHRASE_CHARS} characters, twice.`)
								}
								onClick={() => void doExport()}
							>
								Export file
							</Button>
						) : (
							<Button
								variant="primary"
								size="sm"
								disabled={busy || pass.length === 0}
								onClick={() => void doImport()}
							>
								Choose file & import
							</Button>
						)}
					</>
				}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						{exportOpen
							? `The file alone is useless without the passphrase — but the pair is equivalent to your vault key, so store them separately. Use at least ${MIN_RECOVERY_PASSPHRASE_CHARS} characters; a stronger passphrase is the whole defense against someone who steals the file.`
							: 'Enter the passphrase you chose when this recovery file was exported, then pick the file.'}
					</div>
					<Input
						type="password"
						value={pass}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPass(e.target.value)}
						placeholder="Recovery passphrase"
						aria-label="Recovery passphrase"
						style={{ width: '100%' }}
					/>
					{exportOpen && (
						<Input
							type="password"
							value={passConfirm}
							invalid={passConfirm.length > 0 && pass !== passConfirm}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassConfirm(e.target.value)}
							placeholder="Repeat passphrase"
							aria-label="Repeat recovery passphrase"
							style={{ width: '100%' }}
						/>
					)}
					{exportOpen && passIssue && (
						<div
							role="alert"
							style={{ font: `12px/1.5 ${T.sans}`, color: 'var(--color-status-error)' }}
						>
							{passIssue}
						</div>
					)}
				</div>
			</Dialog>
		</Panel>
	);
}
