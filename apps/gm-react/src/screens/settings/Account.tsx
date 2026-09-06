import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useCloudSync } from '../../cloud/CloudSyncContext';
import { useAuth } from '../../cloud/AuthContext';
import { forgetCloudSyncAccount } from '../../cloud/cloudSync';
import { isAccountApiConfigured } from '../../cloud/config';
import {
	deleteAccount as apiDeleteAccount,
	exportAccountData,
	getProfile,
	updateProfile,
	type Profile,
} from '../../cloud/appApi';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { ONBOARDED_KEY, REPLAY_EVENT } from '../../app/Onboarding';
import { errMsg } from './shared';
import { AccountDevicesPanel } from './AccountDevices';
/* ---- Account — REAL app-api backend when configured + signed in (profile edit, devices,
 * export, delete); honest labeled fallback otherwise. ------------------------------------------- */
/** Profile from Cognito via the app-api: display-name edit is a REAL account write. */
function AccountProfilePanel() {
	const { t, formatDate } = useI18n();
	const [profile, setProfile] = useState<Profile | null>(null);
	const [failed, setFailed] = useState(false);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	const [reloadKey, setReloadKey] = useState(0);
	useEffect(() => {
		let cancelled = false;
		// Reset on every attempt: without this a retry that succeeds still painted the failure copy,
		// the same stale-error shape already fixed in Knowledge's save path.
		setFailed(false);
		getProfile()
			.then((prof) => {
				if (!cancelled) setProfile(prof);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [reloadKey]);
	const save = () => {
		const name = draft.trim();
		if (!name || name.length > 60) {
			Toaster.error(t('settings.account.nameLength'));
			return;
		}
		setBusy(true);
		updateProfile(name)
			.then((displayName) => {
				setProfile((prof) => (prof ? { ...prof, displayName } : prof));
				setEditing(false);
				Toaster.success(t('settings.account.nameUpdated'));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, t('settings.profileUpdateFailed'))))
			.finally(() => setBusy(false));
	};
	const shownName = profile?.displayName || profile?.email || '…';
	return (
		<Panel
			title={t('settings.account.profile')}
			action={
				<Badge status="success" icon="check">
					{t('settings.account.cloudAccount')}
				</Badge>
			}
		>
			{failed ? (
				// "reopen this tab" was the only way out of this state, while the sibling device and
				// export panels in this same file both offer a Retry. Now it does too.
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					<div
						role="alert"
						style={{ font: `12.5px ${T.sans}`, color: T.ter, flex: 1, minWidth: 0 }}
					>
						{t('settings.account.loadFailed')}
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						onClick={() => setReloadKey((n) => n + 1)}
					>
						{t('common.action.retry')}
					</Button>
				</div>
			) : (
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<Avatar name={shownName} size="lg" ring="active" />
					<div style={{ flex: 1, minWidth: 0 }}>
						{editing ? (
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 380 }}>
								<Input
									value={draft}
									onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
									placeholder={t('settings.account.displayName')}
									aria-label={t('settings.account.displayName')}
									maxLength={60}
								/>
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
									{t('common.action.save')}
								</Button>
								<Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
									{t('common.action.cancel')}
								</Button>
							</div>
						) : (
							<div style={{ font: `700 18px ${T.disp}` }}>{shownName}</div>
						)}
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{profile?.email ?? ''}</div>
						{profile?.createdAt && (
							<div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
								<Badge status="neutral">
									{t('settings.account.memberSince', {
										date: formatDate(new Date(profile.createdAt)),
									})}
								</Badge>
							</div>
						)}
					</div>
					{!editing && (
						<Button
							variant="secondary"
							size="sm"
							icon="edit"
							disabled={!profile}
							onClick={() => {
								setDraft(profile?.displayName ?? '');
								setEditing(true);
							}}
						>
							{t('common.action.edit')}
						</Button>
					)}
				</div>
			)}
		</Panel>
	);
}
/** Export (real backend data) + delete account behind a type-to-confirm dialog. */
function AccountDangerPanel() {
	const { t, formatList } = useI18n();
	const auth = useAuth();
	const cloud = useCloudSync();
	const [busy, setBusy] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [phrase, setPhrase] = useState('');
	// The confirmation phrase is copy, not a magic token: a Spanish reader is asked to type the
	// Spanish sentence they can see on screen, and the comparison reads the same catalog entry.
	const deletePhrase = t('settings.account.deletePhrase');
	const exportData = async () => {
		setBusy(true);
		try {
			const data = await exportAccountData();
			const result = await downloadJsonFile(
				`dndtools-account-${fileDateStamp()}.json`,
				data,
				t('settings.account.exportFileTitle'),
			);
			if (result.status === 'exported') Toaster.success(t('settings.account.exported'));
		} catch (e: unknown) {
			Toaster.error(errMsg(e, t('settings.account.exportFailed')));
		} finally {
			setBusy(false);
		}
	};
	const destroy = async () => {
		const accountId = auth.user?.sub;
		if (!accountId) {
			Toaster.error(t('settings.account.signInBeforeDelete'));
			return;
		}
		setBusy(true);
		try {
			await apiDeleteAccount();
			const cleanupWarnings: string[] = [];
			// Stop the engine before removing its key: a queued backup must not recreate key custody
			// between a successful server deletion and local sign-out.
			try {
				await cloud.disable();
			} catch {
				// forgetCloudSyncAccount repeats the persistent metadata cleanup and reports key failures.
			}
			try {
				await forgetCloudSyncAccount(accountId);
			} catch (error) {
				cleanupWarnings.push(errMsg(error, t('settings.account.warnKeyNotRemoved')));
			}
			try {
				await auth.signOut();
			} catch {
				cleanupWarnings.push(t('settings.account.warnSignOutUnverified'));
			}
			setConfirmOpen(false);
			if (cleanupWarnings.length > 0) {
				Toaster.error(
					t('settings.account.deletedWithWarnings', {
						// `and` is a conjunction, not punctuation: Intl.ListFormat spells it per locale.
						warnings: formatList(cleanupWarnings, { type: 'conjunction' }),
					}),
				);
			} else {
				Toaster.success(t('settings.account.deleted'));
			}
		} catch (e) {
			Toaster.error(errMsg(e, t('settings.account.deleteFailed')));
		} finally {
			setBusy(false);
		}
	};
	// The phrase is emphasised mid-sentence, so format the whole sentence and split it around the
	// value rather than freezing English word order into two fragments.
	const confirmSentence = t('settings.account.deleteBody', { phrase: deletePhrase });
	const [confirmBefore, confirmAfter = ''] = confirmSentence.split(deletePhrase);
	return (
		<Panel
			title={t('settings.account.dangerZone')}
			style={{ borderColor: 'var(--color-status-error-border)' }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>{t('settings.account.dangerHeading')}</div>
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('settings.account.dangerBody')}
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={exportData}>
					{t('settings.account.download')}
				</Button>
				<Button
					variant="danger"
					size="sm"
					icon="trash"
					disabled={busy}
					onClick={() => {
						setPhrase('');
						setConfirmOpen(true);
					}}
				>
					{t('settings.account.delete')}
				</Button>
			</div>
			<Dialog
				open={confirmOpen}
				onClose={() => setConfirmOpen(false)}
				title={t('settings.account.deleteDialogTitle')}
				description={t('settings.account.deleteDialogDescription')}
				icon="warning"
				size="md"
				dismissible={!busy}
				initialFocus="#delete-account-confirmation"
				role="alertdialog"
				aria-busy={busy}
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setConfirmOpen(false)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy || phrase.trim().toLowerCase() !== deletePhrase}
							onClick={destroy}
						>
							{busy ? t('settings.account.deleting') : t('settings.account.deleteForever')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 10 }}>
					{confirmBefore}
					<strong style={{ color: T.ink }}>{deletePhrase}</strong>
					{confirmAfter}
				</div>
				<Input
					id="delete-account-confirmation"
					value={phrase}
					onChange={(e: { target: { value: string } }) => setPhrase(e.target.value)}
					placeholder={deletePhrase}
					aria-label={t('settings.account.deletePhraseLabel', { phrase: deletePhrase })}
					autoComplete="off"
					maxLength={deletePhrase.length}
					disabled={busy}
				/>
			</Dialog>
		</Panel>
	);
}
/** Honest gate when the account surface can't be real: local-only build, or signed out. */
function CloudAccountGate() {
	const { t } = useI18n();
	const auth = useAuth();
	if (!isAccountApiConfigured) {
		return (
			<Panel
				title={t('settings.account.cloudAccount')}
				action={<Badge status="neutral">{t('settings.account.localOnly')}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.account.localOnlyBody')}
				</div>
			</Panel>
		);
	}
	return (
		<Panel
			title={t('settings.account.cloudAccount')}
			action={<Badge status="neutral">{t('settings.account.signedOut')}</Badge>}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.account.signedOutBody')}
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>
					{t('settings.account.signIn')}
				</Button>
			</div>
		</Panel>
	);
}

export function SettingsAccount() {
	const { t } = useI18n();
	const auth = useAuth();
	// The account surface is REAL (app-api) when the backend is configured AND the user is signed
	// in; otherwise it shows an honest gate — no fake profile pretending to be yours.
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{cloudReady ? (
				<>
					<AccountProfilePanel />
					<AccountDevicesPanel />
				</>
			) : (
				<CloudAccountGate />
			)}

			<Panel
				title={t('settings.account.onboardingTitle')}
				action={
					<Button
						variant="ghost"
						size="sm"
						icon="sparkle"
						onClick={() => {
							// REAL: clears the first-run flag and re-opens the live overlay (it listens for this event).
							try {
								window.localStorage.removeItem(ONBOARDED_KEY);
							} catch {
								/* ignore */
							}
							window.dispatchEvent(new Event(REPLAY_EVENT));
						}}
					>
						{t('settings.account.replaySetup')}
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.account.onboardingBody')}
				</div>
			</Panel>

			{cloudReady && <AccountDangerPanel />}
		</div>
	);
}
