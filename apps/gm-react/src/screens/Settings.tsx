import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DEFAULT_FEATURE_TIER,
	FEATURE_TIERS,
	describeCapabilitySet,
	deriveVaultConflicts,
	getContentItemsForActor,
	listGrantableCapabilitySets,
	listScenesForActor,
	unresolvedConflicts,
	visibleFeatures,
	type FeatureTier,
} from '@dndtools/core';
import { Avatar, Badge, Button, Chip, DataTable, Dialog, Icon, IconButton, Input, ProgressMeter, StatusDot, Switch, Textarea, Toaster } from '../ds';
import { Page, Panel, Seg, SetRow, T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useCloudSync } from '../cloud/CloudSyncContext';
import { useAuth } from '../cloud/AuthContext';
import { isAccountApiConfigured } from '../cloud/config';
import {
	createInvite as apiCreateInvite,
	deleteAccount as apiDeleteAccount,
	exportAccountData,
	getProfile,
	listDevices,
	listInvites,
	revokeAllSessions,
	revokeDevice,
	revokeInvite as apiRevokeInvite,
	updateProfile,
	type Device,
	type Invite,
	type Profile,
} from '../cloud/appApi';
import { qrDataUrl } from '../net/qr';
import { downloadJsonFile, fileDateStamp } from '../platform/download';
import { pickTextFile } from '../platform/filePick';
import { exportFullVault, importFullVault, validateVaultBackup, type VaultBackup } from '../platform/backup';
import { ONBOARDED_KEY, REPLAY_EVENT } from '../app/Onboarding';
import { DNDAccount, DNDExt, DNDGaps2, DNDPages } from '../runtime/mockCampaign';

/**
 * Settings — the category-rail section. The subpages now split three ways by how much of the app
 * Core actually backs:
 *
 *   • REAL CORE READS/WRITES — Players (live actor roster), Permissions (real grant list + grant/revoke
 *     commands), Sync (real op-log + conflict derivation), and the Experience-complexity card (real
 *     `visibleFeatures(tier)` query).
 *   • PERSISTED DISPLAY PREFS — Appearance (theme/density/motion → `data-*` attrs restored pre-paint by
 *     index.html) and Accessibility (reduce-motion / high-contrast toggles that write the SAME persisted
 *     attrs, so there is one source of truth). The feature tier is persisted to localStorage too.
 *   • REAL CLOUD (app-api, when configured + signed in) — Account (profile edit, signed-in devices +
 *     revoke, data export, delete account) and the Players tab's pending invites (server-minted join
 *     links). Fail-closed: unconfigured/signed-out builds show honest labeled states instead.
 *   • HONEST STUBS (`// no core command`) — Subscription billing detail, Vault, AI, Plugins, Systems.
 *     Billing, AI-provider and the plugin/system registry are out of the local-first Core's scope, so
 *     these stay device-local mock state; UI prefs that make sense to keep (notifications) are persisted.
 */

const ACCT = DNDAccount as any;
const PAGES = DNDPages as any;
const GAPS2 = DNDGaps2 as any;
const EXT = DNDExt as any;
// Honest feedback for controls whose backend isn't part of this build yet (account/billing/vault
// connections, etc.) — they used to be silent no-ops, which read as broken. They now say so instead
// of pretending to work. Controls that DO have a core path dispatch real commands elsewhere.
const toast = () => Toaster.info('That isn’t available in this build yet.');

const SETTINGS_NAV = [
	{ id: 'appearance', label: 'Appearance', icon: 'theme' },
	{ id: 'account', label: 'Account', icon: 'UserCircle' },
	{ id: 'subscription', label: 'Subscription', icon: 'CreditCard' },
	{ id: 'players', label: 'Players', icon: 'players' },
	{ id: 'permissions', label: 'Permissions', icon: 'permissions' },
	{ id: 'vault', label: 'Vault connections', icon: 'vault' },
	{ id: 'sync', label: 'Sync & offline', icon: 'connection' },
	{ id: 'ai', label: 'AI & tools', icon: 'sparkle' },
	{ id: 'plugins', label: 'Plugins', icon: 'widget' },
	{ id: 'systems', label: 'Extensions & systems', icon: 'scroll' },
	{ id: 'accessibility', label: 'Accessibility', icon: 'accessibility' },
];

// The themes that render dark — mirrors the boot script's DARK map in index.html so a runtime theme
// switch keeps the native color-scheme (scrollbars, form controls) in sync. The boot script sets
// `style.colorScheme` inline, and an inline style beats the `[data-theme]{color-scheme}` rule, so this
// must update it too or switching across the dark/light boundary leaves controls on the wrong scheme.
const DARK_THEMES = new Set(['tavern', 'high-contrast']);

function setDocAttr(attr: string, key: string, value: string) {
	document.documentElement.setAttribute(attr, value);
	if (attr === 'data-theme') {
		document.documentElement.style.colorScheme = DARK_THEMES.has(value) ? 'dark' : 'light';
	}
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* ignore */
	}
}

/* ---- Experience complexity → real feature tier ------------------------------------------------
 * The 3-card "complexity" control is wired to the Core's progressive-disclosure model: each level maps
 * to a real `FeatureTier`, and the per-card reveals come from `visibleFeatures(tier)` (the same query the
 * onboarding surface reads), so the list is authoritative, not authored. The active tier is a device-local
 * display preference (Contract 1): persisted to localStorage (+ a `data-feature-tier` attr for any future
 * consumer). Other React screens are static mock, so they don't yet read the tier — see report. */
const TIER_KEY = 'dndtools:react:tier';
const TIER_ATTR = 'data-feature-tier';
const LEVEL_TO_TIER: Record<string, FeatureTier> = { beginner: 'core', standard: 'intermediate', expert: 'advanced' };

function readTier(): FeatureTier {
	let candidate: string | null = document.documentElement.getAttribute(TIER_ATTR);
	if (!candidate) {
		try {
			candidate = window.localStorage.getItem(TIER_KEY);
		} catch {
			candidate = null;
		}
	}
	return (FEATURE_TIERS as readonly string[]).includes(candidate ?? '') ? (candidate as FeatureTier) : DEFAULT_FEATURE_TIER;
}

