import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
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
			Toaster.error('Display name must be 1–60 characters.');
			return;
		}
		setBusy(true);
		updateProfile(name)
			.then((displayName) => {
				setProfile((prof) => (prof ? { ...prof, displayName } : prof));
				setEditing(false);
				Toaster.success('Display name updated.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not update your profile.')))
			.finally(() => setBusy(false));
	};
	const shownName = profile?.displayName || profile?.email || '…';
	return (
		<Panel
			title="Profile"
			action={
				<Badge status="success" icon="check">
					Cloud account
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
						Couldn’t load your profile — check your connection and try again.
					</div>
					<Button
						variant="secondary"
						size="sm"
						icon="retry"
						onClick={() => setReloadKey((n) => n + 1)}
					>
						Retry
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
									placeholder="Display name"
									aria-label="Display name"
									maxLength={60}
								/>
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>
									Save
								</Button>
								<Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
									Cancel
								</Button>
							</div>
						) : (
							<div style={{ font: `700 18px ${T.disp}` }}>{shownName}</div>
						)}
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{profile?.email ?? ''}</div>
						{profile?.createdAt && (
							<div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
								<Badge status="neutral">
									Member since {new Date(profile.createdAt).toLocaleDateString()}
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
							Edit
						</Button>
					)}
				</div>
			)}
		</Panel>
	);
}
/** Export (real backend data) + delete account behind a type-to-confirm dialog. */
const DELETE_PHRASE = 'delete my account';
function AccountDangerPanel() {
	const auth = useAuth();
	const cloud = useCloudSync();
	const [busy, setBusy] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [phrase, setPhrase] = useState('');
	const exportData = async () => {
		setBusy(true);
		try {
			const data = await exportAccountData();
			const result = await downloadJsonFile(
				`dndtools-account-${fileDateStamp()}.json`,
				data,
				'Export Lamplight account data',
			);
			if (result.status === 'exported') Toaster.success('Online account record exported.');
		} catch (e: unknown) {
			Toaster.error(errMsg(e, 'Could not export your account record.'));
		} finally {
			setBusy(false);
		}
	};
	const destroy = async () => {
		const accountId = auth.user?.sub;
		if (!accountId) {
			Toaster.error('Sign in again before deleting the account.');
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
				cleanupWarnings.push(errMsg(error, 'the local encrypted-backup key was not removed'));
			}
			try {
				await auth.signOut();
			} catch {
				cleanupWarnings.push('the local sign-out could not be verified');
			}
			setConfirmOpen(false);
			if (cleanupWarnings.length > 0) {
				Toaster.error(
					`Your online account was deleted, but ${cleanupWarnings.join(' and ')}. Close and reopen the app to retry queued key removal. If the warning returns, remove the saved Lamplight credential with your operating-system credential manager.`,
				);
			} else {
				Toaster.success('Your account has been deleted. Local vaults stay on this device.');
			}
		} catch (e) {
			Toaster.error(errMsg(e, 'Could not delete your account.'));
		} finally {
			setBusy(false);
		}
	};
	return (
		<Panel title="Danger zone" style={{ borderColor: 'var(--color-status-error-border)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>Download or delete your online account</div>
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						The account record includes your profile, preview plan, invites, and published module
						and wiki metadata. It cannot include encrypted campaign contents; download a local vault
						backup separately. Deleting the account never deletes campaigns stored on this device.
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={exportData}>
					Download account record
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
					Delete account
				</Button>
			</div>
			<Dialog
				open={confirmOpen}
				onClose={() => setConfirmOpen(false)}
				title="Delete this account?"
				description="Permanent: the encrypted cloud copy, invites, published content, plan data, and sign-in are removed."
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
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="trash"
							disabled={busy || phrase.trim().toLowerCase() !== DELETE_PHRASE}
							onClick={destroy}
						>
							{busy ? 'Deleting…' : 'Delete forever'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 10 }}>
					Campaigns on this device are not touched. The service first locks the account and removes
					the encrypted cloud copy; only after that purge is confirmed does it remove account data
					and the sign-in. If any step cannot be confirmed, deletion stops so you can retry safely.
					This cannot be undone. Type <strong style={{ color: T.ink }}>{DELETE_PHRASE}</strong> to
					confirm.
				</div>
				<Input
					id="delete-account-confirmation"
					value={phrase}
					onChange={(e: { target: { value: string } }) => setPhrase(e.target.value)}
					placeholder={DELETE_PHRASE}
					aria-label={`Type "${DELETE_PHRASE}" to confirm`}
					autoComplete="off"
					maxLength={DELETE_PHRASE.length}
					disabled={busy}
				/>
			</Dialog>
		</Panel>
	);
}
/** Honest gate when the account surface can't be real: local-only build, or signed out. */
function CloudAccountGate() {
	const auth = useAuth();
	if (!isAccountApiConfigured) {
		return (
			<Panel title="Cloud account" action={<Badge status="neutral">Local-only build</Badge>}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Account-management services aren’t available in this edition. Your campaigns and core
					table tools remain saved locally on this device.
				</div>
			</Panel>
		);
	}
	return (
		<Panel title="Cloud account" action={<Badge status="neutral">Signed out</Badge>}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Sign in to manage your profile, remembered devices, campaign invites, and preview plan.
					Your local campaign does not require an account.
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>
					Sign in
				</Button>
			</div>
		</Panel>
	);
}

export function SettingsAccount() {
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
				title="Onboarding & help"
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
						Replay setup
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Re-run the guided first-time setup, revisit the product tour, or reopen the
					table-readiness checklist any time.
				</div>
			</Panel>

			{cloudReady && <AccountDangerPanel />}
		</div>
	);
}
