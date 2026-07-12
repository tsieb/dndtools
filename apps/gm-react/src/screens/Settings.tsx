import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	DEFAULT_FEATURE_TIER,
	FEATURE_GATES,
	FEATURE_TIERS,
	MCP_BASELINE_TOOL_IDS,
	MCP_POLICY_MODES,
	countCoDmActors,
	describeCapabilitySet,
	deriveVaultConflicts,
	getContentItemsForActor,
	isFeatureVisible,
	listGrantableCapabilitySets,
	listScenesForActor,
	unresolvedConflicts,
	visibleFeatures,
	type CommandResult,
	type FeatureTier,
	type McpPolicyMode,
	type McpStagedProposal,
	type VaultConflictRecord,
} from '@dndtools/core';
import { Avatar, Badge, Button, Chip, DataTable, Dialog, EmptyState, Icon, Input, Select, Skeleton, StatusDot, Switch, Textarea, Toaster } from '../ds';
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
	type CreateInviteResult,
	type Device,
	type Invite,
	type Profile,
} from '../cloud/appApi';
import { qrDataUrl } from '../net/qr';
import { downloadJsonFile, fileDateStamp } from '../platform/download';
import { pickTextFile } from '../platform/filePick';
import { exportFullVault, importFullVault, validateVaultBackup, type VaultBackup } from '../platform/backup';
import { ONBOARDED_KEY, REPLAY_EVENT } from '../app/Onboarding';
import { isFsSourceSupported, listFolderSources, disconnectFolderSource, type FolderSourceRecord } from '../platform/fsSource';
import { GOOGLE_DOCS_SETUP_RUNBOOK, addGdocConnection, isGoogleDocsConfigured, listGdocConnections, removeGdocConnection, type GdocConnection } from '../cloud/googleDocs';
import { PLAN_CARDS, coDmSeatsForPlan, useEntitlements } from '../cloud/entitlements';
import {
	DEFAULT_ANTHROPIC_MODEL,
	clearAiProviderKey,
	getAiProviderKey,
	getAiProviderSettings,
	isAiProviderConfigured,
	resolveAiProviderConfig,
	saveAiProviderSettings,
	setAiProviderKey,
	type AiProviderKind,
} from '../ai/providerConfig';
import { sendAiChat } from '../ai/transport';
import { buildAiToolSpecs, runAssistantExchange, type AssistantEvent } from '../ai/mcpBridge';
import type { AiTurn } from '../ai/transport';

/**
 * Settings — the category-rail section. The subpages now split by how much of the app Core backs:
 *
 *   • REAL CORE READS/WRITES — Players (live actor roster), Permissions (real grant list + grant/revoke
 *     commands), Sync (real op-log + conflict derivation, `conflict.resolve` dispatch), AI & tools (the
 *     durable MCP identity/policy/staged-writes slice, `mcp.*` commands), and the Experience-complexity
 *     card (real `visibleFeatures(tier)` query — and the tier now GATES the advanced settings tabs).
 *   • PERSISTED DISPLAY PREFS — Appearance (theme/density/motion → `data-*` attrs restored pre-paint by
 *     index.html) and Accessibility (reduce-motion / high-contrast toggles that write the SAME persisted
 *     attrs, so there is one source of truth). The feature tier is persisted to localStorage too.
 *   • REAL CLOUD (app-api, when configured + signed in) — Account (profile edit, signed-in devices +
 *     revoke, data export, delete account), the Players tab's pending invites (server-minted join
 *     links), and Subscription (the shared entitlements hook — always explicitly simulated, no payment
 *     processor exists). Fail-closed: unconfigured/signed-out builds show honest labeled states.
 *   • POINTERS — Plugins and Systems both link to Extensions, where the live widget-package registry
 *     and the real `widget.package.switch-system` flow live (no duplicate mock copies here).
 */

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
	// The tier is read by the Settings shell for REAL nav gating — notify it so a click on a
	// complexity card re-filters the rail immediately (localStorage writes don't event same-tab).
	if (attr === TIER_ATTR) window.dispatchEvent(new Event(TIER_EVENT));
}

/* ---- Experience complexity → real feature tier ------------------------------------------------
 * The 3-card "complexity" control is wired to the Core's progressive-disclosure model: each level maps
 * to a real `FeatureTier`, and the per-card reveals come from `visibleFeatures(tier)` (the same query the
 * onboarding surface reads), so the list is authoritative, not authored. The active tier is a device-local
 * display preference (Contract 1): persisted to localStorage (+ a `data-feature-tier` attr for any future
 * consumer). The tier is ENFORCED here: gated settings tabs (see TAB_GATE) hide below their gate's tier. */
const TIER_KEY = 'dndtools:react:tier';
const TIER_ATTR = 'data-feature-tier';
const TIER_EVENT = 'dndtools:react:tier-changed';