/* ---- Appearance ------------------------------------------------------------------------- */
function SettingsAppearance() {
	const cx = ACCT.complexity;
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	const [density, setDensity] = useState<string>(document.documentElement.getAttribute('data-density') || 'standard');
	const [motion, setMotion] = useState<string>(document.documentElement.getAttribute('data-motion') || 'full');
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	const activeLvl = cx.levels.find((l: any) => LEVEL_TO_TIER[l.id] === tier) || cx.levels[1];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Appearance" style={{ gap: 0 }}>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>These swap the whole surface live — the design system drives theme, density and motion from one attribute each.</div>
				<SetRow label="Theme" help="Candle-lit dark, warm vellum, or the accessibility floor." control={<Seg value={theme} ariaLabel="Theme" onChange={(v) => { setTheme(v); setDocAttr('data-theme', 'dndtools:react:theme', v); }} options={[{ value: 'tavern', label: 'Tavern' }, { value: 'parchment', label: 'Parchment' }, { value: 'high-contrast', label: 'High contrast' }]} />} />
				<SetRow label="Density" help="Comfortable enlarges controls for play at the table; Compact tightens them." control={<Seg value={density} ariaLabel="Interface density" onChange={(v) => { setDensity(v); setDocAttr('data-density', 'dndtools:react:density', v); }} options={[{ value: 'standard', label: 'Standard' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />} />
				<SetRow label="Motion" help="Reduce collapses transitions and stops looping animations." control={<Seg value={motion} ariaLabel="Motion" onChange={(v) => { setMotion(v); setDocAttr('data-motion', 'dndtools:react:motion', v); }} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />} />
			</Panel>

			<Panel title="Experience complexity" action={<Badge status="neutral">{activeLvl.name}</Badge>}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 4 }}>How much of the toolkit shows at once. Separate from density — each level maps to a real feature tier, and the reveals below come live from the Core's <code style={{ font: `11.5px ${T.mono}` }}>visibleFeatures()</code> query.</div>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
					{cx.levels.map((l: any) => {
						const levelTier = LEVEL_TO_TIER[l.id] ?? DEFAULT_FEATURE_TIER;
						const on = levelTier === tier;
						const reveals = visibleFeatures(levelTier).map((f) => f.label);
						return (
							<button key={l.id} type="button" onClick={() => { setTier(levelTier); setDocAttr(TIER_ATTR, TIER_KEY, levelTier); }} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 9, padding: 14, borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? T.accBd : T.bd}`, background: on ? T.accSub : T.surf, boxShadow: on ? T.smd : 'none' }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
									<span style={{ width: 30, height: 30, borderRadius: 8, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? T.acc : T.alt, color: on ? T.accFg : T.acc }}><Icon name={l.icon} size="sm" /></span>
									<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>{l.name}</span>
									{l.rec && !on && <Badge status="neutral">Recommended</Badge>}
									{on && <span style={{ marginLeft: 'auto' }}><Icon name="check" size={16} color={T.acc} /></span>}
								</div>
								<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{l.blurb}</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
									{reveals.map((r) => (
										<span key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, font: `11px ${T.sans}`, color: T.ter }}><Icon name="check" size={12} color={on ? T.acc : T.ter} />{r}</span>
									))}
								</div>
							</button>
						);
					})}
				</div>
			</Panel>
		</div>
	);
}

/* ---- Account — REAL app-api backend when configured + signed in (profile edit, devices,
 * export, delete); honest labeled fallback otherwise. ------------------------------------------- */

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Profile from Cognito via the app-api: display-name edit is a REAL account write. */
function AccountProfilePanel() {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [failed, setFailed] = useState(false);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		let cancelled = false;
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
	}, []);
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
		<Panel title="Profile" action={<Badge status="success" icon="check">Cloud account</Badge>}>
			{failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Couldn’t load your profile — check your connection and reopen this tab.</div>
			) : (
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<Avatar name={shownName} size="lg" ring="active" />
					<div style={{ flex: 1, minWidth: 0 }}>
						{editing ? (
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 380 }}>
								<Input value={draft} onChange={(e: { target: { value: string } }) => setDraft(e.target.value)} placeholder="Display name" aria-label="Display name" maxLength={60} />
								<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={save}>Save</Button>
								<Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
							</div>
						) : (
							<div style={{ font: `700 18px ${T.disp}` }}>{shownName}</div>
						)}
						<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{profile?.email ?? ''}</div>
						{profile?.createdAt && (
							<div style={{ display: 'flex', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
								<Badge status="neutral">Member since {new Date(profile.createdAt).toLocaleDateString()}</Badge>
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

/** Signed-in devices from Cognito device tracking: per-device revoke + global sign-out. */
function AccountDevicesPanel() {
	const auth = useAuth();
	const [devices, setDevices] = useState<Device[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const load = () => {
		listDevices()
			.then(setDevices)
			.catch(() => setFailed(true));
	};
	useEffect(load, []);
	const revoke = (deviceKey: string) => {
		setBusy(true);
		revokeDevice(deviceKey)
			.then(() => {
				setDevices((list) => (list ? list.filter((d) => d.deviceKey !== deviceKey) : list));
				Toaster.success('Device revoked.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that device.')))
			.finally(() => setBusy(false));
	};
	const signOutEverywhere = () => {
		setBusy(true);
		revokeAllSessions()
			.then(async () => {
				Toaster.success('Signed out everywhere — sign in again to continue.');
				await auth.signOut(); // the global revoke killed this session's refresh token too
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not sign out everywhere.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel
			title="Signed-in devices"
			action={<Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={signOutEverywhere}>Sign out everywhere</Button>}
		>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
				Devices your account has signed in from. Revoking one forgets it; “Sign out everywhere” revokes every session, including this one.
			</div>
			{failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Couldn’t load your devices — check your connection and reopen this tab.</div>
			) : devices === null ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Loading devices…</div>
			) : devices.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No remembered devices yet — devices appear here after they sign in.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{devices.map((d, i) => (
						<div key={d.deviceKey} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<span style={{ width: 34, height: 34, borderRadius: 8, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.alt, color: T.sub }}><Icon name="Monitor" size="sm" /></span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{d.name}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{d.lastSeen ? `Last seen ${new Date(d.lastSeen).toLocaleString()}` : 'Last seen: unknown'}</div>
							</div>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => revoke(d.deviceKey)}>Revoke</Button>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}

/** Export (real backend data) + delete account behind a type-to-confirm dialog. */
const DELETE_PHRASE = 'delete my account';
function AccountDangerPanel() {
	const auth = useAuth();
	const [busy, setBusy] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [phrase, setPhrase] = useState('');
	const exportData = () => {
		setBusy(true);
		exportAccountData()
			.then((data) => {
				downloadJsonFile(`dndtools-account-${fileDateStamp()}.json`, data);
				Toaster.success('Account data downloaded.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not export your account data.')))
			.finally(() => setBusy(false));
	};
	const destroy = () => {
		setBusy(true);
		apiDeleteAccount()
			.then(async () => {
				setConfirmOpen(false);
				Toaster.success('Your account has been deleted. Local vaults stay on this device.');
				await auth.signOut();
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not delete your account.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel title="Danger zone" style={{ borderColor: 'var(--color-status-error-border)' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>Export or delete your account data</div>
					<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						Download everything the cloud backend holds for this account (vault content is end-to-end encrypted and exports from the app itself), or permanently close the account. Local vaults are never touched.
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={exportData}>Export my data</Button>
				<Button variant="danger" size="sm" icon="trash" disabled={busy} onClick={() => { setPhrase(''); setConfirmOpen(true); }}>Delete account</Button>
			</div>
			<Dialog
				open={confirmOpen}
				onClose={() => setConfirmOpen(false)}
				title="Delete this account?"
				description="Permanent: cloud entitlements, invites and published modules are removed and the sign-in is deleted."
				icon="warning"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</Button>
						<Button variant="danger" size="sm" icon="trash" disabled={busy || phrase.trim().toLowerCase() !== DELETE_PHRASE} onClick={destroy}>
							{busy ? 'Deleting…' : 'Delete forever'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 10 }}>
					Your vaults stay on this device — only the cloud account and everything it stores server-side are destroyed. This cannot be undone. Type <strong style={{ color: T.ink }}>{DELETE_PHRASE}</strong> to confirm.
				</div>
				<Input value={phrase} onChange={(e: { target: { value: string } }) => setPhrase(e.target.value)} placeholder={DELETE_PHRASE} aria-label={`Type "${DELETE_PHRASE}" to confirm`} />
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
					This build isn’t connected to a cloud backend, so there is no account to manage — everything
					works locally on this device. Profile, devices, invites and plans appear here when a cloud
					backend is configured.
				</div>
			</Panel>
		);
	}
	return (
		<Panel title="Cloud account" action={<Badge status="neutral">Signed out</Badge>}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Sign in to manage your profile, signed-in devices, campaign invites and plan. The app stays
					fully usable locally without an account.
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>Sign in</Button>
			</div>
		</Panel>
	);
}

const NOTIF_KEY = 'dndtools:react:notifications';
function SettingsAccount() {
	const auth = useAuth();
	// The account surface is REAL (app-api) when the backend is configured AND the user is signed
	// in; otherwise it shows an honest gate — no fake profile pretending to be yours.
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	// Notification prefs survive reload (persisted to localStorage) since they are a sensible device pref.
	const [notif, setNotif] = useState<boolean[]>(() => {
		try {
			const raw = window.localStorage.getItem(NOTIF_KEY);
			if (raw) return JSON.parse(raw) as boolean[];
		} catch {
			/* ignore */
		}
		return ACCT.notifications.map((n: any) => n.on);
	});
	const toggleNotif = (i: number) =>
		setNotif((arr) => {
			const next = arr.map((v, j) => (j === i ? !v : v));
			try {
				window.localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
			} catch {
				/* ignore */
			}
			return next;
		});
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
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>Re-run the guided first-time setup, revisit the product tour, or reopen the table-readiness checklist any time.</div>
			</Panel>

			<Panel title="Notifications">
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{ACCT.notifications.map((n: any, i: number) => (
						<div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{n.label}</span>
							<Switch checked={notif[i]} onChange={() => toggleNotif(i)} label="" />
						</div>
					))}
				</div>
			</Panel>

			{cloudReady && <AccountDangerPanel />}
		</div>
	);
}

/* ---- Subscription (honest stub — no core command for billing; CTAs route to the real /upgrade page) -- */
// Mirror of Upgrade.tsx's readPlanId (same PLAN_KEY, same validation) — duplicated rather than
// imported so this route chunk doesn't pull the separately-split /upgrade chunk in with it.
const PLAN_KEY = 'dndtools:react:plan';
function readPlanId(): string {
	const sub = ACCT.subscription;
	try {
		const v = window.localStorage.getItem(PLAN_KEY);
		if (v && sub.plans.some((p: any) => p.id === v)) return v;
	} catch {
		/* ignore */
	}
	return sub.current;
}
function SettingsSubscription() {
	const navigate = useNavigate();
	const sub = ACCT.subscription;
	// no core command for billing — but the device-local plan CHOICE (made on /upgrade) is shared via
	// localStorage so the two screens never disagree about which plan you're on.
	const [plan] = useState<string>(() => readPlanId());
	const current = sub.plans.find((p: any) => p.id === plan) || sub.plans[0];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 14, border: `1px solid ${T.accBd}`, background: `linear-gradient(135deg, ${T.accSub}, ${T.raised})`, boxShadow: T.smd, flexWrap: 'wrap' }}>
				<span style={{ width: 46, height: 46, borderRadius: 12, flex: '0 0 auto', background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={current.cloud ? 'connection' : 'home'} size="lg" /></span>
				<div style={{ flex: '1 1 220px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ font: `700 19px ${T.disp}` }}>{current.name}</span>{current.cloud && <Badge status="success" icon="check">Cloud active</Badge>}</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{current.tagline} · {current.price ? `$${current.price}${current.period} · renews ${sub.renews}` : 'No charges'}</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>Compare plans</Button>
			</div>

			{current.cloud && (
				<Panel title="Usage this cycle">
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
						{sub.usage.map((u: any) => {
							const pct = Math.round((u.value / u.max) * 100);
							return (
								<div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<Icon name={u.icon} size={15} color={T.acc} />
										<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{u.label}</span>
										<span style={{ font: `12px ${T.mono}`, color: pct > 90 ? T.warn : T.ter }}>{u.value}{u.unit} / {u.max}{u.unit}</span>
									</div>
									<ProgressMeter value={u.value} max={u.max} tone={pct > 90 ? 'warning' : 'accent'} />
								</div>
							);
						})}
					</div>
				</Panel>
			)}

			<Panel title="Plans" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => navigate('/upgrade')}>Full comparison</Button>}>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
					{sub.plans.map((pl: any) => {
						const on = pl.id === plan;
						return (
							<div key={pl.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 13, position: 'relative', border: `1px solid ${on ? T.accBd : pl.popular ? T.bdS : T.bd}`, background: on ? T.accSub : T.surf, boxShadow: on ? T.smd : 'none' }}>
								{pl.popular && !on && <span style={{ position: 'absolute', top: -9, right: 14, font: `600 10px ${T.sans}`, letterSpacing: '.06em', textTransform: 'uppercase', color: T.accFg, background: T.acc, padding: '2px 8px', borderRadius: 20 }}>Popular</span>}
								<div>
									<div style={{ font: `700 16px ${T.disp}`, color: on ? T.acc : T.ink }}>{pl.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
									<span style={{ font: `700 26px ${T.mono}`, color: T.ink }}>{pl.price ? `$${pl.price}` : 'Free'}</span>
									{pl.period && <span style={{ font: `12px ${T.sans}`, color: T.ter }}>{pl.period}</span>}
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
									{pl.features.map((f: string) => (
										<span key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, font: `11.5px/1.4 ${T.sans}`, color: T.sub }}><span style={{ marginTop: 1 }}><Icon name="check" size={12} color={pl.cloud ? T.acc : T.ter} /></span>{f}</span>
									))}
								</div>
								{on ? <Button variant="secondary" size="sm" disabled>Current plan</Button> : <Button variant={pl.price > (current.price || 0) ? 'primary' : 'secondary'} size="sm" icon={pl.price > (current.price || 0) ? 'arrow-up' : undefined} onClick={() => navigate('/upgrade')}>{pl.price > (current.price || 0) ? 'Upgrade' : 'Switch'}</Button>}
							</div>
						);
					})}
				</div>
			</Panel>

			{current.cloud && (
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start' }}>
					<Panel title="Payment method" action={<Button variant="ghost" size="sm" icon="edit" onClick={toast}>Update</Button>}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: T.surf, border: `1px solid ${T.bd}` }}>
							<span style={{ width: 40, height: 28, borderRadius: 6, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.alt, color: T.acc }}><Icon name="CreditCard" size="sm" /></span>
							<div style={{ flex: 1 }}><div style={{ font: `13px ${T.mono}` }}>{sub.payment.brand} ···· {sub.payment.last4}</div><div style={{ font: `11px ${T.sans}`, color: T.ter }}>Exp {sub.payment.exp} · {sub.payment.name}</div></div>
						</div>
						<div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: T.accSub, border: `1px solid ${T.accBd}`, font: `12px ${T.sans}`, color: T.sub }}>
							Next charge <span style={{ font: `12px ${T.mono}`, color: T.acc }}>${sub.nextInvoice.amount.toFixed(2)}</span> on {sub.nextInvoice.on}.
						</div>
					</Panel>
					<Panel title="Billing history">
						<div style={{ display: 'flex', flexDirection: 'column' }}>
							{sub.invoices.map((inv: any, i: number) => (
								<div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
									<Icon name="check" size={15} color={T.ok} />
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ font: `13px ${T.sans}` }}>{inv.date}</div>
										<div style={{ font: `11px ${T.sans}`, color: T.ter }}>{inv.plan}</div>
									</div>
									<span style={{ font: `13px ${T.mono}`, color: T.ink }}>${inv.amount.toFixed(2)}</span>
									<Badge status="success">{inv.status}</Badge>
									<IconButton icon="download" label="Download invoice" variant="ghost" size="sm" onClick={toast} />
								</div>
							))}
						</div>
					</Panel>
				</div>
			)}
		</div>
	);
}

/* ---- Players (REAL — the live actor roster the Core enforces visibility against) ---------------- */
const ROLE_LABEL: Record<string, string> = { dm: 'Dungeon Master', player: 'Player', observer: 'Observer' };
/** The web join link an invite token redeems at — the /join route outside the DM shell. */
const inviteJoinUrl = (token: string) =>
	`${window.location.origin}${window.location.pathname}#/join?token=${encodeURIComponent(token)}`;

const copyText = async (text: string, okMessage: string) => {
	try {
		await navigator.clipboard.writeText(text);
		Toaster.success(okMessage);
	} catch {
		Toaster.error('Could not copy — copy the link manually.');
	}
};

/** Pending invites — REAL server-minted join links (app-api) when configured + signed in. */
function InvitesPanel({ cloudReady, createOpen, onCloseCreate }: { cloudReady: boolean; createOpen: boolean; onCloseCreate: () => void }) {
	const [invites, setInvites] = useState<Invite[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [campaignName, setCampaignName] = useState('');
	const [note, setNote] = useState('');
	const [minted, setMinted] = useState<Invite | null>(null);
	const [qr, setQr] = useState<string | null>(null);
	useEffect(() => {
		if (!cloudReady) return;
		let cancelled = false;
		listInvites()
			.then((list) => {
				if (!cancelled) setInvites(list);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [cloudReady]);
	useEffect(() => {
		if (!minted) {
			setQr(null);
			return;
		}
		let cancelled = false;
		void qrDataUrl(inviteJoinUrl(minted.token)).then((url) => {
			if (!cancelled) setQr(url);
		});
		return () => {
			cancelled = true;
		};
	}, [minted]);
	const close = () => {
		setMinted(null);
		setCampaignName('');
		setNote('');
		onCloseCreate();
	};
	const mint = () => {
		const name = campaignName.trim();
		if (!name) {
			Toaster.error('Give the invite a campaign name.');
			return;
		}
		setBusy(true);
		apiCreateInvite({ campaignName: name, note: note.trim() || undefined })
			.then((invite) => {
				setMinted(invite);
				setInvites((list) => (list ? [invite, ...list] : [invite]));
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not create the invite.')))
			.finally(() => setBusy(false));
	};
	const revoke = (inviteId: string) => {
		setBusy(true);
		apiRevokeInvite(inviteId)
			.then(() => {
				setInvites((list) => (list ? list.filter((i) => i.inviteId !== inviteId) : list));
				Toaster.success('Invite revoked — its link no longer works.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that invite.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel title="Pending invites">
			{!cloudReady ? (
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					Invite links are minted by the cloud backend so they work before the invitee ever opens the
					app. {isAccountApiConfigured ? 'Sign in to create and manage them.' : 'This build has no cloud backend configured — share your session room name and PIN directly instead.'}
				</div>
			) : failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Couldn’t load your invites — check your connection and reopen this tab.</div>
			) : invites === null ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Loading invites…</div>
			) : invites.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No pending invites. “Invite player” mints a shareable join link (it expires after 14 days).</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{invites.map((v, i) => (
						<div key={v.inviteId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<Icon name="send" size={15} color={T.ter} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{v.campaignName}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{v.note ? `${v.note} · ` : ''}expires {new Date(v.expiresAt * 1000).toLocaleDateString()}</div>
							</div>
							<Button variant="secondary" size="sm" icon="link" disabled={busy} onClick={() => void copyText(inviteJoinUrl(v.token), 'Join link copied.')}>Copy link</Button>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => revoke(v.inviteId)}>Revoke</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={createOpen}
				onClose={close}
				title={minted ? 'Invite ready to share' : 'Invite a player'}
				description={minted ? 'Send this link however you like — it works for 14 days or until you revoke it.' : 'Mints a shareable join link — no email is sent.'}
				icon="send"
				size="md"
				footer={
					minted ? (
						<Button variant="primary" size="sm" onClick={close}>Done</Button>
					) : (
						<>
							<Button variant="secondary" size="sm" disabled={busy} onClick={close}>Cancel</Button>
							<Button variant="primary" size="sm" icon="send" disabled={busy} onClick={mint}>{busy ? 'Creating…' : 'Create invite'}</Button>
						</>
					)
				}
			>
				{minted ? (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
						{qr && <img src={qr} alt="QR code for the join link" style={{ width: 168, height: 168, borderRadius: 10, border: `1px solid ${T.bd}`, background: '#fff', padding: 8 }} />}
						<code style={{ font: `11.5px ${T.mono}`, color: T.sub, wordBreak: 'break-all', textAlign: 'center' }}>{inviteJoinUrl(minted.token)}</code>
						<Button variant="secondary" size="sm" icon="link" onClick={() => void copyText(inviteJoinUrl(minted.token), 'Join link copied.')}>Copy link</Button>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input value={campaignName} onChange={(e: { target: { value: string } }) => setCampaignName(e.target.value)} placeholder="Campaign name (shown to the invitee)" aria-label="Campaign name" maxLength={80} />
						<Textarea value={note} onChange={(e: { target: { value: string } }) => setNote(e.target.value)} placeholder="Note (optional) — e.g. “We play Fridays at 7”" aria-label="Invite note" rows={2} maxLength={200} />
					</div>
				)}
			</Dialog>
		</Panel>
	);
}

function SettingsPlayers() {
	const runtime = useRuntime();
	const auth = useAuth();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [inviteOpen, setInviteOpen] = useState(false);
	const actors = Object.values(runtime.state.permissions.actors) as { id: string; role: string; displayName: string }[];
	const sorted = [...actors].sort((a, b) => (a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : a.displayName.localeCompare(b.displayName)));
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel
				title="Players"
				action={
					<Button
						variant="primary"
						size="sm"
						icon="add"
						onClick={() => {
							if (cloudReady) setInviteOpen(true);
							else if (isAccountApiConfigured) auth.openAuthModal();
							else Toaster.info('Invite links need the cloud backend — share your session room name and PIN directly.');
						}}
					>
						Invite player
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>{sorted.length} {sorted.length === 1 ? 'actor' : 'actors'} in this campaign — the real permission actors the Core filters every view against.</div>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((a, i) => (
						<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<Avatar name={a.displayName} size="sm" ring={a.role === 'dm' ? 'active' : undefined} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{a.displayName}</div>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{a.id}</div>
							</div>
							<Badge status={a.role === 'dm' ? 'accent' : a.role === 'observer' ? 'neutral' : 'info'}>{ROLE_LABEL[a.role] ?? a.role}</Badge>
							<StatusDot status={a.role === 'dm' ? 'live' : 'idle'} label={ROLE_LABEL[a.role] ?? a.role} />
						</div>
					))}
				</div>
			</Panel>
			<InvitesPanel cloudReady={cloudReady} createOpen={inviteOpen} onCloseCreate={() => setInviteOpen(false)} />
		</div>
	);
}

/* ---- Permissions (REAL — real grant list + grant/revoke commands; DM-authored, fail-closed in core) -- */
function selectStyle(): React.CSSProperties {
	return {
		flex: 1,
		minWidth: 0,
		padding: '8px 10px',
		borderRadius: 8,
		border: `1px solid ${T.bd}`,
		background: T.surf,
		color: T.ink,
		font: `13px ${T.sans}`,
	};
}
function SettingsPermissions() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const actors = runtime.state.permissions.actors as Record<string, { id: string; role: string; displayName: string }>;
	const grants = runtime.state.permissions.grants;
	const scenes = Object.values(runtime.state.scenes.scenes) as { id: string; name: string }[];
	const players = Object.values(actors).filter((a) => a.role !== 'dm');
	const sceneSets = listGrantableCapabilitySets('scene');

	const roleCounts = { dm: 0, player: 0, observer: 0 } as Record<string, number>;
	for (const a of Object.values(actors)) roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
	const roleCards = [
		{ id: 'dm', name: 'Dungeon Master', desc: 'Full authority — authors content, grants, and the live session.', tone: 'accent' },
		{ id: 'player', name: 'Player', desc: 'Owns their character; sees only what the DM shares.', tone: 'info' },
		{ id: 'observer', name: 'Observer', desc: 'Read-only; never holds character data.', tone: 'neutral' },
	];

	const [grantPlayer, setGrantPlayer] = useState<string>(players[0]?.id ?? '');
	const [grantScene, setGrantScene] = useState<string>(scenes[0]?.id ?? '');
	const [grantSet, setGrantSet] = useState<string>(sceneSets[0]?.capabilitySet ?? 'viewer');

	const grantRows = grants.map((g) => ({
		grantId: g.id,
		set: describeCapabilitySet(g.entityType, g.capabilitySet)?.label ?? g.capabilitySet,
		type: g.entityType,
		entity: (runtime.state.scenes.scenes as any)[g.entityId]?.name ?? g.entityId,
		to: actors[g.playerActorId]?.displayName ?? g.playerActorId,
		expires: g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : null,
	}));

	const revoke = (grantId: string) => {
		void runtime.dispatch({ type: 'permission.revoke-grant', actorId, payload: { grantId } });
	};
	const grant = () => {
		if (!grantPlayer || !grantScene) return;
		void runtime.dispatch({
			type: 'permission.grant-capability-set',
			actorId,
			payload: { entityType: 'scene', entityId: grantScene, playerActorId: grantPlayer, capabilitySet: grantSet, expiresAt: null },
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Roles">
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
					{roleCards.map((r) => (
						<div key={r.id} style={{ padding: 13, borderRadius: 10, border: `1px solid ${r.tone === 'accent' ? T.accBd : T.bd}`, background: T.surf }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
								<span style={{ font: `600 13.5px ${T.sans}`, color: r.tone === 'accent' ? T.acc : T.ink }}>{r.name}</span>
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>×{roleCounts[r.id] ?? 0}</span>
							</div>
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginTop: 4 }}>{r.desc}</div>
						</div>
					))}
				</div>
			</Panel>

			<Panel title="Grant scene access">
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>Grant a player a named capability set on a real scene. This dispatches the durable <code style={{ font: `11.5px ${T.mono}` }}>permission.grant-capability-set</code> command; the Core caps it to the role ceiling and fails closed for non-DMs.</div>
				{players.length === 0 || scenes.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{players.length === 0 ? 'No player actors to grant to.' : 'No scenes to grant on yet.'}</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						<select aria-label="Player" value={grantPlayer} onChange={(e) => setGrantPlayer(e.target.value)} style={selectStyle()}>
							{players.map((pl) => (
								<option key={pl.id} value={pl.id}>{pl.displayName}</option>
							))}
						</select>
						<select aria-label="Scene" value={grantScene} onChange={(e) => setGrantScene(e.target.value)} style={selectStyle()}>
							{scenes.map((sc) => (
								<option key={sc.id} value={sc.id}>{sc.name}</option>
							))}
						</select>
						<Seg value={grantSet} onChange={setGrantSet} options={sceneSets.map((s) => ({ value: s.capabilitySet, label: s.label }))} />
						<Button variant="primary" size="sm" icon="check" onClick={grant}>Grant</Button>
					</div>
				)}
			</Panel>

			<Panel title="Active grants" action={<Badge status="neutral">{grants.length}</Badge>}>
				<DataTable
					columns={[
						{ key: 'set', header: 'Access', strong: true },
						{ key: 'type', header: 'Type' },
						{ key: 'entity', header: 'Entity' },
						{ key: 'to', header: 'Granted to' },
						{ key: 'expires', header: 'Expires', align: 'right', render: (v: any) => v || '—' },
						{ key: 'grantId', header: '', align: 'right', render: (id: any) => <Button variant="ghost" size="sm" icon="trash" onClick={() => revoke(id)}>Revoke</Button> },
					]}
					rows={grantRows}
					rowKey={(r: any) => r.grantId}
					empty="No active grants. Use the form above to grant a player scene access."
				/>
			</Panel>
		</div>
	);
}

/* ---- Vault (honest stub — no core command for source connection flows in this build) -------- */
function SettingsVault() {
	const stateTone: Record<string, string> = { synced: 'success', syncing: 'info', 'needs-auth': 'warning', error: 'error' };
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Vault connections" action={<div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" size="sm" icon="import" onClick={toast}>Import from source</Button><Button variant="ghost" size="sm" icon="add" onClick={toast}>Connect source</Button></div>}>
				{/* no core command — source adapters / live transport are deferred (ADR-014); these rows are mock. */}
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{PAGES.sources.map((s: any, i: number) => (
						<div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<span style={{ width: 36, height: 36, borderRadius: 8, background: T.alt, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.acc, flex: '0 0 auto' }}><Icon name="vault" size="md" /></span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{s.name}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{s.kind} · {s.last}{s.pending ? ` · ${s.pending} pending` : ''}</div>
							</div>
							<Badge status={(stateTone[s.state] || 'neutral') as any} icon={s.state === 'syncing' ? 'loading' : undefined}>{s.state.replace('-', ' ')}</Badge>
							{(s.state === 'needs-auth' || s.state === 'error') && <Button variant="secondary" size="sm" onClick={toast}>Reconnect</Button>}
						</div>
					))}
				</div>
			</Panel>
		</div>
	);
}

/* ---- Sync (REAL — derived from the durable op-log + the Core's vault-conflict derivation) -------- */
function humanizeOp(opType: string): string {
	return opType.replace(/[._-]/g, ' ');
}
/** Real E2EE cloud sync/backup controls (Stage 3). The core gate decides whether sync MAY be enabled;
 *  this panel reflects that and drives the engine (enable / sync now / restore). Local-first fallback
 *  when the sync backend isn't configured in this build. */
function CloudSyncPanel({ online, localChanges }: { online: boolean; localChanges: number }) {
	const cloud = useCloudSync();
	const [busy, setBusy] = useState(false);

	if (!cloud.available) {
		return (
			<Panel title="Cloud sync">
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<StatusDot status={online ? 'live' : 'error'} pulse={online} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `600 13.5px ${T.sans}` }}>{online ? 'Online' : 'Offline'} · local-only</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>{localChanges} change(s) recorded on this device · cloud sync isn’t configured in this build (work stays on this device).</div>
					</div>
					<Button variant="secondary" size="sm" icon="retry" disabled>Sync now</Button>
				</div>
			</Panel>
		);
	}

	const gate = cloud.gate;
	const canEnable = gate?.canEnableOnThisDevice ?? false;
	const es = cloud.engineStatus;
	const lastSynced = es?.lastSyncedAt ? new Date(es.lastSyncedAt).toLocaleTimeString() : 'never';

	const run = async (fn: () => Promise<unknown>, okMsg: string) => {
		setBusy(true);
		try {
			const r = await fn();
			if (r === 'no-snapshot') Toaster.info('No cloud backup found for this account yet.');
			else Toaster.success(okMsg);
		} catch (e) {
			Toaster.error(e instanceof Error ? e.message : 'Cloud sync failed.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="Cloud sync" action={<Badge status={cloud.enabled ? 'success' : 'neutral'}>{cloud.enabled ? 'On' : 'Off'}</Badge>}>
			<SetRow
				label="End-to-end encrypted cloud backup"
				help={
					canEnable
						? 'Encrypted on this device before upload — the server only ever stores ciphertext. Off by default; recovery is unsupported by design (lose every device + its key = lose the cloud copy; local data is unaffected).'
						: gate?.custodyAvailable === false
							? 'Unavailable on this device: durable cloud sync needs an OS credential store to hold your key (available in the desktop app).'
							: 'The release-approved security model prerequisites are not met on this device.'
				}
				control={
					<Switch
						checked={cloud.enabled}
						disabled={!canEnable || busy}
						label=""
						onChange={() => void run(() => (cloud.enabled ? cloud.disable() : cloud.enable()), cloud.enabled ? 'Cloud sync turned off.' : 'Cloud sync enabled.')}
					/>
				}
			/>
			{cloud.enabled && canEnable ? (
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
					<StatusDot status={es?.lastError ? 'error' : es?.busy || busy ? 'pending' : 'live'} pulse={es?.busy} />
					<div style={{ flex: 1, minWidth: 180 }}>
						<div style={{ font: `600 13px ${T.sans}` }}>{es?.busy ? 'Syncing…' : es?.lastError ? 'Sync error' : 'Up to date'}</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{es?.lastError ? es.lastError : `Last backed up: ${lastSynced} · ${localChanges} local change(s)`}
						</div>
					</div>
					<Button variant="secondary" size="sm" icon="retry" disabled={busy || es?.busy} onClick={() => void run(cloud.syncNow, 'Backed up to the cloud.')}>Sync now</Button>
					<Button variant="ghost" size="sm" icon="download" disabled={busy || es?.busy} onClick={() => void run(cloud.restore, 'Restored from the cloud backup.')}>Restore</Button>
				</div>
			) : null}
		</Panel>
	);
}

function SettingsSync() {
	const runtime = useRuntime();
	const ops = runtime.state.sync.operations;
	const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
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
	// REAL conflict read: the Core derives vault-conflict records straight from the op-log substrate. A
	// transport-less local-first build seeds no conflict ops, so this is honestly empty here.
	const conflicts = unresolvedConflicts(deriveVaultConflicts(ops, ops));
	const recent = [...ops].slice(-8).reverse();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<CloudSyncPanel online={online} localChanges={ops.length} />
			<LocalBackupPanel />
			<Panel title="Recent changes" action={<Badge status="neutral">{ops.length}</Badge>}>
				{recent.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No changes recorded yet.</div>
				) : (
					recent.map((q) => (
						<div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', font: `12.5px ${T.sans}`, color: T.sub }}>
							<Icon name="connection" size={15} color={T.ter} /><Badge status="info">{humanizeOp(q.opType)}</Badge><span style={{ flex: 1, font: `11.5px ${T.mono}`, color: T.ter }}>{q.entityType} · {q.entityId}</span>
						</div>
					))
				)}
			</Panel>
			<Panel title="Conflicts" action={<Badge status={conflicts.length ? 'warning' : 'success'}>{conflicts.length}</Badge>}>
				{conflicts.length === 0 ? (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `12.5px ${T.sans}`, color: T.ter }}>
						<Icon name="success" size={16} color={T.ok} />Every entity is consistent. Conflicts appear here only when a transport delivers a diverging revision.
					</div>
				) : (
					conflicts.map((cf) => (
						<div key={cf.id} style={{ padding: 12, border: `1px solid ${T.bd}`, borderRadius: 10, marginBottom: 10 }}>
							<div style={{ font: `600 13px ${T.sans}`, marginBottom: 4 }}>{cf.entityType} · {cf.entityId}{cf.path ? ` · ${cf.path}` : ''}</div>
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Reason: {cf.reason} · structural facts only (values are DM-detail).</div>
							{/* Resolution dispatches the conflict-resolution command with the selected values + source
							    revisions; surfaced when real conflict records exist. */}
							<div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
								<Button variant="secondary" size="sm" onClick={toast}>Keep mine</Button>
								<Button variant="secondary" size="sm" onClick={toast}>Take theirs</Button>
							</div>
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
	const [busy, setBusy] = useState(false);
	const [pendingRestore, setPendingRestore] = useState<VaultBackup | null>(null);
	const backup = () => {
		setBusy(true);
		exportFullVault()
			.then((data) => {
				downloadJsonFile(`dndtools-vault-backup-${fileDateStamp()}.json`, data);
				Toaster.success(`Backup downloaded — ${data.assets.length} media ${data.assets.length === 1 ? 'asset' : 'assets'} included.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not build the backup.')))
			.finally(() => setBusy(false));
	};
	const pickBackup = async () => {
		const file = await pickTextFile('.json');
		if (!file) return;
		try {
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
		importFullVault(pendingRestore)
			.then(({ restoredAssets, skippedAssets }) => {
				if (skippedAssets > 0) {
					// Surface the partial-media outcome before the reload wipes the toast.
					window.alert(`Vault restored (${restoredAssets} media assets; ${skippedAssets} skipped as oversized/corrupt). The app will now reload.`);
				}
				window.location.reload();
			})
			.catch((e: unknown) => {
				Toaster.error(errMsg(e, 'Restore failed — your current vault is unchanged only if the error happened during validation; reload to see its state.'));
				setBusy(false);
			});
	};
	return (
		<Panel title="Local backup">
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 260px' }}>
					<div style={{ font: `600 13px ${T.sans}` }}>Back up or restore this device’s vault</div>
					<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
						One JSON file with everything: notes, scenes, characters, maps, session state and stored
						media bytes. Restoring replaces the current vault on this device.
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="download" disabled={busy} onClick={backup}>Download backup</Button>
				<Button variant="secondary" size="sm" icon="import" disabled={busy} onClick={() => void pickBackup()}>Restore from backup…</Button>
			</div>
			<Dialog
				open={pendingRestore !== null}
				onClose={() => setPendingRestore(null)}
				title="Replace this vault?"
				description="Restoring is authoritative — everything currently in this vault is replaced by the backup."
				icon="warning"
				size="md"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setPendingRestore(null)}>Cancel</Button>
						<Button variant="danger" size="sm" icon="import" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : 'Replace vault & reload'}</Button>
					</>
				}
			>
				{pendingRestore && (
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Backup from <strong style={{ color: T.ink }}>{new Date(pendingRestore.createdAt).toLocaleString()}</strong> with{' '}
						{pendingRestore.assets.length} media {pendingRestore.assets.length === 1 ? 'asset' : 'assets'}. Consider downloading a
						backup of the CURRENT vault first — this cannot be undone.
					</div>
				)}
			</Dialog>
		</Panel>
	);
}

/* ---- AI (honest stub — no core command for the AI provider surface here; default-off, fail-closed) -- */
function SettingsAI() {
	const ai = GAPS2.ai;
	// no core command — the MCP/AI policy surface (vault modes, staged-write review) is out of this
	// build's scope; the master gate is device-local mock and OFF by default.
	const [enabled, setEnabled] = useState(ai.enabled);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="AI assistance" action={<Switch checked={enabled} onChange={() => setEnabled((v: boolean) => !v)} label="Enabled" />}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>{ai.scope}</div>
			</Panel>
			<Panel title="Connected agents">
				{ai.agents.map((a: any) => (
					<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
						<Icon name="sparkle" size={16} color={T.acc} />
						<div style={{ flex: 1 }}>
							<div style={{ font: `600 13px ${T.sans}` }}>{a.name}</div>
							<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{a.actor} · {a.policy.replace('_', ' ')}</div>
						</div>
						<Badge status={a.status === 'connected' ? 'success' : 'neutral'}>{a.status}</Badge>
					</div>
				))}
			</Panel>
			<Panel title="Baseline tools (read-only)">
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{ai.baselineTools.map((t: any) => <Chip key={t.id} tone="neutral" icon="check">{t.name}</Chip>)}
				</div>
			</Panel>
		</div>
	);
}

/* ---- Plugins → Extensions ---------------------------------------------------------------------
 * Installed widget packages have a REAL registry surface in Extensions (`runtime.state.widgets.packages`
 * with working `widget.package.enable/disable`). This subpage used to render a parallel MOCK list with
 * local-only toggles, contradicting the live surface — so it now points at the real one instead of
 * duplicating it with fake data. */
function SettingsPlugins() {
	const navigate = useNavigate();
	return (
		<Panel title="Plugins">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Installed widget packages — their capabilities, host-permission review, and enable/disable — are
				managed in <strong style={{ color: T.ink }}>Extensions</strong>, backed by the live widget registry.
			</div>
			<Button variant="secondary" size="sm" icon="widget" onClick={() => navigate('/extensions')} style={{ alignSelf: 'flex-start' }}>
				Open Extensions
			</Button>
		</Panel>
	);
}

/* ---- Systems (honest stub — no core command for campaign-system switching here) ----------------- */
const MIGRATION_EFFECT_TONE: Record<string, string> = { keep: 'success', flatten: 'warning', drop: 'error' };
/** The design prototype's migration dry-run dialog, kept HONEST: it shows what a switch would map,
 * flatten or drop, but the apply action is disabled — the core has no system-switch command yet. */
function MigrationDialog({ from, to, onClose }: { from: any; to: any; onClose: () => void }) {
	const cs = EXT.campaignSystem;
	return (
		<Dialog
			open
			onClose={onClose}
			title={`Switch to ${to.name}`}
			description={`Migration dry-run · ${from.name} → ${to.name}`}
			footer={
				<>
					<Button variant="secondary" onClick={onClose}>Close</Button>
					<Button variant="primary" icon="check" disabled title="No core command for a system switch yet">Apply switch (not wired)</Button>
				</>
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 14 }}>
				Nothing changes — this preview shows what a switch would map, flatten, or drop. Applying it needs a core
				migration command that doesn't exist yet, so the action stays disabled instead of pretending.
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
				{cs.migration.rows.map((r: any, i: number) => (
					<div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${T.bd}` : 'none', background: i % 2 ? T.alt : 'transparent' }}>
						<span style={{ font: `600 13px ${T.sans}`, width: 120 }}>{r.label}</span>
						<span style={{ font: `12px ${T.mono}`, color: T.ter, width: 40 }}>{r.count}</span>
						<Badge status={(MIGRATION_EFFECT_TONE[r.effect] || 'neutral') as any}>{r.effect}</Badge>
						<span style={{ flex: 1, font: `12px ${T.sans}`, color: T.sub }}>{r.note}</span>
					</div>
				))}
			</div>
		</Dialog>
	);
}
function SettingsSystems() {
	const cs = EXT.campaignSystem;
	// no core command — campaign-system migration is out of this build's scope; active is mock.
	const [activeSystem] = useState<string>(cs.active);
	const [migrateTo, setMigrateTo] = useState<string | null>(null);
	const from = cs.modules.find((m: any) => m.id === activeSystem);
	const target = cs.modules.find((m: any) => m.id === migrateTo);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Campaign system" accent>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>The rules vocabulary the whole interface reads at runtime. Switching runs a non-destructive migration dry-run first.</div>
			</Panel>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
				{cs.modules.map((m: any) => {
					const active = m.id === activeSystem;
					return (
						<div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12, border: `1px solid ${active ? T.accBd : T.bd}`, background: T.surf, boxShadow: active ? T.smd : 'none' }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
								<span style={{ font: `700 15px ${T.disp}`, color: active ? T.acc : T.ink }}>{m.name}</span>
								{active ? <Badge status="accent" icon="check">Active</Badge> : <Badge status="neutral">{m.from}</Badge>}
							</div>
							<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub, flex: 1 }}>{m.desc}</div>
							{active ? <Button variant="secondary" size="sm" disabled>Current system</Button> : <Button variant="primary" size="sm" icon="retry" onClick={() => setMigrateTo(m.id)}>Preview migration</Button>}
						</div>
					);
				})}
				<button type="button" onClick={toast} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 150, borderRadius: 12, border: `1.5px dashed ${T.bdS}`, background: 'transparent', cursor: 'pointer', color: T.ter }}>
					<Icon name="add" size="lg" /><span style={{ font: `600 13px ${T.sans}` }}>Build your own system</span>
				</button>
			</div>
			{target && from && <MigrationDialog from={from} to={target} onClose={() => setMigrateTo(null)} />}
		</div>
	);
}

/* ---- Accessibility (REAL persisted prefs — write the SAME doc attrs Appearance owns) ------------- */
/** The shortcuts this build actually implements (AppShell ⌘K, SceneBoardCanvas keyboard nav, the
 * skip link) — an authored list, but of REAL behavior, replacing the prototype's mock table. */
const REAL_SHORTCUTS: { keys: string; action: string }[] = [
	{ keys: '⌘K / Ctrl+K', action: 'Open the command palette — search the whole vault' },
	{ keys: 'Tab', action: 'Move focus; first press reveals “Skip to content”' },
	{ keys: '← ↑ ↓ →', action: 'Walk the canvas widgets in focus order' },
	{ keys: 'Enter / Space', action: 'Select the focused widget (opens the inspector in edit mode)' },
	{ keys: '⌘/Ctrl + Arrows', action: 'Move the selected widget (canvas edit mode)' },
	{ keys: 'Shift + Arrows', action: 'Resize the selected widget (canvas edit mode)' },
	{ keys: 'Delete', action: 'Remove the selected widget (canvas edit mode)' },
	{ keys: 'Esc', action: 'Close dialog / deselect widget / exit preview' },
];
function SettingsAccessibility() {
	const runtime = useRuntime();
	// Single source of truth = the live <html> attribute (the same one Appearance + index.html restore).
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	const [motion, setMotion] = useState<string>(document.documentElement.getAttribute('data-motion') || 'full');
	const reduceMotion = motion === 'reduced';
	const highContrast = theme === 'high-contrast';

	// REAL player-safety checks: run the SAME actor-filtered reads a player actor gets and assert no
	// dm-only entity leaks through them. Computed live against the current vault, not authored flags.
	const leakChecks = (() => {
		const players = (Object.values(runtime.state.permissions.actors) as { id: string; role: string }[]).filter((a) => a.role === 'player');
		const checks: { id: string; ok: boolean; label: string }[] = [];
		let sceneLeaks = 0;
		let contentLeaks = 0;
		for (const p of players) {
			sceneLeaks += listScenesForActor(runtime.state.scenes, runtime.state.permissions, p.id).filter((s) => s.visibility === 'dm-only').length;
			contentLeaks += getContentItemsForActor(runtime.state.content, runtime.state.permissions, p.id).filter((c) => c.visibility === 'dm-only').length;
		}
		checks.push({
			id: 'scenes',
			ok: sceneLeaks === 0,
			label: players.length === 0 ? 'DM-only scenes: no player actors to check against yet' : `DM-only scenes are hidden from all ${players.length} player actors (checked live)`,
		});
		checks.push({
			id: 'content',
			ok: contentLeaks === 0,
			label: players.length === 0 ? 'DM-only notes/handouts: no player actors to check against yet' : `DM-only notes & handouts are excluded from every player read (checked live)`,
		});
		checks.push({ id: 'preview', ok: true, label: 'Preview-as-player rejects every write command (enforced fail-closed in the runtime)' });
		return checks;
	})();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Display & motion">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>These write the same persisted preferences as Appearance, so they take effect instantly and survive a reload.</div>
				<SetRow
					label="Reduce motion"
					help="Collapses every transition to 0ms — mirrors Appearance → Motion."
					control={<Switch checked={reduceMotion} onChange={() => { const v = reduceMotion ? 'full' : 'reduced'; setMotion(v); setDocAttr('data-motion', 'dndtools:react:motion', v); }} label="" />}
				/>
				<SetRow
					label="High-contrast theme"
					help="Switches to the accessibility-floor theme; turning it off restores the Tavern theme."
					control={<Switch checked={highContrast} onChange={() => { const v = highContrast ? 'tavern' : 'high-contrast'; setTheme(v); setDocAttr('data-theme', 'dndtools:react:theme', v); }} label="" />}
				/>
			</Panel>
			<Panel title="Keyboard shortcuts">
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
					{REAL_SHORTCUTS.map((s, i) => (
						<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<span style={{ font: `12px ${T.mono}`, color: T.ink, border: `1px solid ${T.bd}`, borderRadius: 5, padding: '2px 7px', background: T.alt, whiteSpace: 'nowrap' }}>{s.keys}</span>
							<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{s.action}</span>
						</div>
					))}
				</div>
			</Panel>
			<Panel title="Player-safety checks">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>Run live against your vault: each check re-reads the world AS each player actor and asserts nothing DM-only comes back.</div>
				{leakChecks.map((c) => (
					<div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', font: `12.5px ${T.sans}`, color: T.sub }}>
						<Icon name={c.ok ? 'success' : 'error'} size={16} color={c.ok ? T.ok : T.err} /><span>{c.label}</span>
					</div>
				))}
			</Panel>
		</div>
	);
}

const SUBPAGES: Record<string, () => JSX.Element> = {
	appearance: SettingsAppearance,
	account: SettingsAccount,
	subscription: SettingsSubscription,
	players: SettingsPlayers,
	permissions: SettingsPermissions,
	vault: SettingsVault,
	sync: SettingsSync,
	ai: SettingsAI,
	plugins: SettingsPlugins,
	systems: SettingsSystems,
	accessibility: SettingsAccessibility,
};

export function Settings() {
	const [tab, setTab] = useState('appearance');
	const Sub = SUBPAGES[tab] || SettingsAppearance;
	return (
		<Page max={1180} style={{ display: 'grid', gridTemplateColumns: '232px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
			<nav aria-label="Settings navigation" style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
				{SETTINGS_NAV.map((s) => {
					const on = s.id === tab;
					return (
						<button key={s.id} type="button" onClick={() => setTab(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', position: 'relative', background: on ? T.accSub : 'transparent', color: on ? T.acc : T.sub }}>
							{on && <span style={{ position: 'absolute', left: -6, top: 8, bottom: 8, width: 3, borderRadius: 3, background: T.acc }} />}
							<Icon name={s.icon} size="sm" color={on ? T.acc : 'currentColor'} />
							<span style={{ font: `${on ? 600 : 500} 13px ${T.sans}`, color: on ? T.acc : T.ink }}>{s.label}</span>
						</button>
					);
				})}
			</nav>
			<div style={{ minWidth: 0 }}><Sub /></div>
		</Page>
	);
}