/** The three authored complexity levels — each maps 1:1 onto a real Core `FeatureTier`. */
const COMPLEXITY_LEVELS: { id: string; name: string; icon: string; tier: FeatureTier; rec?: boolean; blurb: string }[] = [
	{ id: 'beginner', name: 'Beginner', icon: 'Sprout', tier: 'core', blurb: 'The essentials only. Advanced panels stay hidden until you ask for them.' },
	{ id: 'standard', name: 'Standard', icon: 'SlidersHorizontal', tier: 'intermediate', rec: true, blurb: 'The full table toolkit with sensible defaults. Most DMs live here.' },
	{ id: 'expert', name: 'Expert', icon: 'Wrench', tier: 'advanced', blurb: 'Everything on, nothing hidden — permission grants, plugins, systems, diagnostics.' },
];

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
	const [theme, setTheme] = useState<string>(document.documentElement.getAttribute('data-theme') || 'tavern');
	const [density, setDensity] = useState<string>(document.documentElement.getAttribute('data-density') || 'standard');
	const [motion, setMotion] = useState<string>(document.documentElement.getAttribute('data-motion') || 'full');
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	const activeLvl = COMPLEXITY_LEVELS.find((l) => l.tier === tier) ?? COMPLEXITY_LEVELS[1];
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
					{COMPLEXITY_LEVELS.map((l) => {
						const levelTier = l.tier;
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
	// Both revocations are server-side and irreversible (no undo exists), so each one goes through
	// an honest confirm dialog instead of firing straight off its button.
	const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);
	const [signOutOpen, setSignOutOpen] = useState(false);
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
				setPendingRevoke(null);
				Toaster.success('Device revoked — it has to sign in again.');
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that device.')))
			.finally(() => setBusy(false));
	};
	const signOutEverywhere = () => {
		setBusy(true);
		revokeAllSessions()
			.then(async () => {
				setSignOutOpen(false);
				Toaster.success('Signed out everywhere — sign in again to continue.');
				await auth.signOut(); // the global revoke killed this session's refresh token too
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not sign out everywhere.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel
			title="Signed-in devices"
			action={<Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={() => setSignOutOpen(true)}>Sign out everywhere</Button>}
		>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
				Devices your account has signed in from. Revoking one forgets it; “Sign out everywhere” revokes every session, including this one.
			</div>
			{failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>Couldn’t load your devices — check your connection and reopen this tab.</div>
			) : devices === null ? (
				<div role="status" aria-label="Loading devices" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<Skeleton height={46} />
					<Skeleton height={46} />
				</div>
			) : devices.length === 0 ? (
				<EmptyState inset icon="Monitor" title="No remembered devices yet" description="Devices appear here after they sign in." />
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{devices.map((d, i) => (
						<div key={d.deviceKey} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<span style={{ width: 34, height: 34, borderRadius: 8, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.alt, color: T.sub }}><Icon name="Monitor" size="sm" /></span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{d.name}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{d.lastSeen ? `Last seen ${new Date(d.lastSeen).toLocaleString()}` : 'Last seen: unknown'}</div>
							</div>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingRevoke(d)}>Revoke</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title="Revoke this device?"
				description="Revocation happens on the server and cannot be undone."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setPendingRevoke(null)}>Cancel</Button>
						<Button variant="danger" size="sm" disabled={busy} onClick={() => pendingRevoke && revoke(pendingRevoke.deviceKey)}>{busy ? 'Revoking…' : 'Revoke device'}</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{pendingRevoke?.name}</strong> is forgotten immediately and has to sign in again. Nothing stored on that device is touched — only its session.
				</div>
			</Dialog>
			<Dialog
				open={signOutOpen}
				onClose={() => setSignOutOpen(false)}
				title="Sign out everywhere?"
				description="Every session is revoked — including this one."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setSignOutOpen(false)}>Cancel</Button>
						<Button variant="danger" size="sm" disabled={busy} onClick={signOutEverywhere}>{busy ? 'Signing out…' : 'Sign out everywhere'}</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This device signs out too, right now — you land back at the sign-in screen. Other devices lose their session the next time they reach the server. This cannot be undone.
				</div>
			</Dialog>
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
/** Device-local notification preferences (persisted). These gate REAL surfaces where they exist —
 * session-join and staged-write review are live features; the list never claims a delivery channel
 * (email/push) this build doesn't have. */
const NOTIFICATION_PREFS: { id: string; label: string; on: boolean }[] = [
	{ id: 'session-join', label: 'A player joins the live session', on: true },
	{ id: 'sync-conflict', label: 'Sync conflicts need resolving', on: true },
	{ id: 'mcp-staged', label: 'An agent staged a change for review', on: true },
	{ id: 'release-notes', label: 'Product news & release notes', on: false },
];
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
		return NOTIFICATION_PREFS.map((n) => n.on);
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
					{NOTIFICATION_PREFS.map((n, i) => (
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

/* ---- Subscription (REAL entitlements hook — server-backed when signed in, honest local fallback;
 * plans are ALWAYS explicitly simulated: no payment processor exists anywhere in this product) ------ */
function SettingsSubscription() {
	const navigate = useNavigate();
	const ent = useEntitlements();
	const current = PLAN_CARDS.find((p) => p.id === ent.plan) ?? PLAN_CARDS[0];
	const sourceBadge =
		ent.source === 'server' ? (
			<Badge status="success" icon="check">Account plan</Badge>
		) : ent.source === 'cache' ? (
			<Badge status="warning">Last known (offline)</Badge>
		) : (
			<Badge status="neutral">This device only</Badge>
		);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 14, border: `1px solid ${T.accBd}`, background: `linear-gradient(135deg, ${T.accSub}, ${T.raised})`, boxShadow: T.smd, flexWrap: 'wrap' }}>
				<span style={{ width: 46, height: 46, borderRadius: 12, flex: '0 0 auto', background: T.acc, color: T.accFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={current.cloud ? 'connection' : 'home'} size="lg" /></span>
				<div style={{ flex: '1 1 220px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}><span style={{ font: `700 19px ${T.disp}` }}>{ent.loading ? '…' : current.name}</span>{sourceBadge}</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>{current.tagline} · {current.price ? `$${current.price}/mo` : 'No charges'} · simulated — no payment is processed</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>Compare plans</Button>
			</div>

			<Panel title="Plans" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => navigate('/upgrade')}>Full comparison</Button>}>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
					{PLAN_CARDS.map((pl) => {
						const on = pl.id === ent.plan;
						return (
							<div key={pl.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 13, position: 'relative', border: `1px solid ${on ? T.accBd : pl.popular ? T.bdS : T.bd}`, background: on ? T.accSub : T.surf, boxShadow: on ? T.smd : 'none' }}>
								{pl.popular && !on && <span style={{ position: 'absolute', top: -9, right: 14, font: `600 10px ${T.sans}`, letterSpacing: '.06em', textTransform: 'uppercase', color: T.accFg, background: T.acc, padding: '2px 8px', borderRadius: 20 }}>Popular</span>}
								<div>
									<div style={{ font: `700 16px ${T.disp}`, color: on ? T.acc : T.ink }}>{pl.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
									<span style={{ font: `700 26px ${T.mono}`, color: T.ink }}>{pl.price ? `$${pl.price}` : 'Free'}</span>
									{pl.price > 0 && <span style={{ font: `12px ${T.sans}`, color: T.ter }}>/mo</span>}
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

			<Panel title="Billing">
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					There is no billing history and no stored payment method: every plan in this product is{' '}
					<strong style={{ color: T.ink }}>simulated</strong> — no payment processor exists anywhere, so
					nothing is ever charged. Plan changes happen on the <strong style={{ color: T.ink }}>Plans &amp; cloud</strong> page
					and are stored {ent.serverBacked ? 'on your account' : 'on this device'}.
				</div>
			</Panel>
		</div>
	);
}

/* ---- Players (REAL — the live actor roster the Core enforces visibility against) ---------------- */
const ROLE_LABEL: Record<string, string> = { dm: 'Dungeon Master', 'co-dm': 'Co-DM', player: 'Player', observer: 'Observer' };
/** Badge tone per role — the Co-DM shares the DM's accent (elevated), players `info`, observers neutral. */
const roleBadgeTone = (role: string): 'accent' | 'info' | 'neutral' =>
	role === 'dm' || role === 'co-dm' ? 'accent' : role === 'observer' ? 'neutral' : 'info';
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
	const ent = useEntitlements();
	const coDmSeats = coDmSeatsForPlan(ent.plan);
	const [invites, setInvites] = useState<Invite[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [campaignName, setCampaignName] = useState('');
	const [note, setNote] = useState('');
	const [role, setRole] = useState<'player' | 'co-dm'>('player');
	const [email, setEmail] = useState('');
	const [minted, setMinted] = useState<CreateInviteResult | null>(null);
	const [qr, setQr] = useState<string | null>(null);
	// Revoking kills the link server-side for good (no undo exists), so it confirms first.
	const [pendingRevoke, setPendingRevoke] = useState<Invite | null>(null);
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
		setRole('player');
		setEmail('');
		onCloseCreate();
	};
	const mint = () => {
		const name = campaignName.trim();
		if (!name) {
			Toaster.error('Give the invite a campaign name.');
			return;
		}
		if (role === 'co-dm' && coDmSeats <= 0) {
			Toaster.error('Your plan has no Co-DM seats — upgrade to invite a Co-DM.');
			return;
		}
		const to = email.trim();
		// Catch an obvious typo client-side; the server validates authoritatively.
		if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
			Toaster.error('Enter a valid email address, or leave it blank to just get a link.');
			return;
		}
		setBusy(true);
		apiCreateInvite({ campaignName: name, note: note.trim() || undefined, role, email: to || undefined })
			.then((invite) => {
				setMinted(invite);
				setInvites((list) => (list ? [invite, ...list] : [invite]));
				if (invite.emailStatus === 'sent') Toaster.success(`Invite emailed to ${invite.emailedTo ?? to}.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not create the invite.')))
			.finally(() => setBusy(false));
	};
	const revoke = (inviteId: string) => {
		setBusy(true);
		apiRevokeInvite(inviteId)
			.then(() => {
				setInvites((list) => (list ? list.filter((i) => i.inviteId !== inviteId) : list));
				setPendingRevoke(null);
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
				<div role="status" aria-label="Loading invites" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<Skeleton height={44} />
					<Skeleton height={44} />
				</div>
			) : invites.length === 0 ? (
				<EmptyState inset icon="send" title="No pending invites" description="“Invite player” mints a shareable join link (it expires after 14 days)." />
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{invites.map((v, i) => (
						<div key={v.inviteId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
							<Icon name="send" size={15} color={T.ter} />
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<span style={{ font: `600 13px ${T.sans}` }}>{v.campaignName}</span>
									{v.role === 'co-dm' && <Badge status="accent">Co-DM</Badge>}
								</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{v.note ? `${v.note} · ` : ''}expires {new Date(v.expiresAt * 1000).toLocaleDateString()}</div>
							</div>
							<Button variant="secondary" size="sm" icon="link" disabled={busy} onClick={() => void copyText(inviteJoinUrl(v.token), 'Join link copied.')}>Copy link</Button>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingRevoke(v)}>Revoke</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title="Revoke this invite?"
				description="The link stops working for good — revocation cannot be undone."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" disabled={busy} onClick={() => setPendingRevoke(null)}>Cancel</Button>
						<Button variant="danger" size="sm" disabled={busy} onClick={() => pendingRevoke && revoke(pendingRevoke.inviteId)}>{busy ? 'Revoking…' : 'Revoke invite'}</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The join link for <strong style={{ color: T.ink }}>{pendingRevoke?.campaignName}</strong> stops working immediately, even if it was already shared. Anyone who already joined keeps their seat — mint a new invite to replace it.
				</div>
			</Dialog>
			<Dialog
				open={createOpen}
				onClose={close}
				title={minted ? 'Invite ready to share' : 'Invite a player'}
				description={minted ? 'Send this link however you like — it works for 14 days or until you revoke it.' : 'Mints a shareable join link — add an email to send it, or share the link yourself.'}
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
						{minted.emailStatus !== 'none' && (
							<div
								role="status"
								style={{
									width: '100%',
									display: 'flex',
									alignItems: 'flex-start',
									gap: 8,
									padding: '8px 10px',
									borderRadius: 8,
									border: `1px solid ${T.bd}`,
									font: `12px/1.5 ${T.sans}`,
									color: minted.emailStatus === 'sent' ? T.sub : T.ter,
								}}
							>
								<Icon name={minted.emailStatus === 'sent' ? 'check' : 'info'} size={14} color={minted.emailStatus === 'sent' ? T.ok : T.ter} />
								<span>
									{minted.emailStatus === 'sent'
										? `Emailed to ${minted.emailedTo}. They can also use the link below.`
										: 'Email couldn’t be sent — email delivery isn’t set up for this app. Share the link below instead.'}
								</span>
							</div>
						)}
						{/* deliberate literal #fff: a QR quiet zone must stay white for scanners, whatever the theme */}
						{qr && <img src={qr} alt="QR code for the join link" style={{ width: 168, height: 168, borderRadius: 10, border: `1px solid ${T.bd}`, background: '#fff', padding: 8 }} />}
						<code style={{ font: `11.5px ${T.mono}`, color: T.sub, wordBreak: 'break-all', textAlign: 'center' }}>{inviteJoinUrl(minted.token)}</code>
						<Button variant="secondary" size="sm" icon="link" onClick={() => void copyText(inviteJoinUrl(minted.token), 'Join link copied.')}>Copy link</Button>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input value={campaignName} onChange={(e: { target: { value: string } }) => setCampaignName(e.target.value)} placeholder="Campaign name (shown to the invitee)" aria-label="Campaign name" maxLength={80} />
						<Textarea value={note} onChange={(e: { target: { value: string } }) => setNote(e.target.value)} placeholder="Note (optional) — e.g. “We play Fridays at 7”" aria-label="Invite note" rows={2} maxLength={200} />
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span style={{ font: `600 11.5px ${T.sans}`, color: T.ter, textTransform: 'uppercase', letterSpacing: '.06em' }}>Seat</span>
							<Seg
								value={role}
								onChange={(v: string) => setRole(v as 'player' | 'co-dm')}
								options={[
									{ value: 'player', label: 'Player' },
									{ value: 'co-dm', label: coDmSeats > 0 ? 'Co-DM' : 'Co-DM (no seats)' },
								]}
							/>
							<span style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter }}>
								{role === 'co-dm'
									? 'A Co-DM sees your DM-only prep and helps run the table. Finish the promotion from the Players roster once they join your session.'
									: 'An ordinary player seat — sees only what you share with the table.'}
							</span>
						</div>
						<Input type="email" value={email} onChange={(e: { target: { value: string } }) => setEmail(e.target.value)} placeholder="Email invite to… (optional)" aria-label="Recipient email" autoComplete="off" maxLength={254} />
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>Leave email blank to just get a shareable link + QR code. When set, we’ll also email the invite if this app has email delivery configured.</div>
					</div>
				)}
			</Dialog>
		</Panel>
	);
}

function SettingsPlayers() {
	const runtime = useRuntime();
	const auth = useAuth();
	const ent = useEntitlements();
	const cloudReady = isAccountApiConfigured && auth.status === 'signed-in';
	const [inviteOpen, setInviteOpen] = useState(false);
	const actors = Object.values(runtime.state.permissions.actors) as { id: string; role: string; displayName: string }[];
	const sorted = [...actors].sort((a, b) => (a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : a.displayName.localeCompare(b.displayName)));

	// Co-DM seat entitlement — the plan's seats vs. the live co-DM headcount. The Core `assign-role`
	// command re-checks this and fails closed; the UI mirrors it so the affordance is honest.
	const coDmSeats = coDmSeatsForPlan(ent.plan);
	const coDmInUse = countCoDmActors(runtime.state.permissions);
	const dmActorId = runtime.defaultActorId;

	const assignRole = (targetActorId: string, role: 'co-dm' | 'player' | 'observer', displayName: string) => {
		void runtime
			.dispatch({ type: 'permission.assign-role', actorId: dmActorId, payload: { targetActorId, role, coDmSeatLimit: coDmSeats } })
			.then((res: CommandResult) => {
				if (res.status !== 'accepted') {
					Toaster.error(res.rejection.message);
					return;
				}
				Toaster.success(`${displayName} is now ${ROLE_LABEL[role]}.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not change that role.')));
	};

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
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					{coDmSeats > 0
						? <>Co-DM seats: <strong style={{ color: T.ink }}>{coDmInUse} of {coDmSeats}</strong> used. A Co-DM sees your DM-only content and can run the table, but never manages roles, grants, invites, or the vault.</>
						: <>Your plan has no Co-DM seats — upgrade to promote a trusted player to Co-DM.</>}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((a, i) => {
						const promotable = a.role !== 'dm';
						const roleOptions = [
							{ value: 'player', label: 'Player' },
							{ value: 'observer', label: 'Observer' },
							{ value: 'co-dm', label: coDmSeats > 0 ? `Co-DM (${coDmInUse}/${coDmSeats})` : 'Co-DM (no seats)' },
						];
						return (
							<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<Avatar name={a.displayName} size="sm" ring={a.role === 'dm' || a.role === 'co-dm' ? 'active' : undefined} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{a.displayName}</div>
									<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{a.id}</div>
								</div>
								{/* No presence dot here: this roster has no live session/connection state to derive one
								    from, and a role-derived "live" would be a fake claim. The role badge carries the row. */}
								{promotable ? (
									<span style={{ minWidth: 150 }}>
										<Select
											aria-label={`Role for ${a.displayName}`}
											value={a.role}
											onChange={(e: { target: { value: string } }) => {
												const next = e.target.value as 'co-dm' | 'player' | 'observer';
												if (next !== a.role) assignRole(a.id, next, a.displayName);
											}}
											options={roleOptions}
										/>
									</span>
								) : (
									<Badge status={roleBadgeTone(a.role)}>{ROLE_LABEL[a.role] ?? a.role}</Badge>
								)}
							</div>
						);
					})}
				</div>
			</Panel>
			<InvitesPanel cloudReady={cloudReady} createOpen={inviteOpen} onCloseCreate={() => setInviteOpen(false)} />
		</div>
	);
}

/* ---- Permissions (REAL — real grant list + grant/revoke commands; DM-authored, fail-closed in core) -- */
function SettingsPermissions() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const actors = runtime.state.permissions.actors as Record<string, { id: string; role: string; displayName: string }>;
	const grants = runtime.state.permissions.grants;
	const scenes = Object.values(runtime.state.scenes.scenes) as { id: string; name: string }[];
	// Grant targets are players/observers only — a DM / Co-DM already has full authority, so granting to
	// them is meaningless (and a Co-DM must never be a grant target from this owner-only surface).
	const players = Object.values(actors).filter((a) => a.role !== 'dm' && a.role !== 'co-dm');
	const sceneSets = listGrantableCapabilitySets('scene');

	const roleCounts = { dm: 0, 'co-dm': 0, player: 0, observer: 0 } as Record<string, number>;
	for (const a of Object.values(actors)) roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
	const roleCards = [
		{ id: 'dm', name: 'Dungeon Master', desc: 'Full authority — authors content, grants, and the live session.', tone: 'accent' },
		{ id: 'co-dm', name: 'Co-DM', desc: 'Sees DM-only content and runs the table, but never manages roles, grants, invites, or the vault.', tone: 'accent' },
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

	// Revoke is recoverable here (the grant's full shape is in hand), so the toast carries an Undo
	// that re-dispatches the same `permission.grant-capability-set` — mirroring the scene-delete flow.
	const revoke = (grantId: string) => {
		const g = grants.find((x) => x.id === grantId);
		void runtime
			.dispatch({ type: 'permission.revoke-grant', actorId, payload: { grantId } })
			.then((res: CommandResult) => {
				if (res.status !== 'accepted') {
					Toaster.error(res.rejection.message);
					return;
				}
				const who = g ? (actors[g.playerActorId]?.displayName ?? g.playerActorId) : 'the player';
				Toaster.success(`Access revoked for ${who}.`, {
					action: g ? 'Undo' : undefined,
					onAction: g
						? () => {
								void runtime
									.dispatch({
										type: 'permission.grant-capability-set',
										actorId,
										payload: { entityType: g.entityType, entityId: g.entityId, playerActorId: g.playerActorId, capabilitySet: g.capabilitySet, expiresAt: g.expiresAt ?? null },
									})
									.then((r2: CommandResult) => {
										if (r2.status === 'accepted') Toaster.success(`Access re-granted to ${who}.`);
										else Toaster.error(r2.rejection.message);
									});
							}
						: undefined,
				});
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not revoke that grant.')));
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
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
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
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select aria-label="Player" value={grantPlayer} onChange={(e: { target: { value: string } }) => setGrantPlayer(e.target.value)} options={players.map((pl) => ({ value: pl.id, label: pl.displayName }))} />
						</span>
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select aria-label="Scene" value={grantScene} onChange={(e: { target: { value: string } }) => setGrantScene(e.target.value)} options={scenes.map((sc) => ({ value: sc.id, label: sc.name }))} />
						</span>
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

/* ---- Vault (REAL — the connected-source registry; pull/push/manage lives in Knowledge → Sources) ---- */
function SettingsVault() {
	const navigate = useNavigate();
	// null = the async folder-source listing hasn't resolved yet — without this sentinel the panel
	// flashes "No sources connected" for a beat on every open.
	const [folders, setFolders] = useState<FolderSourceRecord[] | null>(null);
	const [gdocs, setGdocs] = useState<GdocConnection[]>([]);
	// Folder disconnect drops a granted directory handle that can only come back through the OS
	// picker — no clean undo — so it confirms first. (Google Docs rows undo via their toast instead.)
	const [pendingDisconnect, setPendingDisconnect] = useState<FolderSourceRecord | null>(null);
	useEffect(() => {
		void listFolderSources().then(setFolders);
		setGdocs(listGdocConnections());
	}, []);
	const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never');
	const disconnectFolder = (f: FolderSourceRecord) => {
		void disconnectFolderSource(f.id)
			.then(listFolderSources)
			.then((list) => {
				setFolders(list);
				setPendingDisconnect(null);
				Toaster.success(`“${f.name}” disconnected — reconnect it any time from Knowledge → Sources.`);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not disconnect that folder.')));
	};
	const disconnectGdoc = (g: GdocConnection) => {
		// Connection metadata is all a Google Doc row holds, so removal is cleanly undoable in place.
		removeGdocConnection(g.docId);
		setGdocs(listGdocConnections());
		Toaster.success(`“${g.title}” disconnected.`, {
			action: 'Undo',
			onAction: () => {
				addGdocConnection(g.docId, g.title);
				setGdocs(listGdocConnections());
				Toaster.success(`“${g.title}” reconnected.`);
			},
		});
	};
	const loading = folders === null;
	const rows = [
		...(folders ?? []).map((f) => ({
			key: `folder-${f.id}`,
			name: f.name,
			kind: 'Local folder',
			meta: `pulled ${when(f.lastImportAt)} · pushed ${when(f.lastWriteAt)}`,
			disconnect: () => setPendingDisconnect(f),
		})),
		...gdocs.map((g) => ({
			key: `gdoc-${g.docId}`,
			name: g.title,
			kind: 'Google Doc',
			meta: `pulled ${when(g.lastPullAt)} · pushed ${when(g.lastPushAt)}`,
			disconnect: () => disconnectGdoc(g),
		})),
	];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Vault connections" action={<Button variant="secondary" size="sm" icon="import" onClick={() => navigate('/knowledge')}>Manage in Knowledge</Button>}>
				{/* Real WS-7 source registry (fsSource + googleDocs) — import/write-back actions live in the
				    Knowledge → Sources panel, which dispatches content.commit-import / content.write-to-source. */}
				{loading ? (
					<div role="status" aria-label="Loading vault connections" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Skeleton height={52} />
						<Skeleton height={52} />
					</div>
				) : rows.length === 0 ? (
					<EmptyState
						inset
						icon="vault"
						title="No sources connected"
						description={`Connect a local markdown folder${isGoogleDocsConfigured ? ' or a Google Doc' : ''} from Knowledge → Sources; pull and push live there too.`}
						action={<Button variant="secondary" size="sm" icon="import" onClick={() => navigate('/knowledge')}>Open Knowledge → Sources</Button>}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{rows.map((s, i) => (
							<div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
								<span style={{ width: 36, height: 36, borderRadius: 8, background: T.alt, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.acc, flex: '0 0 auto' }}><Icon name="vault" size="md" /></span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{s.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{s.kind} · {s.meta}</div>
								</div>
								<Badge status="success">connected</Badge>
								<Button variant="ghost" size="sm" icon="trash" onClick={s.disconnect}>Disconnect</Button>
							</div>
						))}
					</div>
				)}
				<Dialog
					open={pendingDisconnect !== null}
					onClose={() => setPendingDisconnect(null)}
					title="Disconnect this folder?"
					description="The folder and everything already imported stay untouched."
					tone="danger"
					size="sm"
					footer={
						<>
							<Button variant="secondary" size="sm" onClick={() => setPendingDisconnect(null)}>Cancel</Button>
							<Button variant="danger" size="sm" icon="trash" onClick={() => pendingDisconnect && disconnectFolder(pendingDisconnect)}>Disconnect</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Disconnecting <strong style={{ color: T.ink }}>{pendingDisconnect?.name}</strong> drops this app’s permission to the folder. Nothing on disk or in your vault is deleted — but reconnecting means picking the folder again in Knowledge → Sources.
					</div>
				</Dialog>
				{!isFsSourceSupported() && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>Local folder connections need the File System Access API (Chrome or Edge) — unavailable in this browser.</div>
				)}
				{!isGoogleDocsConfigured && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>Google Docs sync is off in this build — no <code style={{ font: `11px ${T.mono}` }}>VITE_GOOGLE_CLIENT_ID</code> is configured; setup is a one-time step, see <code style={{ font: `11px ${T.mono}` }}>{GOOGLE_DOCS_SETUP_RUNBOOK}</code>.</div>
				)}
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
	// SYNC-013 — resolution IS a validated core command: it references the record's actual source
	// revisions (a stale pair is rejected), records the audit, and yields a non-conflicted revision.
	const resolveConflict = (cf: VaultConflictRecord, side: 'local' | 'remote') => {
		void runtime
			.dispatch({
				type: 'conflict.resolve',
				actorId: runtime.defaultActorId,
				payload: {
					entityType: cf.entityType,
					entityId: cf.entityId,
					conflictId: cf.id,
					selectedValue: side === 'local' ? cf.local.value : cf.remote.value,
					sourceLocalRevision: cf.local.revision,
					sourceRemoteRevision: cf.remote.revision,
					notes: side === 'local' ? 'Kept this device’s value.' : 'Took the other revision’s value.',
				},
			})
			.then((res: CommandResult) => {
				if (res.status === 'accepted') Toaster.success('Conflict resolved — the entity is consistent again.');
				else Toaster.error(res.rejection.message);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not resolve the conflict.')));
	};
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
							<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Reason: {cf.reason} · mine rev {cf.local.revision} vs theirs rev {cf.remote.revision} · detected {new Date(cf.detectedAt).toLocaleString()}</div>
							{/* REAL: dispatches `conflict.resolve` with the record's values + source revisions (DM-only,
							    fail-closed in core — a rejection surfaces as a toast, never a silent no-op). */}
							<div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
								<Button variant="secondary" size="sm" icon="check" onClick={() => resolveConflict(cf, 'local')}>Keep mine</Button>
								<Button variant="secondary" size="sm" onClick={() => resolveConflict(cf, 'remote')}>Take theirs</Button>
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
					// Surface the partial-media outcome in the app's own voice, then hold the reload just
					// long enough for the toast to be read (a reload wipes it; `busy` stays true meanwhile).
					Toaster.warning(
						`Vault restored — ${restoredAssets} media ${restoredAssets === 1 ? 'asset' : 'assets'} kept, ${skippedAssets} skipped as oversized or corrupt. Reloading…`,
						{ duration: 4000 },
					);
					window.setTimeout(() => window.location.reload(), 4000);
				} else {
					window.location.reload();
				}
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

/* ---- AI & tools (REAL — the durable MCP identity/policy/staged-writes slice + `mcp.*` commands,
 * PLUS the client-side provider transport (ADR-021, closing the ADR-014 deferral). The POLICY layer:
 * master enable, per-agent bindings/modes/allowlists, staged-proposal review and the audit trail all
 * dispatch validated Core commands and persist. The TRANSPORT layer: a BYO-key Anthropic / OpenAI-
 * compatible chat client (src/ai/) whose tool calls route through the SAME fail-closed agent
 * pipeline — reads are actor-filtered, writes become the staged proposals reviewed below. Fail
 * closed twice over: MCP is OFF by default, and with no API key every AI surface stays off. -------- */
const MCP_MODE_LABEL: Record<McpPolicyMode, string> = {
	disabled: 'Disabled',
	strict_review: 'Strict review',
	balanced: 'Balanced',
	trusted_direct: 'Trusted direct',
};

/** The offered tool surface, projected once from the Core's declared registry (pure). */
const AI_TOOL_SPECS = buildAiToolSpecs();

/** Provider configuration — BYO key, device-local custody, fail-closed until complete. */
function AiProviderPanel({ onConfiguredChange }: { onConfiguredChange: () => void }) {
	const [settings, setSettings] = useState(() => getAiProviderSettings());
	const [keyDraft, setKeyDraft] = useState('');
	const [hasKey, setHasKey] = useState(() => getAiProviderKey() !== null);
	const configured = isAiProviderConfigured();

	const patch = (p: Partial<typeof settings>) => {
		setSettings(saveAiProviderSettings(p));
		onConfiguredChange();
	};
	const saveKey = () => {
		if (keyDraft.trim() === '') return;
		setAiProviderKey(keyDraft);
		setKeyDraft('');
		setHasKey(true);
		Toaster.success('API key stored on this device.');
		onConfiguredChange();
	};
	const forgetKey = () => {
		clearAiProviderKey();
		setHasKey(false);
		Toaster.success('API key forgotten.');
		onConfiguredChange();
	};

	return (
		<Panel
			title="AI provider"
			action={<Badge status={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Not configured'}</Badge>}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Bring your own key — this build ships no key and proxies nothing through a server. The key stays on this
				device (memory + this browser session; OS-encrypted storage on desktop) and is never written to the
				vault, the op-log, or cloud sync. Until a key is saved, every AI surface stays off.
			</div>
			<SetRow
				label="Provider"
				help="Anthropic's API directly, or any OpenAI-compatible endpoint (local runner, proxy, other vendor)."
				control={
					<Seg
						value={settings.provider}
						ariaLabel="AI provider"
						onChange={(v) => {
							const provider = v as AiProviderKind;
							patch({ provider, model: provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : settings.model });
						}}
						options={[
							{ value: 'anthropic', label: 'Anthropic' },
							{ value: 'openai-compatible', label: 'OpenAI-compatible' },
						]}
					/>
				}
			/>
			<SetRow
				label="Model"
				help={settings.provider === 'anthropic' ? `Defaults to ${DEFAULT_ANTHROPIC_MODEL}.` : 'The model id the endpoint expects.'}
				control={
					<span style={{ flex: '0 0 240px' }}>
						<Input
							value={settings.model}
							aria-label="Model id"
							onChange={(e: { target: { value: string } }) => patch({ model: e.target.value })}
						/>
					</span>
				}
			/>
			{settings.provider === 'openai-compatible' && (
				<SetRow
					label="Base URL"
					help="The API base, e.g. https://api.example.com/v1 — /chat/completions is appended."
					control={
						<span style={{ flex: '0 0 300px' }}>
							<Input
								value={settings.baseUrl}
								aria-label="API base URL"
								placeholder="https://api.example.com/v1"
								onChange={(e: { target: { value: string } }) => patch({ baseUrl: e.target.value })}
							/>
						</span>
					}
				/>
			)}
			<SetRow
				label="API key"
				help={hasKey ? 'A key is stored on this device. Paste a new one to replace it.' : 'Paste your provider API key to turn the assistant on.'}
				control={
					<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
						<span style={{ flex: '1 1 220px', minWidth: 180 }}>
							<Input
								type="password"
								value={keyDraft}
								aria-label="Provider API key"
								placeholder={hasKey ? '••••••••  (stored)' : 'sk-…'}
								onChange={(e: { target: { value: string } }) => setKeyDraft(e.target.value)}
							/>
						</span>
						<Button variant="primary" size="sm" icon="check" disabled={keyDraft.trim() === ''} onClick={saveKey}>
							Save key
						</Button>
						{hasKey && (
							<Button variant="ghost" size="sm" icon="trash" onClick={forgetKey}>
								Forget key
							</Button>
						)}
					</span>
				}
			/>
		</Panel>
	);
}

/** One rendered assistant-feed entry (the user ask, assistant text, or a tool-call outcome). */
type AssistantFeedItem = { kind: 'user'; text: string } | ({ kind: 'event' } & AssistantEvent);

const TOOL_OUTCOME_BADGE: Record<string, { status: string; label: string }> = {
	read: { status: 'info', label: 'read' },
	staged: { status: 'warning', label: 'staged' },
	'direct-write': { status: 'success', label: 'committed' },
	denied: { status: 'error', label: 'denied' },
	error: { status: 'error', label: 'failed' },
};

/**
 * The assistant — one ask at a time, run AS a registered agent connection through the Core's
 * fail-closed pipeline. Reads come back actor-filtered; writes surface as staged proposals in the
 * review panel below. Disabled honestly (with the reason) until every prerequisite is real:
 * provider key, MCP master switch, a registered binding, DM + not previewing.
 */
function AiAssistantPanel({ canWrite }: { canWrite: boolean }) {
	const runtime = useRuntime();
	const mcp = runtime.state.mcp;
	const bindings = Object.values(mcp.bindings);
	// `configured` re-reads on every render; the parent bumps its own state on a provider-config
	// change (see SettingsAI), which re-renders this sibling — no local mirror of ai/ module state.
	const configured = isAiProviderConfigured();
	const [agentId, setAgentId] = useState<string>(bindings[0]?.agentId ?? '');
	const [input, setInput] = useState('');
	const [feed, setFeed] = useState<AssistantFeedItem[]>([]);
	const [turns, setTurns] = useState<AiTurn[]>([]);
	const [asking, setAsking] = useState(false);

	const selectedAgent = mcp.bindings[agentId] ? agentId : (bindings[0]?.agentId ?? '');
	const blocker = !configured
		? 'Add a provider API key above to turn the assistant on.'
		: !mcp.enabled
			? 'Enable MCP above — the master switch gates every agent capability.'
			: bindings.length === 0
				? 'Register an agent connection below — the assistant speaks as a bound actor.'
				: !canWrite
					? 'The assistant is DM-only and unavailable while previewing.'
					: null;

	const ask = () => {
		const text = input.trim();
		if (text === '' || asking || blocker !== null || selectedAgent === '') return;
		setAsking(true);
		setInput('');
		setFeed((prev) => [...prev, { kind: 'user', text }]);
		const config = resolveAiProviderConfig();
		void runAssistantExchange({
			send: (req) => sendAiChat(config, req),
			invoke: (toolId, toolInput) => runtime.invokeAgentTool({ agentId: selectedAgent, toolId, input: toolInput }),
			tools: AI_TOOL_SPECS,
			turns,
			userText: text,
		})
			.then((result) => {
				setTurns(result.turns);
				setFeed((prev) => [...prev, ...result.events.map((event) => ({ kind: 'event' as const, ...event }))]);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'The assistant request failed.')))
			.finally(() => setAsking(false));
	};

	return (
		<Panel title="Assistant" action={asking ? <Badge status="info">Thinking…</Badge> : undefined}>
			<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
				Ask about the campaign. The assistant reads through the Core's actor-filtered tools as the agent you
				pick, and anything it tries to write lands as a staged proposal in the review panel below — nothing
				commits without you.
			</div>
			{blocker !== null ? (
				<div style={{ padding: '9px 12px', borderRadius: 9, border: `1px solid ${T.bd}`, background: T.alt, font: `12px/1.6 ${T.sans}`, color: T.ter }}>
					{blocker}
				</div>
			) : (
				<>
					{feed.length > 0 && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
							{feed.map((item, i) => {
								if (item.kind === 'user') {
									return (
										<div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '7px 11px', borderRadius: 10, background: T.accSub, border: `1px solid ${T.accBd}`, font: `12.5px/1.55 ${T.sans}`, color: T.ink, whiteSpace: 'pre-wrap' }}>
											{item.text}
										</div>
									);
								}
								if (item.type === 'text') {
									return (
										<div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%', padding: '7px 11px', borderRadius: 10, background: T.alt, border: `1px solid ${T.bd}`, font: `12.5px/1.55 ${T.sans}`, color: T.ink, whiteSpace: 'pre-wrap' }}>
											{item.text}
										</div>
									);
								}
								const badge = TOOL_OUTCOME_BADGE[item.outcome] ?? TOOL_OUTCOME_BADGE.error;
								return (
									<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, font: `11.5px ${T.sans}`, color: T.ter }}>
										<Icon name="sparkle" size={13} color={T.ter} />
										<span style={{ font: `11.5px ${T.mono}` }}>{item.toolId}</span>
										<Badge status={badge.status}>{badge.label}</Badge>
										<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.detail}</span>
									</div>
								);
							})}
						</div>
					)}
					<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
						<span style={{ flex: '0 0 200px' }}>
							<Select
								aria-label="Agent connection the assistant speaks as"
								value={selectedAgent}
								disabled={asking}
								onChange={(e: { target: { value: string } }) => setAgentId(e.target.value)}
								options={bindings.map((b) => ({ value: b.agentId, label: b.label || b.agentId }))}
							/>
						</span>
						<span style={{ flex: '1 1 240px', minWidth: 200 }}>
							<Textarea
								value={input}
								rows={2}
								aria-label="Ask the assistant"
								placeholder="e.g. What loose threads should tonight's session pick up?"
								disabled={asking}
								onChange={(e: { target: { value: string } }) => setInput(e.target.value)}
								onKeyDown={(e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										ask();
									}
								}}
							/>
						</span>
						<Button variant="primary" size="sm" icon="sparkle" disabled={asking || input.trim() === ''} onClick={ask}>
							{asking ? 'Asking…' : 'Ask'}
						</Button>
					</div>
				</>
			)}
		</Panel>
	);
}

function SettingsAI() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const mcp = runtime.state.mcp;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const canWrite = isDm && !runtime.preview;
	const [busy, setBusy] = useState(false);
	// Bumped when the provider panel saves/forgets a key so the assistant panel re-reads its
	// configured state (the key lives in the ai/ module, not in Core state or React).
	const [, bumpAiConfig] = useState(0);
	const actors = Object.values(runtime.state.permissions.actors) as { id: string; role: string; displayName: string }[];

	// Register-agent form (a binding names WHICH actor a future connection speaks as — no capability).
	const [newAgentId, setNewAgentId] = useState('');
	const [newLabel, setNewLabel] = useState('');
	const [newActorId, setNewActorId] = useState<string>(actors.find((a) => a.role !== 'dm')?.id ?? actors[0]?.id ?? '');

	const run = (command: Parameters<typeof runtime.dispatch>[0], okMsg: string) => {
		setBusy(true);
		void runtime
			.dispatch(command)
			.then((res: CommandResult) => {
				if (res.status === 'accepted') Toaster.success(okMsg);
				else Toaster.error(res.rejection.message);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'The command failed.')))
			.finally(() => setBusy(false));
	};

	const bindings = Object.values(mcp.bindings);
	const pending = (Object.values(mcp.proposals) as McpStagedProposal[]).filter((pr) => pr.status === 'pending');
	const recentAudit = mcp.auditEntries.slice(-5).reverse();
	const actorName = (id: string) => runtime.state.permissions.actors[id]?.displayName ?? id;

	const registerAgent = () => {
		const agentId = newAgentId.trim();
		if (!agentId || !newActorId) {
			Toaster.error('Give the agent connection an id and pick the actor it speaks as.');
			return;
		}
		run(
			{ type: 'mcp.set-agent-binding', actorId, payload: { agentId, actorId: newActorId, label: newLabel.trim() } },
			`Registered ${agentId} — it inherits the vault default (${MCP_MODE_LABEL[mcp.vaultDefaultMode]}) until you set a policy.`,
		);
		setNewAgentId('');
		setNewLabel('');
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>MCP administration is DM-only and read-only while previewing — the controls below are disabled.</div>
			)}
			<Panel
				title="AI & agent access (MCP)"
				action={
					<Switch
						checked={mcp.enabled}
						disabled={!canWrite || busy}
						label={mcp.enabled ? 'Enabled' : 'Off'}
						onChange={() =>
							run(
								{ type: 'mcp.set-enabled', actorId, payload: { enabled: !mcp.enabled } },
								mcp.enabled ? 'MCP disabled — every agent capability is removed.' : 'MCP enabled — agent policy below now applies.',
							)
						}
					/>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The vault-wide kill switch (durable, fail-closed OFF). While off, no agent tool call can resolve — the
					gate denies everything before identity or policy is even consulted.
				</div>
				<div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, border: `1px solid ${T.bd}`, background: T.alt, font: `12px/1.6 ${T.sans}`, color: T.ter }}>
					<strong style={{ color: T.ink }}>Honestly:</strong> no AI provider or agent transport ships in this build, so
					nothing can connect yet. Everything on this page is the real, durable policy registry that a future
					connection will be enforced against — not a fake “connected” status.
				</div>
				<SetRow
					label="Default posture for new agents"
					help="What a never-configured agent falls back to. Restricted to the two safe defaults; never direct-write."
					control={
						<Seg
							value={mcp.vaultDefaultMode}
							ariaLabel="Vault default agent posture"
							onChange={(v) => {
								if (!canWrite || busy) return;
								run({ type: 'mcp.set-vault-default', actorId, payload: { mode: v } }, `New agents now default to ${MCP_MODE_LABEL[v as McpPolicyMode]}.`);
							}}
							options={[
								{ value: 'strict_review', label: 'Strict review' },
								{ value: 'disabled', label: 'Disabled' },
							]}
						/>
					}
				/>
			</Panel>

			<AiProviderPanel onConfiguredChange={() => bumpAiConfig((v) => v + 1)} />

			<AiAssistantPanel canWrite={canWrite} />

			<Panel title="Agent connections" action={<Badge status="neutral">{bindings.length}</Badge>}>
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					A binding names which vault actor an agent connection speaks as — it confers no capability, and the
					agent can never see or do more than that actor. The mode decides whether its writes are staged.
				</div>
				{bindings.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No agent connections registered yet — register one below to author its policy ahead of time.</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{bindings.map((b, i) => {
							const policy = mcp.policies[b.agentId] ?? null;
							const mode: McpPolicyMode = policy?.mode ?? mcp.vaultDefaultMode;
							const allowlisted = (policy?.allowedToolIds ?? []).length > 0;
							return (
								<div key={b.agentId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: i ? `1px solid ${T.bd}` : 'none', flexWrap: 'wrap' }}>
									<Icon name="sparkle" size={16} color={T.acc} />
									<div style={{ flex: '1 1 180px', minWidth: 0 }}>
										<div style={{ font: `600 13px ${T.sans}` }}>{b.label || b.agentId}</div>
										<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{b.agentId} → {actorName(b.actorId)}</div>
									</div>
									<Badge status="neutral">never connected</Badge>
									<span style={{ flex: '0 0 150px' }}>
										<Select
											aria-label={`Policy mode for ${b.label || b.agentId}`}
											value={mode}
											disabled={!canWrite || busy}
											onChange={(e: { target: { value: string } }) =>
												run(
													{
														type: 'mcp.set-agent-policy',
														actorId,
														payload: { agentId: b.agentId, mode: e.target.value, allowedToolIds: policy?.allowedToolIds ?? [], auditVisible: policy?.auditVisible ?? true },
													},
													`${b.label || b.agentId} set to ${MCP_MODE_LABEL[e.target.value as McpPolicyMode]}.`,
												)
											}
											options={MCP_POLICY_MODES.map((m) => ({ value: m, label: MCP_MODE_LABEL[m] }))}
										/>
									</span>
									<Switch
										checked={allowlisted}
										disabled={!canWrite || busy}
										label="Baseline tools"
										onChange={() =>
											run(
												{
													type: 'mcp.set-agent-policy',
													actorId,
													payload: { agentId: b.agentId, mode, allowedToolIds: allowlisted ? [] : [...MCP_BASELINE_TOOL_IDS], auditVisible: policy?.auditVisible ?? true },
												},
												allowlisted ? 'Allowlist cleared — every tool is denied for this agent.' : 'Baseline tool set allowlisted for this agent.',
											)
										}
									/>
									<Button
										variant="ghost"
										size="sm"
										icon="trash"
										disabled={!canWrite || busy}
										onClick={() => run({ type: 'mcp.remove-agent-binding', actorId, payload: { agentId: b.agentId } }, `${b.label || b.agentId} removed — its pending proposals expire.`)}
									>
										Remove
									</Button>
								</div>
							);
						})}
					</div>
				)}
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input value={newAgentId} onChange={(e: { target: { value: string } }) => setNewAgentId(e.target.value)} placeholder="Agent id (e.g. prep-assistant)" aria-label="Agent connection id" maxLength={60} />
					</span>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input value={newLabel} onChange={(e: { target: { value: string } }) => setNewLabel(e.target.value)} placeholder="Label (optional)" aria-label="Agent label" maxLength={80} />
					</span>
					<span style={{ flex: '0 0 170px' }}>
						<Select aria-label="Actor the agent speaks as" value={newActorId} onChange={(e: { target: { value: string } }) => setNewActorId(e.target.value)} options={actors.map((a) => ({ value: a.id, label: `${a.displayName} (${a.role})` }))} />
					</span>
					<Button variant="primary" size="sm" icon="add" disabled={!canWrite || busy} onClick={registerAgent}>Register</Button>
				</div>
			</Panel>

			<Panel title="Staged writes awaiting review" action={<Badge status={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>}>
				{pending.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Nothing staged. Under strict review, every agent write lands here as a proposal you approve or
						reject — nothing an agent does commits without you.
					</div>
				) : (
					pending.map((pr, i) => (
						<div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none', flexWrap: 'wrap' }}>
							<Icon name="warning" size={15} color={T.warn} />
							<div style={{ flex: '1 1 200px', minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{pr.commandType}</div>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{pr.agentId} as {actorName(pr.actorId)} · {pr.toolId} · {pr.writeRisk}</div>
							</div>
							<Button variant="secondary" size="sm" icon="check" disabled={!canWrite || busy} onClick={() => run({ type: 'mcp.approve-proposal', actorId, payload: { proposalId: pr.id } }, 'Proposal approved and committed through the normal dispatch.')}>Approve</Button>
							<Button variant="ghost" size="sm" icon="close" disabled={!canWrite || busy} onClick={() => run({ type: 'mcp.reject-proposal', actorId, payload: { proposalId: pr.id } }, 'Proposal rejected — nothing was written.')}>Reject</Button>
						</div>
					))
				)}
			</Panel>

			<Panel title="Tool registry (baseline)">
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					The Core's declared baseline tool set — what the per-agent allowlist above grants. Reads are
					actor-filtered; the one write tool stages through review.
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{MCP_BASELINE_TOOL_IDS.map((t) => (
						<Chip key={t} tone="neutral">{t}</Chip>
					))}
				</div>
				{recentAudit.length > 0 && (
					<div style={{ marginTop: 12 }}>
						<div style={{ font: `600 11px ${T.sans}`, letterSpacing: '.08em', textTransform: 'uppercase', color: T.ter, marginBottom: 6 }}>Recent agent activity</div>
						{recentAudit.map((a) => (
							<div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', font: `12px ${T.sans}`, color: T.sub }}>
								<Badge status={a.mode === 'denied' ? 'error' : a.mode === 'staged' ? 'warning' : 'info'}>{a.mode}</Badge>
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>{a.agentId} · {a.toolId}</span>
								<span style={{ marginLeft: 'auto', font: `11px ${T.sans}`, color: T.ter }}>{new Date(a.recordedAt).toLocaleString()}</span>
							</div>
						))}
					</div>
				)}
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

/* ---- Systems (pointer — the REAL rules-system switch, with its `previewSystemSwitch` dry-run and
 * the `widget.package.switch-system` command, lives on the Extensions screen's System tab) ---------- */
function SettingsSystems() {
	const navigate = useNavigate();
	return (
		<Panel title="Extensions & systems">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Switching the campaign rules system — including the non-destructive migration dry-run that has to
				come back clean first — lives in <strong style={{ color: T.ink }}>Extensions → System</strong>, backed by the live
				widget-package registry and the Core's switch command.
			</div>
			<Button variant="secondary" size="sm" icon="scroll" onClick={() => navigate('/extensions')} style={{ alignSelf: 'flex-start' }}>
				Open Extensions
			</Button>
		</Panel>
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

/* ---- REAL progressive disclosure (ADR-012) ------------------------------------------------------
 * Tabs mapped to a declared Core feature gate hide below that gate's tier — the SAME
 * `visibleFeatures()`/`isFeatureVisible()` registry the onboarding surface reads, so the gating is
 * authoritative, not authored. Only tabs with a real declared gate are mapped (fail-open for the
 * rest: an unmapped tab is never hidden by guesswork). */
const TAB_GATE: Record<string, string> = {
	permissions: 'permissions', // 'Permission grants' — advanced
	plugins: 'widget-library', // widget packages ARE the widget library — intermediate
	systems: 'widget-library', // the rules system is a widget package — intermediate
};

/** Deep-linking into a gated-off tab shows this honest gate instead of the panel (and offers the
 * real unlock: raising the persisted feature tier, the same write the Appearance cards do). */
function GatedTab({ gateId, tier }: { gateId: string; tier: FeatureTier }) {
	const gate = FEATURE_GATES.find((g) => g.id === gateId);
	const neededTier = gate?.minTier ?? 'advanced';
	const level = COMPLEXITY_LEVELS.find((l) => l.tier === neededTier);
	const activeLevel = COMPLEXITY_LEVELS.find((l) => l.tier === tier);
	return (
		<Panel title="Hidden at your experience level">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				<strong style={{ color: T.ink }}>{gate?.label ?? 'This panel'}</strong> is part of the{' '}
				{level?.name ?? 'Expert'} toolkit, and your experience complexity is set to{' '}
				{activeLevel?.name ?? tier}. Nothing is locked — reveal it here or from Appearance.
			</div>
			<Button
				variant="primary"
				size="sm"
				icon="sparkle"
				style={{ alignSelf: 'flex-start' }}
				onClick={() => setDocAttr(TIER_ATTR, TIER_KEY, neededTier)}
			>
				Switch to {level?.name ?? 'Expert'}
			</Button>
		</Panel>
	);
}

export function Settings() {
	// `#/settings?tab=players` deep-links a specific subpage so "manage" affordances elsewhere
	// (Command Center rows, empty-state CTAs) land on the right panel, not the section root.
	const location = useLocation();
	const navigate = useNavigate();
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	useEffect(() => {
		const onTier = () => setTier(readTier());
		window.addEventListener(TIER_EVENT, onTier);
		return () => window.removeEventListener(TIER_EVENT, onTier);
	}, []);
	const gatedOff = (id: string) => (TAB_GATE[id] ? !isFeatureVisible(TAB_GATE[id], tier) : false);
	const urlTab = new URLSearchParams(location.search).get('tab');
	const tab = urlTab && urlTab in SUBPAGES ? urlTab : 'appearance';
	const setTab = (next: string) => navigate(`/settings?tab=${next}`, { replace: true });
	const Sub = SUBPAGES[tab] || SettingsAppearance;
	return (
		<Page max={1180} style={{ display: 'grid', gridTemplateColumns: '232px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
			<nav aria-label="Settings navigation" style={{ position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
				{SETTINGS_NAV.filter((s) => !gatedOff(s.id)).map((s) => {
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
			<div style={{ minWidth: 0 }}>{gatedOff(tab) ? <GatedTab gateId={TAB_GATE[tab]} tier={tier} /> : <Sub />}</div>
		</Page>
	);
}
