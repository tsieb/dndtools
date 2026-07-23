import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	DEFAULT_FEATURE_TIER,
	FEATURE_GATES,
	FEATURE_TIERS,
	MCP_BASELINE_TOOL_IDS,
	MCP_POLICY_MODES,
	countCoDmActors,
	describeCapabilitySet,
	getContentItemsForActor,
	isFeatureVisible,
	listGrantableCapabilitySets,
	listScenesForActor,
	visibleFeatures,
	MIN_RECOVERY_PASSPHRASE_CHARS,
	type CommandResult,
	type FeatureTier,
	type McpPolicyMode,
	type McpStagedProposal,
	type VaultPrivacyMode,
} from '@dndtools/core';
import {
	Avatar,
	Badge,
	Button,
	Chip,
	DataTable,
	Dialog,
	EmptyState,
	Icon,
	Input,
	Select,
	Skeleton,
	StatusDot,
	Switch,
	Textarea,
	Toaster,
} from '../ds';
import { Page, Panel, Seg, SetRow, T } from '../app/screen-kit';
import { useRuntime } from '../runtime/RuntimeContext';
import { useCloudSync } from '../cloud/CloudSyncContext';
import { useAuth } from '../cloud/AuthContext';
import { forgetCloudSyncAccount } from '../cloud/cloudSync';
import { setVaultPrivacyMode, storedVaultPrivacyMode, vaultPrivacyMode } from '../cloud/vaultMode';
import { vaultKeyManager } from '../cloud/vaultKey';
import { CLOUD_VAULT_ID } from '../cloud/syncEngine';
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
import {
	platformNotifications,
	usePlatformCapabilities,
	type PlatformNotificationPermission,
} from '../platform/capabilities';
import { pickTextFile } from '../platform/filePick';
import { publicAppBaseUrl, publicAppHashUrl } from '../platform/publicAppUrl';
import {
	MAX_VAULT_BACKUP_FILE_BYTES,
	exportFullVault,
	importFullVault,
	validateVaultBackup,
	type VaultBackup,
} from '../platform/backup';
import { ONBOARDED_KEY, REPLAY_EVENT } from '../app/Onboarding';
import { useViewport } from '../app/useViewport';
import {
	isFsSourceSupported,
	listFolderSources,
	disconnectFolderSource,
	type FolderSourceRecord,
} from '../platform/fsSource';
import {
	addGdocConnection,
	isGoogleDocsConfigured,
	listGdocConnections,
	removeGdocConnection,
	type GdocConnection,
} from '../cloud/googleDocs';
import { PLAN_CARDS, coDmSeatsForPlan, useEntitlements } from '../cloud/entitlements';
import {
	DEFAULT_ANTHROPIC_MODEL,
	MAX_API_KEY_CHARS,
	MAX_BASE_URL_CHARS,
	MAX_MODEL_CHARS,
	clearAiProviderKey,
	clearLegacyAiProviderKey,
	getAiProviderKey,
	getAiProviderSettings,
	hasLegacyAiProviderKey,
	isAiProviderConfigured,
	resolveAiProviderConfig,
	resolveAiProviderDestination,
	saveAiProviderSettings,
	setAiProviderKey,
	type AiProviderKind,
	type AiProviderSettings,
} from '../ai/providerConfig';
import { sendAiChat } from '../ai/transport';
import { LOCAL_OLLAMA } from '../ai/localLlmGuidance';
import {
	baselineAllowlistMembership,
	buildAiToolSpecs,
	runAssistantExchange,
	toggleBaselineToolAllowlist,
	type AssistantEvent,
	type AssistantRunStatus,
} from '../ai/mcpBridge';
import type { AiTurn } from '../ai/transport';
import {
	AI_USAGE_PREFERENCE_EVENT,
	getAiUsagePreference,
	isAiAssistantEnabled,
	saveAiUsagePreference,
	type AiUsagePreference,
} from '../ai/usagePreference';
import { SUPPORTED_LOCALES, useI18n } from '../i18n';

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
	{ id: 'language', label: 'Language & region', icon: 'globe' },
	{ id: 'account', label: 'Account', icon: 'UserCircle' },
	{ id: 'subscription', label: 'Subscription', icon: 'CreditCard' },
	{ id: 'players', label: 'Players', icon: 'players' },
	{ id: 'permissions', label: 'Permissions', icon: 'permissions' },
	{ id: 'vault', label: 'Vault connections', icon: 'vault' },
	{ id: 'sync', label: 'Backup & history', icon: 'connection' },
	{ id: 'tools', label: 'Tool preferences', icon: 'sliders' },
	{ id: 'ai', label: 'AI & tools', icon: 'sparkle' },
	{ id: 'plugins', label: 'Plugins', icon: 'widget' },
	{ id: 'systems', label: 'Extensions & systems', icon: 'scroll' },
	{ id: 'accessibility', label: 'Accessibility', icon: 'accessibility' },
];

function SettingsLanguage() {
	const { locale, setLocale, t } = useI18n();
	return (
		<Panel title={t('Language & region')}>
			<div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
				<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
					{t('Choose the language used throughout DND Tools. Your choice is saved on this device.')}
				</div>
				<Select
					aria-label={t('Language')}
					value={locale}
					onChange={(event: { target: { value: string } }) =>
						setLocale(event.target.value as typeof locale)
					}
					options={SUPPORTED_LOCALES.map((option) => ({
						value: option.code,
						label: `${option.nativeLabel} (${option.label})`,
					}))}
				/>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter }}>
					{t(
						'Language changes apply immediately, including menus, dialogs, tooltips, and screen-reader labels.',
					)}
				</div>
			</div>
		</Panel>
	);
}

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
const COMPLEXITY_LEVELS: {
	id: string;
	name: string;
	icon: string;
	tier: FeatureTier;
	rec?: boolean;
	blurb: string;
}[] = [
	{
		id: 'beginner',
		name: 'Beginner',
		icon: 'Sprout',
		tier: 'core',
		blurb: 'The essentials only. Advanced panels stay hidden until you ask for them.',
	},
	{
		id: 'standard',
		name: 'Standard',
		icon: 'SlidersHorizontal',
		tier: 'intermediate',
		rec: true,
		blurb: 'The full table toolkit with sensible defaults. Most DMs live here.',
	},
	{
		id: 'expert',
		name: 'Expert',
		icon: 'Wrench',
		tier: 'advanced',
		blurb: 'Everything on, nothing hidden — permission grants, plugins, systems, diagnostics.',
	},
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
	return (FEATURE_TIERS as readonly string[]).includes(candidate ?? '')
		? (candidate as FeatureTier)
		: DEFAULT_FEATURE_TIER;
}

/* ---- Appearance ------------------------------------------------------------------------- */
function SettingsAppearance() {
	const [theme, setTheme] = useState<string>(
		document.documentElement.getAttribute('data-theme') || 'tavern',
	);
	const [density, setDensity] = useState<string>(
		document.documentElement.getAttribute('data-density') || 'standard',
	);
	const [motion, setMotion] = useState<string>(
		document.documentElement.getAttribute('data-motion') || 'full',
	);
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	const activeLvl = COMPLEXITY_LEVELS.find((l) => l.tier === tier) ?? COMPLEXITY_LEVELS[1];
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Appearance" style={{ gap: 0 }}>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					Changes apply immediately and stay with this device.
				</div>
				<SetRow
					label="Theme"
					help="Candle-lit dark, warm vellum, or the accessibility floor."
					control={
						<Seg
							value={theme}
							ariaLabel="Theme"
							onChange={(v) => {
								setTheme(v);
								setDocAttr('data-theme', 'dndtools:react:theme', v);
							}}
							options={[
								{ value: 'tavern', label: 'Tavern' },
								{ value: 'parchment', label: 'Parchment' },
								{ value: 'high-contrast', label: 'High contrast' },
							]}
						/>
					}
				/>
				<SetRow
					label="Density"
					help="Comfortable enlarges controls for play at the table; Compact tightens them."
					control={
						<Seg
							value={density}
							ariaLabel="Interface density"
							onChange={(v) => {
								setDensity(v);
								setDocAttr('data-density', 'dndtools:react:density', v);
							}}
							options={[
								{ value: 'standard', label: 'Standard' },
								{ value: 'comfortable', label: 'Comfortable' },
								{ value: 'compact', label: 'Compact' },
							]}
						/>
					}
				/>
				<SetRow
					label="Motion"
					help="Reduce collapses transitions and stops looping animations."
					control={
						<Seg
							value={motion}
							ariaLabel="Motion"
							onChange={(v) => {
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
							options={[
								{ value: 'full', label: 'Full' },
								{ value: 'reduced', label: 'Reduced' },
							]}
						/>
					}
				/>
			</Panel>

			<Panel
				title="Experience complexity"
				action={<Badge status="neutral">{activeLvl.name}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub, marginBottom: 4 }}>
					Choose how much of the toolkit you want to see. This is separate from interface density,
					and you can change it at any time.
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
						gap: 12,
					}}
				>
					{COMPLEXITY_LEVELS.map((l) => {
						const levelTier = l.tier;
						const on = levelTier === tier;
						const reveals = visibleFeatures(levelTier).map((f) => f.label);
						return (
							<button
								key={l.id}
								type="button"
								onClick={() => {
									setTier(levelTier);
									setDocAttr(TIER_ATTR, TIER_KEY, levelTier);
								}}
								style={{
									minWidth: 0,
									maxWidth: '100%',
									textAlign: 'left',
									display: 'flex',
									flexDirection: 'column',
									gap: 9,
									padding: 14,
									borderRadius: 12,
									cursor: 'pointer',
									border: `1px solid ${on ? T.accBd : T.bd}`,
									background: on ? T.accSub : T.surf,
									boxShadow: on ? T.smd : 'none',
								}}
							>
								<div
									style={{
										display: 'flex',
										minWidth: 0,
										alignItems: 'center',
										gap: 9,
										flexWrap: 'wrap',
									}}
								>
									<span
										style={{
											width: 30,
											height: 30,
											borderRadius: 8,
											flex: '0 0 auto',
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											background: on ? T.acc : T.alt,
											color: on ? T.accFg : T.acc,
										}}
									>
										<Icon name={l.icon} size="sm" />
									</span>
									<span style={{ font: `700 14px ${T.disp}`, color: on ? T.acc : T.ink }}>
										{l.name}
									</span>
									{l.rec && !on && <Badge status="neutral">Recommended</Badge>}
									{on && (
										<span style={{ marginLeft: 'auto' }}>
											<Icon name="check" size={16} color={T.acc} />
										</span>
									)}
								</div>
								<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.sub }}>{l.blurb}</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
									{reveals.map((r) => (
										<span
											key={r}
											style={{
												display: 'flex',
												minWidth: 0,
												alignItems: 'center',
												gap: 6,
												font: `11px ${T.sans}`,
												color: T.ter,
												overflowWrap: 'anywhere',
											}}
										>
											<Icon name="check" size={12} color={on ? T.acc : T.ter} />
											{r}
										</span>
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

const errMsg = (e: unknown, fallback: string) =>
	e instanceof Error && e.message ? e.message : fallback;

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
		<Panel
			title="Profile"
			action={
				<Badge status="success" icon="check">
					Cloud account
				</Badge>
			}
		>
			{failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Couldn’t load your profile — check your connection and reopen this tab.
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

function friendlyDeviceName(raw: string): string {
	const value = raw.trim();
	if (!value) return 'Remembered device';
	const platform = /iPhone|iPad/i.test(value)
		? 'iPhone or iPad'
		: /Android/i.test(value)
			? 'Android device'
			: /Windows/i.test(value)
				? 'Windows PC'
				: /Macintosh|Mac OS/i.test(value)
					? 'Mac'
					: /Linux/i.test(value)
						? 'Linux device'
						: null;
	const browser = /Edg\//.test(value)
		? 'Edge'
		: /Firefox\//.test(value)
			? 'Firefox'
			: /Chrome\//.test(value)
				? 'Chrome'
				: /Safari\//.test(value)
					? 'Safari'
					: null;
	if (browser && platform) return `${browser} on ${platform}`;
	if (platform) return platform;
	return value.length > 60 ? `${value.slice(0, 57)}…` : value;
}

/** Devices remembered by Cognito, plus the separate global sign-out action. */
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
				Toaster.success(
					'Device forgotten. A session already open there may continue until it expires.',
				);
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not forget that device.')))
			.finally(() => setBusy(false));
	};
	const signOutEverywhere = () => {
		setBusy(true);
		revokeAllSessions()
			.then(async () => {
				setSignOutOpen(false);
				Toaster.success(
					'Sign-out requested everywhere. Open sessions may continue until they expire.',
				);
				await auth.signOut(); // the global revoke killed this session's refresh token too
			})
			.catch((e: unknown) => Toaster.error(errMsg(e, 'Could not sign out everywhere.')))
			.finally(() => setBusy(false));
	};
	return (
		<Panel
			title="Remembered devices"
			action={
				<Button
					variant="ghost"
					size="sm"
					icon="close"
					disabled={busy}
					onClick={() => setSignOutOpen(true)}
				>
					Sign out everywhere
				</Button>
			}
		>
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
				Devices this account recognizes after sign-in. Forgetting one does not erase its local data
				or immediately close a session already open there. “Sign out everywhere” prevents those
				sessions from renewing.
			</div>
			{failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Couldn’t load your devices — check your connection and reopen this tab.
				</div>
			) : devices === null ? (
				<div
					role="status"
					aria-label="Loading devices"
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={46} />
					<Skeleton height={46} />
				</div>
			) : devices.length === 0 ? (
				<EmptyState
					inset
					icon="Monitor"
					title="No remembered devices yet"
					description="Devices appear here after they sign in."
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{devices.map((d, i) => (
						<div
							key={d.deviceKey}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 12,
								padding: '11px 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<span
								style={{
									width: 34,
									height: 34,
									borderRadius: 8,
									flex: '0 0 auto',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: T.alt,
									color: T.sub,
								}}
							>
								<Icon name="Monitor" size="sm" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{friendlyDeviceName(d.name)}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{d.lastSeen
										? `Last seen ${new Date(d.lastSeen).toLocaleString()}`
										: 'Last seen: unknown'}
								</div>
							</div>
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => setPendingRevoke(d)}>
								Forget
							</Button>
						</div>
					))}
				</div>
			)}
			<Dialog
				open={pendingRevoke !== null}
				onClose={() => setPendingRevoke(null)}
				title="Forget this device?"
				description="Remove it from your account’s remembered-device list."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setPendingRevoke(null)}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busy}
							onClick={() => pendingRevoke && revoke(pendingRevoke.deviceKey)}
						>
							{busy ? 'Forgetting…' : 'Forget device'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					<strong style={{ color: T.ink }}>{friendlyDeviceName(pendingRevoke?.name ?? '')}</strong>{' '}
					will no longer be recognized as a remembered device. Nothing on it is erased, and its
					current session may remain open until it expires; use “Sign out everywhere” to prevent
					account sessions from renewing.
				</div>
			</Dialog>
			<Dialog
				open={signOutOpen}
				onClose={() => setSignOutOpen(false)}
				title="Sign out everywhere?"
				description="Stop future token refresh on every device, including this one."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setSignOutOpen(false)}
						>
							Cancel
						</Button>
						<Button variant="danger" size="sm" disabled={busy} onClick={signOutEverywhere}>
							{busy ? 'Signing out…' : 'Sign out everywhere'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This device signs out now. Other devices cannot refresh their sessions, but access tokens
					already issued to them can remain valid until they expire (normally within an hour).
				</div>
			</Dialog>
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
				'Export DND Tools account data',
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
					`Your online account was deleted, but ${cleanupWarnings.join(' and ')}. Close and reopen the app to retry queued key removal. If the warning returns, remove the saved DND Tools credential with your operating-system credential manager.`,
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

function SettingsAccount() {
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

/* ---- Subscription (REAL entitlements hook — server-backed when signed in, honest local fallback;
 * plans are ALWAYS explicitly simulated: no payment processor exists anywhere in this product) ------ */
function SettingsSubscription() {
	const navigate = useNavigate();
	const ent = useEntitlements();
	const current = PLAN_CARDS.find((p) => p.id === ent.plan) ?? PLAN_CARDS[0];
	const sourceBadge =
		ent.source === 'server' ? (
			<Badge status="success" icon="check">
				Account preview
			</Badge>
		) : ent.source === 'cache' ? (
			<Badge status="warning">Last known (offline)</Badge>
		) : (
			<Badge status="neutral">This device only</Badge>
		);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					padding: '18px 20px',
					borderRadius: 14,
					border: `1px solid ${T.accBd}`,
					background: `linear-gradient(135deg, ${T.accSub}, ${T.raised})`,
					boxShadow: T.smd,
					flexWrap: 'wrap',
				}}
			>
				<span
					style={{
						width: 46,
						height: 46,
						borderRadius: 12,
						flex: '0 0 auto',
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Icon name={current.cloud ? 'connection' : 'home'} size="lg" />
				</span>
				<div style={{ flex: '1 1 220px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
						<span style={{ font: `700 19px ${T.disp}` }}>{ent.loading ? '…' : current.name}</span>
						{sourceBadge}
					</div>
					<div style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
						{current.tagline} · {current.price ? `$${current.price}/mo planned` : 'Free'} · preview
						access, no payment
					</div>
				</div>
				<Button variant="secondary" size="sm" icon="arrow-up" onClick={() => navigate('/upgrade')}>
					Compare preview plans
				</Button>
			</div>

			<Panel
				title="Plan preview"
				action={
					<Button
						variant="ghost"
						size="sm"
						iconRight="arrow-right"
						onClick={() => navigate('/upgrade')}
					>
						Full comparison
					</Button>
				}
			>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
						gap: 14,
					}}
				>
					{PLAN_CARDS.map((pl) => {
						const on = pl.id === ent.plan;
						return (
							<div
								key={pl.id}
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 12,
									padding: 16,
									borderRadius: 13,
									position: 'relative',
									border: `1px solid ${on ? T.accBd : pl.popular ? T.bdS : T.bd}`,
									background: on ? T.accSub : T.surf,
									boxShadow: on ? T.smd : 'none',
								}}
							>
								{pl.popular && !on && (
									<span
										style={{
											position: 'absolute',
											top: -9,
											right: 14,
											font: `600 10px ${T.sans}`,
											letterSpacing: '.06em',
											textTransform: 'uppercase',
											color: T.accFg,
											background: T.acc,
											padding: '2px 8px',
											borderRadius: 20,
										}}
									>
										Recommended
									</span>
								)}
								<div>
									<div style={{ font: `700 16px ${T.disp}`, color: on ? T.acc : T.ink }}>
										{pl.name}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>{pl.tagline}</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
									<span style={{ font: `700 26px ${T.mono}`, color: T.ink }}>
										{pl.price ? `$${pl.price}` : 'Free'}
									</span>
									{pl.price > 0 && (
										<span style={{ font: `12px ${T.sans}`, color: T.ter }}>/mo</span>
									)}
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
									{pl.features.map((f: string) => (
										<span
											key={f}
											style={{
												display: 'flex',
												alignItems: 'flex-start',
												gap: 7,
												font: `11.5px/1.4 ${T.sans}`,
												color: T.sub,
											}}
										>
											<span style={{ marginTop: 1 }}>
												<Icon name="check" size={12} color={pl.cloud ? T.acc : T.ter} />
											</span>
											{f}
										</span>
									))}
								</div>
								{on ? (
									<Button variant="secondary" size="sm" disabled>
										Current plan
									</Button>
								) : (
									<Button
										variant={pl.price > (current.price || 0) ? 'primary' : 'secondary'}
										size="sm"
										icon={pl.price > (current.price || 0) ? 'arrow-up' : undefined}
										onClick={() => navigate('/upgrade')}
									>
										{ent.serverBacked && !ent.canChangePlan
											? 'View plan'
											: pl.cloud
												? 'Try preview'
												: 'Switch'}
									</Button>
								)}
							</div>
						);
					})}
				</div>
			</Panel>

			<Panel
				title={ent.serverBacked && !ent.canChangePlan ? 'Plan availability' : 'Preview access'}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{ent.serverBacked && !ent.canChangePlan ? (
						<>
							Self-service cloud plan changes are not available in this release. The app cannot take
							a payment or activate a paid plan. See{' '}
							<strong style={{ color: T.ink }}>Plans &amp; cloud</strong> for planned hosted
							features; local play remains available.
						</>
					) : (
						<>
							Cloud plans are currently a free preview. Listed prices are planned launch prices; the
							app does not request a payment method or charge you. Your selection is stored{' '}
							{ent.serverBacked ? 'on your account' : 'on this device'} and can be changed from{' '}
							<strong style={{ color: T.ink }}>Plans &amp; cloud</strong>.
						</>
					)}
				</div>
			</Panel>
		</div>
	);
}

/* ---- Players (REAL — the live actor roster the Core enforces visibility against) ---------------- */
const ROLE_LABEL: Record<string, string> = {
	dm: 'Dungeon Master',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};
/** Badge tone per role — the Co-DM shares the DM's accent (elevated), players `info`, observers neutral. */
const roleBadgeTone = (role: string): 'accent' | 'info' | 'neutral' =>
	role === 'dm' || role === 'co-dm' ? 'accent' : role === 'observer' ? 'neutral' : 'info';
/** The web join link an invite token redeems at — the /join route outside the DM shell. */
const inviteJoinUrl = (token: string) => publicAppHashUrl('/join', { token });

const copyText = async (text: string, okMessage: string) => {
	try {
		await navigator.clipboard.writeText(text);
		Toaster.success(okMessage);
	} catch {
		Toaster.error('Could not copy — copy the link manually.');
	}
};

/** Pending invites — REAL server-minted join links (app-api) when configured + signed in. */
function InvitesPanel({
	cloudReady,
	createOpen,
	onCloseCreate,
}: {
	cloudReady: boolean;
	createOpen: boolean;
	onCloseCreate: () => void;
}) {
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
	const mintedJoinUrl = minted ? inviteJoinUrl(minted.token) : null;
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
		if (!mintedJoinUrl) {
			setQr(null);
			return;
		}
		let cancelled = false;
		void qrDataUrl(mintedJoinUrl).then((url) => {
			if (!cancelled) setQr(url);
		});
		return () => {
			cancelled = true;
		};
	}, [mintedJoinUrl]);
	const close = () => {
		setMinted(null);
		setCampaignName('');
		setNote('');
		setRole('player');
		setEmail('');
		onCloseCreate();
	};
	const mint = () => {
		if (!publicAppBaseUrl()) {
			Toaster.error('Shareable links are not configured for this desktop build.');
			return;
		}
		const name = campaignName.trim();
		if (!name) {
			Toaster.error('Give the invite a campaign name.');
			return;
		}
		if (role === 'co-dm' && coDmSeats <= 0) {
			Toaster.error(
				ent.canChangePlan
					? 'Try the Lantern or Beacon preview to invite a Co-DM at no charge.'
					: 'Your current plan has no Co-DM seats, and plan changes are unavailable in this release.',
			);
			return;
		}
		const to = email.trim();
		// Catch an obvious typo client-side; the server validates authoritatively.
		if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
			Toaster.error('Enter a valid email address, or leave it blank to just get a link.');
			return;
		}
		setBusy(true);
		apiCreateInvite({
			campaignName: name,
			note: note.trim() || undefined,
			role,
			email: to || undefined,
		})
			.then((invite) => {
				setMinted(invite);
				setInvites((list) => (list ? [invite, ...list] : [invite]));
				if (invite.emailStatus === 'sent')
					Toaster.success(`Invite emailed to ${invite.emailedTo ?? to}.`);
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
					Online invite links work before the invitee opens the app.{' '}
					{isAccountApiConfigured
						? 'Sign in to create and manage them.'
						: 'Online invite links are unavailable here — share a live-table code directly instead.'}
				</div>
			) : failed ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Couldn’t load your invites — check your connection and reopen this tab.
				</div>
			) : invites === null ? (
				<div
					role="status"
					aria-label="Loading invites"
					style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
				>
					<Skeleton height={44} />
					<Skeleton height={44} />
				</div>
			) : invites.length === 0 ? (
				<EmptyState
					inset
					icon="send"
					title="No pending invites"
					description="“Invite player” mints a shareable join link (it expires after 14 days)."
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{invites.map((v, i) => {
						const joinUrl = inviteJoinUrl(v.token);
						return (
							<div
								key={v.inviteId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Icon name="send" size={15} color={T.ter} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<span style={{ font: `600 13px ${T.sans}` }}>{v.campaignName}</span>
										{v.role === 'co-dm' && <Badge status="accent">Co-DM</Badge>}
									</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{v.note ? `${v.note} · ` : ''}expires{' '}
										{new Date(v.expiresAt * 1000).toLocaleDateString()}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									icon="link"
									disabled={busy || !joinUrl}
									title={joinUrl ? undefined : 'Public app URL is not configured'}
									onClick={() => joinUrl && void copyText(joinUrl, 'Join link copied.')}
								>
									Copy link
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setPendingRevoke(v)}
								>
									Revoke
								</Button>
							</div>
						);
					})}
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
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => setPendingRevoke(null)}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busy}
							onClick={() => pendingRevoke && revoke(pendingRevoke.inviteId)}
						>
							{busy ? 'Revoking…' : 'Revoke invite'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					The join link for <strong style={{ color: T.ink }}>{pendingRevoke?.campaignName}</strong>{' '}
					stops working immediately, even if it was already shared. Anyone who already joined keeps
					their seat — mint a new invite to replace it.
				</div>
			</Dialog>
			<Dialog
				open={createOpen}
				onClose={close}
				title={minted ? 'Invite ready to share' : 'Invite a player'}
				description={
					minted
						? 'Send this link however you like — it works for 14 days or until you revoke it.'
						: 'Mints a shareable join link — add an email to send it, or share the link yourself.'
				}
				icon="send"
				size="md"
				footer={
					minted ? (
						<Button variant="primary" size="sm" onClick={close}>
							Done
						</Button>
					) : (
						<>
							<Button variant="secondary" size="sm" disabled={busy} onClick={close}>
								Cancel
							</Button>
							<Button variant="primary" size="sm" icon="send" disabled={busy} onClick={mint}>
								{busy ? 'Creating…' : 'Create invite'}
							</Button>
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
								<Icon
									name={minted.emailStatus === 'sent' ? 'check' : 'info'}
									size={14}
									color={minted.emailStatus === 'sent' ? T.ok : T.ter}
								/>
								<span>
									{minted.emailStatus === 'sent'
										? `Emailed to ${minted.emailedTo}. They can also use the link below.`
										: 'Email couldn’t be sent — email delivery isn’t set up for this app. Share the link below instead.'}
								</span>
							</div>
						)}
						{/* deliberate literal #fff: a QR quiet zone must stay white for scanners, whatever the theme */}
						{qr && (
							<img
								src={qr}
								alt="QR code for the join link"
								style={{
									width: 168,
									height: 168,
									borderRadius: 10,
									border: `1px solid ${T.bd}`,
									background: '#fff',
									padding: 8,
								}}
							/>
						)}
						<code
							style={{
								font: `11.5px ${T.mono}`,
								color: T.sub,
								wordBreak: 'break-all',
								textAlign: 'center',
							}}
						>
							{mintedJoinUrl ?? 'Public app URL is not configured.'}
						</code>
						<Button
							variant="secondary"
							size="sm"
							icon="link"
							disabled={!mintedJoinUrl}
							onClick={() => mintedJoinUrl && void copyText(mintedJoinUrl, 'Join link copied.')}
						>
							Copy link
						</Button>
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						<Input
							value={campaignName}
							onChange={(e: { target: { value: string } }) => setCampaignName(e.target.value)}
							placeholder="Campaign name (shown to the invitee)"
							aria-label="Campaign name"
							maxLength={80}
						/>
						<Textarea
							value={note}
							onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
							placeholder="Note (optional) — e.g. “We play Fridays at 7”"
							aria-label="Invite note"
							rows={2}
							maxLength={200}
						/>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span
								style={{
									font: `600 11.5px ${T.sans}`,
									color: T.ter,
									textTransform: 'uppercase',
									letterSpacing: '.06em',
								}}
							>
								Seat
							</span>
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
						<Input
							type="email"
							value={email}
							onChange={(e: { target: { value: string } }) => setEmail(e.target.value)}
							placeholder="Email invite to… (optional)"
							aria-label="Recipient email"
							autoComplete="off"
							maxLength={254}
						/>
						<div style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							Leave email blank to just get a shareable link + QR code. When set, we’ll also email
							the invite if this app has email delivery configured.
						</div>
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
	const actors = Object.values(runtime.state.permissions.actors) as {
		id: string;
		role: string;
		displayName: string;
	}[];
	const sorted = [...actors].sort((a, b) =>
		a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : a.displayName.localeCompare(b.displayName),
	);

	// Co-DM seat entitlement — the plan's seats vs. the live co-DM headcount. The Core `assign-role`
	// command re-checks this and fails closed; the UI mirrors it so the affordance is honest.
	const coDmSeats = coDmSeatsForPlan(ent.plan);
	const coDmInUse = countCoDmActors(runtime.state.permissions);
	const dmActorId = runtime.defaultActorId;

	const assignRole = (
		targetActorId: string,
		role: 'co-dm' | 'player' | 'observer',
		displayName: string,
	) => {
		void runtime
			.dispatch({
				type: 'permission.assign-role',
				actorId: dmActorId,
				payload: { targetActorId, role, coDmSeatLimit: coDmSeats },
			})
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
							else
								Toaster.info(
									'Online invite links are unavailable here — share a live-table code directly.',
								);
						}}
					>
						Invite player
					</Button>
				}
			>
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					{sorted.length} {sorted.length === 1 ? 'person' : 'people'} in this campaign. Each person
					sees only the scenes and tools their role allows.
				</div>
				<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginBottom: 8 }}>
					{coDmSeats > 0 ? (
						<>
							Co-DM seats:{' '}
							<strong style={{ color: T.ink }}>
								{coDmInUse} of {coDmSeats}
							</strong>{' '}
							used. A Co-DM sees your DM-only content and can run the table, but never manages
							roles, grants, invites, or the vault.
						</>
					) : (
						<>
							Your plan has no Co-DM seats.{' '}
							{ent.canChangePlan
								? 'You can try the Lantern or Beacon preview at no charge to promote a trusted player.'
								: 'Plan changes are unavailable in this release.'}
						</>
					)}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column' }}>
					{sorted.map((a, i) => {
						const promotable = a.role !== 'dm';
						const roleOptions = [
							{ value: 'player', label: 'Player' },
							{ value: 'observer', label: 'Observer' },
							{
								value: 'co-dm',
								label: coDmSeats > 0 ? `Co-DM (${coDmInUse}/${coDmSeats})` : 'Co-DM (no seats)',
							},
						];
						return (
							<div
								key={a.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '10px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<Avatar
									name={a.displayName}
									size="sm"
									ring={a.role === 'dm' || a.role === 'co-dm' ? 'active' : undefined}
								/>
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
			<InvitesPanel
				cloudReady={cloudReady}
				createOpen={inviteOpen}
				onCloseCreate={() => setInviteOpen(false)}
			/>
		</div>
	);
}

/* ---- Permissions (REAL — real grant list + grant/revoke commands; DM-authored, fail-closed in core) -- */
function SettingsPermissions() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const actors = runtime.state.permissions.actors as Record<
		string,
		{ id: string; role: string; displayName: string }
	>;
	const grants = runtime.state.permissions.grants;
	const scenes = Object.values(runtime.state.scenes.scenes) as { id: string; name: string }[];
	// Grant targets are players/observers only — a DM / Co-DM already has full authority, so granting to
	// them is meaningless (and a Co-DM must never be a grant target from this owner-only surface).
	const players = Object.values(actors).filter((a) => a.role !== 'dm' && a.role !== 'co-dm');
	const sceneSets = listGrantableCapabilitySets('scene');

	const roleCounts = { dm: 0, 'co-dm': 0, player: 0, observer: 0 } as Record<string, number>;
	for (const a of Object.values(actors)) roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
	const roleCards = [
		{
			id: 'dm',
			name: 'Dungeon Master',
			desc: 'Full authority — authors content, grants, and the live session.',
			tone: 'accent',
		},
		{
			id: 'co-dm',
			name: 'Co-DM',
			desc: 'Sees DM-only content and runs the table, but never manages roles, grants, invites, or the vault.',
			tone: 'accent',
		},
		{
			id: 'player',
			name: 'Player',
			desc: 'Owns their character; sees only what the DM shares.',
			tone: 'info',
		},
		{
			id: 'observer',
			name: 'Observer',
			desc: 'Read-only; never holds character data.',
			tone: 'neutral',
		},
	];

	const [grantPlayer, setGrantPlayer] = useState<string>(players[0]?.id ?? '');
	const [grantScene, setGrantScene] = useState<string>(scenes[0]?.id ?? '');
	const [grantSet, setGrantSet] = useState<string>(sceneSets[0]?.capabilitySet ?? 'viewer');
	const selectedGrantPlayer = players.some((player) => player.id === grantPlayer)
		? grantPlayer
		: (players[0]?.id ?? '');
	const selectedGrantScene = scenes.some((scene) => scene.id === grantScene)
		? grantScene
		: (scenes[0]?.id ?? '');

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
										payload: {
											entityType: g.entityType,
											entityId: g.entityId,
											playerActorId: g.playerActorId,
											capabilitySet: g.capabilitySet,
											expiresAt: g.expiresAt ?? null,
										},
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
		if (!selectedGrantPlayer || !selectedGrantScene) return;
		void runtime.dispatch({
			type: 'permission.grant-capability-set',
			actorId,
			payload: {
				entityType: 'scene',
				entityId: selectedGrantScene,
				playerActorId: selectedGrantPlayer,
				capabilitySet: grantSet,
				expiresAt: null,
			},
		});
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Roles">
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
						gap: 12,
					}}
				>
					{roleCards.map((r) => (
						<div
							key={r.id}
							style={{
								padding: 13,
								borderRadius: 10,
								border: `1px solid ${r.tone === 'accent' ? T.accBd : T.bd}`,
								background: T.surf,
							}}
						>
							<div
								style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
							>
								<span
									style={{
										font: `600 13.5px ${T.sans}`,
										color: r.tone === 'accent' ? T.acc : T.ink,
									}}
								>
									{r.name}
								</span>
								<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
									×{roleCounts[r.id] ?? 0}
								</span>
							</div>
							<div style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, marginTop: 4 }}>{r.desc}</div>
						</div>
					))}
				</div>
			</Panel>

			<Panel title="Grant scene access">
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					Choose what a player can do in a specific scene. Their role still sets the maximum access
					they can receive, and only the DM can change these grants.
				</div>
				{players.length === 0 || scenes.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						{players.length === 0
							? 'Add a player before granting scene access.'
							: 'Create a scene before granting access.'}
					</div>
				) : (
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select
								aria-label="Player"
								value={selectedGrantPlayer}
								onChange={(e: { target: { value: string } }) => setGrantPlayer(e.target.value)}
								options={players.map((pl) => ({ value: pl.id, label: pl.displayName }))}
							/>
						</span>
						<span style={{ flex: 1, minWidth: 140 }}>
							<Select
								aria-label="Scene"
								value={selectedGrantScene}
								onChange={(e: { target: { value: string } }) => setGrantScene(e.target.value)}
								options={scenes.map((sc) => ({ value: sc.id, label: sc.name }))}
							/>
						</span>
						<Seg
							value={grantSet}
							onChange={setGrantSet}
							options={sceneSets.map((s) => ({ value: s.capabilitySet, label: s.label }))}
						/>
						<Button variant="primary" size="sm" icon="check" onClick={grant}>
							Grant
						</Button>
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
						{
							key: 'grantId',
							header: '',
							align: 'right',
							render: (id: any) => (
								<Button variant="ghost" size="sm" icon="trash" onClick={() => revoke(id)}>
									Revoke
								</Button>
							),
						},
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
	const when = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never';
	const disconnectFolder = (f: FolderSourceRecord) => {
		void disconnectFolderSource(f.id)
			.then(listFolderSources)
			.then((list) => {
				setFolders(list);
				setPendingDisconnect(null);
				Toaster.success(
					`“${f.name}” disconnected — reconnect it any time from Knowledge → Sources.`,
				);
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
			<Panel
				title="Vault connections"
				action={
					<Button
						variant="secondary"
						size="sm"
						icon="import"
						onClick={() => navigate('/knowledge')}
					>
						Manage in Knowledge
					</Button>
				}
			>
				{/* Real WS-7 source registry (fsSource + googleDocs) — import/write-back actions live in the
				    Knowledge → Sources panel, which dispatches content.commit-import / content.write-to-source. */}
				{loading ? (
					<div
						role="status"
						aria-label="Loading vault connections"
						style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
					>
						<Skeleton height={52} />
						<Skeleton height={52} />
					</div>
				) : rows.length === 0 ? (
					<EmptyState
						inset
						icon="vault"
						title="No sources connected"
						description={`Connect a local markdown folder${isGoogleDocsConfigured ? ' or a Google Doc' : ''} from Knowledge → Sources; pull and push live there too.`}
						action={
							<Button
								variant="secondary"
								size="sm"
								icon="import"
								onClick={() => navigate('/knowledge')}
							>
								Open Knowledge → Sources
							</Button>
						}
					/>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{rows.map((s, i) => (
							<div
								key={s.key}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 12,
									padding: '12px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<span
									style={{
										width: 36,
										height: 36,
										borderRadius: 8,
										background: T.alt,
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										color: T.acc,
										flex: '0 0 auto',
									}}
								>
									<Icon name="vault" size="md" />
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ font: `600 13px ${T.sans}` }}>{s.name}</div>
									<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
										{s.kind} · {s.meta}
									</div>
								</div>
								<Badge status="success">connected</Badge>
								<Button variant="ghost" size="sm" icon="trash" onClick={s.disconnect}>
									Disconnect
								</Button>
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
							<Button variant="secondary" size="sm" onClick={() => setPendingDisconnect(null)}>
								Cancel
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="trash"
								onClick={() => pendingDisconnect && disconnectFolder(pendingDisconnect)}
							>
								Disconnect
							</Button>
						</>
					}
				>
					<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
						Disconnecting <strong style={{ color: T.ink }}>{pendingDisconnect?.name}</strong> drops
						this app’s permission to the folder. Nothing on disk or in your vault is deleted — but
						reconnecting means picking the folder again in Knowledge → Sources.
					</div>
				</Dialog>
				{!isFsSourceSupported() && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						This browser cannot connect a local folder. Use the desktop app or a supported Chromium
						browser instead.
					</div>
				)}
				{!isGoogleDocsConfigured && (
					<div style={{ font: `11.5px/1.6 ${T.sans}`, color: T.ter }}>
						Google Docs connections aren’t available in this edition.
					</div>
				)}
			</Panel>
		</div>
	);
}

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
						disabled={!canEnable || busy}
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

/** ADR-026 — the typed phrases confirming a vault-privacy-mode switch (AccountDangerPanel pattern). */
const TO_PRIVATE_PHRASE = 'i hold the keys';
const TO_CLOUD_PHRASE = 'read my vault';

/** ADR-026 — shows the recorded per-vault privacy mode and hosts the consented switch dialog. */
function VaultPrivacyPanel() {
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
					{isPrivate ? 'Private (E2EE)' : 'Cloud-Enhanced'}
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
function RecoveryKeyPanel() {
	const auth = useAuth();
	const cloud = useCloudSync();
	const accountId = auth.status === 'signed-in' && auth.user?.sub ? auth.user.sub : null;
	const custodyAvailable = cloud.gate?.custodyAvailable ?? false;
	const [busy, setBusy] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [pass, setPass] = useState('');
	const [passConfirm, setPassConfirm] = useState('');
	const passOk = pass.length >= MIN_RECOVERY_PASSPHRASE_CHARS && pass === passConfirm;

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
				'DND Tools recovery key',
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
								disabled={busy || !passOk}
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
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassConfirm(e.target.value)}
							placeholder="Repeat passphrase"
							aria-label="Repeat recovery passphrase"
							style={{ width: '100%' }}
						/>
					)}
				</div>
			</Dialog>
		</Panel>
	);
}

function SettingsSync() {
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
			<VaultPrivacyPanel />
			<CloudSyncPanel online={online} localChanges={ops.length} />
			<RecoveryKeyPanel />
			<LocalBackupPanel />
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
				'Save DND Tools vault backup',
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
/**
 * Guided connect presets — one card per provider. Selecting a card sets the non-secret provider
 * settings (kind + base URL + a suggested model); the user still pastes their own key below. The
 * external model ids are best-effort suggestions and stay user-editable. The local Ollama card points
 * at the loopback OpenAI-compatible endpoint, which `validateAiBaseUrl` allows in dev.
 */
interface AiProviderPreset {
	id: string;
	label: string;
	provider: AiProviderKind;
	baseUrl: string;
	model: string;
	steps: string[];
	note?: string;
}

const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
	{
		id: 'anthropic',
		label: 'Anthropic (Claude)',
		provider: 'anthropic',
		baseUrl: '',
		model: DEFAULT_ANTHROPIC_MODEL,
		steps: [
			'Create a key at console.anthropic.com → API Keys.',
			'Pick this card, paste the key below, and Save.',
		],
	},
	{
		id: 'openai',
		label: 'OpenAI',
		provider: 'openai-compatible',
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-4o-mini',
		steps: [
			'Create a key at platform.openai.com → API keys.',
			'Pick this card, paste the key below, and Save.',
		],
	},
	{
		id: 'gemini',
		label: 'Google Gemini',
		provider: 'openai-compatible',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		model: 'gemini-2.0-flash',
		steps: [
			'Create a key at aistudio.google.com → API keys.',
			'Pick this card, paste the key below, and Save.',
		],
		note: 'Uses Google’s OpenAI-compatible endpoint.',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		provider: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'openai/gpt-4o-mini',
		steps: [
			'Create a key at openrouter.ai → Keys.',
			'Pick this card, paste the key below, and Save.',
		],
		note: 'One key, many models — change the model id to route.',
	},
	{
		id: 'ollama',
		label: LOCAL_OLLAMA.label,
		provider: 'openai-compatible',
		baseUrl: LOCAL_OLLAMA.baseUrl,
		model: LOCAL_OLLAMA.defaultModel,
		steps: [...LOCAL_OLLAMA.setupSteps],
		note: LOCAL_OLLAMA.note,
	},
];

/** Which preset the current settings match (for the "selected" chip). Anthropic matches by kind. */
function matchingPresetId(settings: AiProviderSettings): string | null {
	for (const preset of AI_PROVIDER_PRESETS) {
		if (preset.provider === 'anthropic' && settings.provider === 'anthropic') return preset.id;
		if (
			preset.provider === 'openai-compatible' &&
			settings.provider === 'openai-compatible' &&
			settings.baseUrl.replace(/\/+$/, '') === preset.baseUrl
		) {
			return preset.id;
		}
	}
	return null;
}

type OllamaProbe =
	| { status: 'unknown' }
	| { status: 'running'; models: string[] }
	| { status: 'down' };

function AiProviderPanel({ onConfiguredChange }: { onConfiguredChange: () => void }) {
	const capabilities = usePlatformCapabilities();
	const [settings, setSettings] = useState(() => getAiProviderSettings());
	const [keyDraft, setKeyDraft] = useState('');
	const [hasKey, setHasKey] = useState(() => getAiProviderKey() !== null);
	const [hasLegacyKey, setHasLegacyKey] = useState(() => hasLegacyAiProviderKey());
	const [keyBusy, setKeyBusy] = useState(false);
	const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
	const [forgetConfirmOpen, setForgetConfirmOpen] = useState(false);
	const [legacyConfirmOpen, setLegacyConfirmOpen] = useState(false);
	const [ollama, setOllama] = useState<OllamaProbe>({ status: 'unknown' });
	const [ollamaBusy, setOllamaBusy] = useState(false);
	const configured = isAiProviderConfigured();
	const activePresetId = matchingPresetId(settings);

	// Best-effort local-runner detection is explicitly user-initiated: merely opening Settings must not
	// probe a loopback service. A connection refusal is the normal "not running" state.
	const detectOllama = async () => {
		setOllamaBusy(true);
		try {
			const response = await fetch(LOCAL_OLLAMA.healthUrl);
			if (!response.ok) throw new Error('bad status');
			const data = (await response.json()) as { models?: Array<{ name?: string }> };
			const models = (data.models ?? [])
				.map((model) => model.name)
				.filter((name): name is string => typeof name === 'string');
			setOllama({ status: 'running', models });
		} catch {
			setOllama({ status: 'down' });
		} finally {
			setOllamaBusy(false);
		}
	};

	const applyPreset = (preset: AiProviderPreset) => {
		if (hasKey) {
			Toaster.warning('Forget the current key before switching providers.');
			return;
		}
		patch({
			provider: preset.provider,
			baseUrl: preset.baseUrl,
			model: preset.model,
		});
	};
	const destination = resolveAiProviderDestination(settings);
	const destinationProviderLabel =
		destination?.provider === 'anthropic' ? 'Anthropic' : 'the OpenAI-compatible provider';

	const patch = (p: Partial<typeof settings>) => {
		const next = { ...settings, ...p };
		if (
			hasKey &&
			resolveAiProviderDestination(next)?.scope !== resolveAiProviderDestination(settings)?.scope
		) {
			Toaster.warning('Forget the current key before changing its provider or destination.');
			return;
		}
		setSettings(saveAiProviderSettings(p));
		onConfiguredChange();
	};
	const saveKey = async () => {
		if (keyDraft.trim() === '' || !destination) return;
		setKeyBusy(true);
		const result = await setAiProviderKey(keyDraft);
		setKeyBusy(false);
		if (!result.saved) {
			Toaster.error(
				`That API key is too long. The limit is ${MAX_API_KEY_CHARS.toLocaleString()} characters.`,
			);
			return;
		}
		setSaveConfirmOpen(false);
		setKeyDraft('');
		setHasKey(true);
		if (result.storage === 'os-encrypted') {
			Toaster.success('API key saved in OS-encrypted storage.');
		} else if (result.durableError) {
			Toaster.warning('Saved for this session, but OS-encrypted storage is unavailable.');
		} else {
			Toaster.success('API key saved for this browser session.');
		}
		onConfiguredChange();
	};
	const forgetKey = async () => {
		setKeyBusy(true);
		const result = await clearAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error(
				result.durableError
					? 'Could not remove the key from OS-encrypted storage. It remains available in this session.'
					: 'The key changed before it could be forgotten. Try again.',
			);
			return;
		}
		setForgetConfirmOpen(false);
		setHasKey(false);
		Toaster.success('API key forgotten.');
		onConfiguredChange();
	};
	const forgetLegacyKey = async () => {
		setKeyBusy(true);
		const result = await clearLegacyAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error('Could not remove the older key from OS-encrypted storage. Try again.');
			return;
		}
		setLegacyConfirmOpen(false);
		setHasLegacyKey(false);
		Toaster.success('Older unassigned key removed.');
	};

	return (
		<Panel
			title="AI provider"
			action={
				<Badge status={configured ? 'success' : 'neutral'}>
					{configured ? 'Configured' : 'Not configured'}
				</Badge>
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Bring your own key — DND Tools does not include one or send it through our servers. The key
				stays on this device (memory + this browser session; OS-encrypted storage in native apps)
				and is never written to the campaign, its history, or cloud backups. Until a key is saved,
				the assistant stays off.
			</div>
			<div style={{ marginTop: 14 }}>
				<div style={{ font: `600 12px ${T.sans}`, color: T.ink, marginBottom: 8 }}>
					Connect a provider
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
						gap: 10,
					}}
				>
					{AI_PROVIDER_PRESETS.map((preset) => {
						const selected = activePresetId === preset.id;
						const isOllama = preset.id === 'ollama';
						const platformUnsupported = isOllama && !capabilities.allowHttpLoopbackAi;
						const locked = (hasKey && !selected) || platformUnsupported;
						return (
							<button
								key={preset.id}
								type="button"
								disabled={locked}
								onClick={() => applyPreset(preset)}
								style={{
									textAlign: 'left',
									padding: '11px 12px',
									borderRadius: 10,
									border: `1px solid ${selected ? T.accBd : T.bd}`,
									background: selected ? T.accSub : T.alt,
									cursor: locked ? 'not-allowed' : 'pointer',
									opacity: locked ? 0.55 : 1,
									display: 'flex',
									flexDirection: 'column',
									gap: 6,
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
									<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{preset.label}</span>
									{selected && <Badge status="success">selected</Badge>}
									{platformUnsupported && <Badge status="neutral">desktop-only</Badge>}
									{isOllama && ollama.status !== 'unknown' && (
										<Badge status={ollama.status === 'running' ? 'success' : 'neutral'}>
											{ollama.status === 'running'
												? `detected · ${ollama.models.length}`
												: 'not running'}
										</Badge>
									)}
								</div>
								<ol
									style={{
										margin: 0,
										paddingLeft: 16,
										font: `11px/1.5 ${T.sans}`,
										color: T.ter,
									}}
								>
									{preset.steps.map((step, i) => (
										<li key={i}>{step}</li>
									))}
								</ol>
								{(platformUnsupported || preset.note) && (
									<div style={{ font: `10.5px ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
										{platformUnsupported ? LOCAL_OLLAMA.desktopOnlyNote : preset.note}
									</div>
								)}
								{isOllama &&
									ollama.status === 'running' &&
									!ollama.models.includes(preset.model) && (
										<div style={{ font: `10.5px ${T.mono}`, color: T.warn }}>
											Run: ollama pull {preset.model}
										</div>
									)}
							</button>
						);
					})}
				</div>
				{activePresetId === 'ollama' && capabilities.allowHttpLoopbackAi && (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
						<Button
							variant="secondary"
							size="sm"
							disabled={ollamaBusy}
							onClick={() => void detectOllama()}
						>
							{ollamaBusy ? 'Checking…' : 'Check for local Ollama'}
						</Button>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							Detection contacts only http://localhost:11434 after you choose to check.
						</span>
					</div>
				)}
			</div>
			{hasLegacyKey && (
				<div
					style={{
						marginTop: 12,
						padding: '10px 12px',
						borderRadius: 8,
						border: `1px solid ${T.warn}`,
						background: `color-mix(in srgb, ${T.warn} 10%, transparent)`,
						font: `12px/1.55 ${T.sans}`,
						color: T.sub,
					}}
				>
					An older key without a verified destination was found. For safety, it is not active and
					will never be sent automatically. Check the destination below and re-enter the key if you
					still want to use it.{' '}
					<Button
						variant="ghost"
						size="sm"
						disabled={keyBusy}
						onClick={() => setLegacyConfirmOpen(true)}
					>
						Remove older copy
					</Button>
				</div>
			)}
			<SetRow
				label="Provider"
				help="Anthropic's API directly, or any OpenAI-compatible endpoint (local runner, proxy, other vendor)."
				control={
					<Seg
						value={settings.provider}
						ariaLabel="AI provider"
						onChange={(v) => {
							const provider = v as AiProviderKind;
							patch({
								provider,
								model: provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : settings.model,
							});
						}}
						options={[
							{ value: 'anthropic', label: 'Anthropic', disabled: hasKey },
							{
								value: 'openai-compatible',
								label: 'OpenAI-compatible',
								disabled: hasKey,
							},
						]}
					/>
				}
			/>
			<SetRow
				label="Model"
				help={
					settings.provider === 'anthropic'
						? `Defaults to ${DEFAULT_ANTHROPIC_MODEL}.`
						: 'The model id the endpoint expects.'
				}
				control={
					<span style={{ flex: '0 0 240px' }}>
						<Input
							value={settings.model}
							maxLength={MAX_MODEL_CHARS}
							aria-label="Model id"
							onChange={(e: { target: { value: string } }) => patch({ model: e.target.value })}
						/>
					</span>
				}
			/>
			{settings.provider === 'openai-compatible' && (
				<SetRow
					label="Base URL"
					help={
						hasKey
							? 'Forget the current key before changing this destination.'
							: 'The API base, e.g. https://api.example.com/v1 — /chat/completions is appended.'
					}
					control={
						<span style={{ flex: '0 0 300px' }}>
							<Input
								value={settings.baseUrl}
								maxLength={MAX_BASE_URL_CHARS}
								disabled={hasKey}
								aria-label="API base URL"
								placeholder="https://api.example.com/v1"
								onChange={(e: { target: { value: string } }) => patch({ baseUrl: e.target.value })}
							/>
						</span>
					}
				/>
			)}
			<SetRow
				label="Credential destination"
				help="Your key is bound to this provider and receiving origin. It cannot be reused after the provider or host changes."
				control={
					<span
						style={{
							display: 'block',
							maxWidth: 360,
							wordBreak: 'break-word',
							font: `12px/1.5 ${T.mono}`,
							color: destination ? T.ink : T.err,
						}}
					>
						{destination ? destination.baseUrl : 'Enter a valid API base URL'}
					</span>
				}
			/>
			<SetRow
				label="API key"
				help={
					hasKey
						? 'A key is stored on this device. Paste a new one to replace it.'
						: 'Paste your provider API key to turn the assistant on.'
				}
				control={
					<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
						<span style={{ flex: '1 1 220px', minWidth: 180 }}>
							<Input
								type="password"
								maxLength={MAX_API_KEY_CHARS}
								value={keyDraft}
								aria-label="Provider API key"
								placeholder={hasKey ? '••••••••  (stored)' : 'sk-…'}
								onChange={(e: { target: { value: string } }) => setKeyDraft(e.target.value)}
							/>
						</span>
						<Button
							variant="primary"
							size="sm"
							icon="check"
							disabled={keyBusy || keyDraft.trim() === '' || !destination}
							onClick={() => setSaveConfirmOpen(true)}
						>
							{keyBusy ? 'Saving…' : 'Save key'}
						</Button>
						{hasKey && (
							<Button
								variant="ghost"
								size="sm"
								icon="trash"
								disabled={keyBusy}
								onClick={() => setForgetConfirmOpen(true)}
							>
								Forget key
							</Button>
						)}
					</span>
				}
			/>
			<Dialog
				open={saveConfirmOpen}
				onClose={() => !keyBusy && setSaveConfirmOpen(false)}
				title="Confirm credential destination"
				description="Check where this provider key will be sent before saving it."
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setSaveConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={keyBusy || !destination}
							onClick={() => void saveKey()}
						>
							{keyBusy ? 'Saving…' : 'Confirm and save'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This key will be available only to{' '}
					<strong style={{ color: T.ink }}>{destinationProviderLabel}</strong> at{' '}
					<strong style={{ color: T.ink, wordBreak: 'break-word' }}>{destination?.origin}</strong>.
					Requests use the API base{' '}
					<span style={{ fontFamily: T.mono }}>{destination?.baseUrl}</span>.
				</div>
			</Dialog>
			<Dialog
				open={forgetConfirmOpen}
				onClose={() => !keyBusy && setForgetConfirmOpen(false)}
				title="Forget this provider key?"
				description="The assistant will stay off until you confirm a destination and enter a key again."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setForgetConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button variant="danger" size="sm" disabled={keyBusy} onClick={() => void forgetKey()}>
							{keyBusy ? 'Forgetting…' : 'Forget key'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This removes the key scoped to{' '}
					<strong style={{ color: T.ink }}>{destination?.origin}</strong> from this session and,
					when available, OS-encrypted storage.
				</div>
			</Dialog>
			<Dialog
				open={legacyConfirmOpen}
				onClose={() => !keyBusy && setLegacyConfirmOpen(false)}
				title="Remove the older unassigned key?"
				description="It is already inactive and will not be migrated automatically."
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setLegacyConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={keyBusy}
							onClick={() => void forgetLegacyKey()}
						>
							{keyBusy ? 'Removing…' : 'Remove older copy'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This permanently removes the unassigned key. Re-enter it above only after confirming the
					receiving provider and address.
				</div>
			</Dialog>
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

// Device-local preference: also raise a desktop notification when a run finishes (opt-in; the browser
// still gates it behind its own permission prompt). Carries no data — a boolean in localStorage.
const AI_NOTIFY_KEY = 'dndtools.ai.notify-on-complete';

function aiNotifyEnabled(): boolean {
	try {
		return localStorage.getItem(AI_NOTIFY_KEY) === '1';
	} catch {
		return false;
	}
}

function persistAiNotifyEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(AI_NOTIFY_KEY, enabled ? '1' : '0');
	} catch {
		/* preference is best-effort */
	}
}

/** Best-effort platform notification; permission was granted during explicit opt-in. */
function maybePlatformNotify(title: string, body: string): void {
	if (!aiNotifyEnabled()) return;
	void platformNotifications.notify(title, body).catch(() => false);
}

/** The completion protocol: an in-app toast on every terminal state, plus the opt-in desktop ping. */
function notifyRunComplete(status: AssistantRunStatus, events: AssistantEvent[]): void {
	const staged = events.filter((e) => e.type === 'tool' && e.outcome === 'staged').length;
	const stagedNote =
		staged > 0 ? ` — ${staged} change${staged === 1 ? '' : 's'} staged for your review below` : '';
	switch (status) {
		case 'completed':
			Toaster.success(`Assistant finished${stagedNote}.`);
			maybePlatformNotify('Assistant finished', `Your request is done${stagedNote || '.'}`);
			break;
		case 'budget-exhausted':
			Toaster.info(`Assistant stopped at the step limit${stagedNote}.`);
			maybePlatformNotify('Assistant stopped at the step limit', `Ask it to continue if needed.`);
			break;
		case 'cancelled':
			Toaster.info('Assistant run cancelled.');
			break;
		case 'failed':
			Toaster.error('The assistant run stopped — see the transcript for the reason.');
			maybePlatformNotify('Assistant run stopped', 'See the transcript for the reason.');
			break;
		default:
			break;
	}
}

/**
 * The assistant — one ask at a time, run AS a registered agent connection through the Core's
 * fail-closed pipeline. Reads come back actor-filtered; writes surface as staged proposals in the
 * review panel below. Disabled honestly (with the reason) until every prerequisite is real:
 * provider key, MCP master switch, a registered binding, DM + not previewing.
 */
function AiAssistantPanel({ canWrite }: { canWrite: boolean }) {
	const capabilities = usePlatformCapabilities();
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
	// Live run protocol (ADR-025): the current phase + which pass/tool is in flight, streamed from
	// runAssistantExchange's onEvent, so the panel shows progress instead of a silent spinner.
	const [runStatus, setRunStatus] = useState<AssistantRunStatus | null>(null);
	const [progress, setProgress] = useState<{ pass: number; maxPasses: number; toolId?: string }>({
		pass: 0,
		maxPasses: 0,
	});
	const [notify, setNotify] = useState(aiNotifyEnabled());
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!notify) return;
		let cancelled = false;
		void platformNotifications
			.permission()
			.then((permission) => {
				if (cancelled || permission === 'granted') return;
				setNotify(false);
				persistAiNotifyEnabled(false);
			})
			.catch(() => {
				if (cancelled) return;
				setNotify(false);
				persistAiNotifyEnabled(false);
			});
		return () => {
			cancelled = true;
		};
	}, [notify]);

	const selectedAgent = mcp.bindings[agentId] ? agentId : (bindings[0]?.agentId ?? '');
	const blocker = !configured
		? 'Add a provider API key above to turn the assistant on.'
		: !mcp.enabled
			? 'Enable agent access above to let the assistant use campaign tools.'
			: bindings.length === 0
				? 'Register an agent connection below and choose the campaign identity it should use.'
				: !canWrite
					? 'The assistant is DM-only and unavailable while previewing.'
					: null;

	const ask = () => {
		const text = input.trim();
		if (text === '' || asking || blocker !== null || selectedAgent === '') return;
		setAsking(true);
		setInput('');
		setFeed((prev) => [...prev, { kind: 'user', text }]);
		setRunStatus('starting');
		setProgress({ pass: 0, maxPasses: 0 });
		const controller = new AbortController();
		abortRef.current = controller;
		const config = resolveAiProviderConfig();
		void runAssistantExchange({
			send: (req) => sendAiChat(config, req),
			invoke: (toolId, toolInput) =>
				runtime.invokeAgentTool({
					agentId: selectedAgent,
					toolId,
					input: toolInput,
					forceStageWrites: true,
				}),
			tools: AI_TOOL_SPECS,
			turns,
			userText: text,
			signal: controller.signal,
			// Stream each display event + status transition live. Feed events append incrementally, so a
			// long multi-step run reveals its tool calls as they happen (no re-append in `.then`).
			onEvent: (event) => {
				if (event.type === 'feed') {
					setFeed((prev) => [...prev, { kind: 'event', ...event.event }]);
				} else {
					setRunStatus(event.status);
					setProgress({ pass: event.pass, maxPasses: event.maxPasses, toolId: event.activeToolId });
				}
			},
		})
			.then((result) => {
				setTurns(result.turns);
				notifyRunComplete(result.status, result.events);
			})
			.finally(() => {
				setAsking(false);
				setRunStatus(null);
				abortRef.current = null;
			});
	};

	// The one-line phase readout shown while a run is in flight (the "keep the user informed" protocol).
	const statusText =
		runStatus === 'starting'
			? 'Starting…'
			: runStatus === 'working'
				? progress.toolId
					? `Working — step ${progress.pass} of ${progress.maxPasses} · ${progress.toolId}`
					: `Working — step ${progress.pass} of ${progress.maxPasses}`
				: asking
					? 'Finishing…'
					: null;

	const toggleNotify = async (on: boolean) => {
		if (!on) {
			setNotify(false);
			persistAiNotifyEnabled(false);
			return;
		}
		if (!platformNotifications.available()) return;
		let permission: PlatformNotificationPermission;
		try {
			permission = await platformNotifications.permission();
			if (permission === 'prompt') {
				permission = await platformNotifications.requestPermission();
			}
		} catch {
			permission = 'denied';
		}
		if (permission !== 'granted') {
			setNotify(false);
			persistAiNotifyEnabled(false);
			Toaster.warning('Notifications were not enabled because permission was not granted.');
			return;
		}
		setNotify(true);
		persistAiNotifyEnabled(true);
	};

	return (
		<Panel
			title="Assistant"
			action={asking ? <Badge status="info">{statusText ?? 'Working…'}</Badge> : undefined}
		>
			<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter }}>
				Ask about the campaign. The assistant sees only what the identity you choose is allowed to
				see, and it works autonomously — it may take several steps to finish. Any change it suggests
				lands in the review panel below and waits for your approval.
			</div>
			{blocker !== null ? (
				<div
					style={{
						padding: '9px 12px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.alt,
						font: `12px/1.6 ${T.sans}`,
						color: T.ter,
					}}
				>
					{blocker}
				</div>
			) : (
				<>
					{feed.length > 0 && (
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								maxHeight: 320,
								overflowY: 'auto',
								padding: '4px 0',
							}}
						>
							{feed.map((item, i) => {
								if (item.kind === 'user') {
									return (
										<div
											key={i}
											style={{
												alignSelf: 'flex-end',
												maxWidth: '85%',
												padding: '7px 11px',
												borderRadius: 10,
												background: T.accSub,
												border: `1px solid ${T.accBd}`,
												font: `12.5px/1.55 ${T.sans}`,
												color: T.ink,
												whiteSpace: 'pre-wrap',
											}}
										>
											{item.text}
										</div>
									);
								}
								if (item.type === 'text') {
									return (
										<div
											key={i}
											style={{
												alignSelf: 'flex-start',
												maxWidth: '85%',
												padding: '7px 11px',
												borderRadius: 10,
												background: T.alt,
												border: `1px solid ${T.bd}`,
												font: `12.5px/1.55 ${T.sans}`,
												color: T.ink,
												whiteSpace: 'pre-wrap',
											}}
										>
											{item.text}
										</div>
									);
								}
								const badge = TOOL_OUTCOME_BADGE[item.outcome] ?? TOOL_OUTCOME_BADGE.error;
								return (
									<div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
										<div
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												font: `11.5px ${T.sans}`,
												color: T.ter,
											}}
										>
											<Icon name="sparkle" size={13} color={T.ter} />
											<span style={{ font: `11.5px ${T.mono}` }}>{item.toolId}</span>
											<Badge status={badge.status}>{badge.label}</Badge>
											<span
												style={{
													minWidth: 0,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{item.detail}
											</span>
										</div>
										{item.issues && item.issues.length > 0 && (
											// Inline validation: the exact fields the Core rejected, so the user watches
											// the model fix its input on the next step.
											<div style={{ marginLeft: 21, font: `11px ${T.mono}`, color: T.err }}>
												{item.issues.map((issue, k) => (
													<div key={k}>
														{issue.path ? `${issue.path}: ` : ''}
														{issue.message}
													</div>
												))}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
					{asking && (
						// The "static structure while the model processes" (ADR-025): a skeleton stands in for
						// the forthcoming answer, with a live phase line and a Cancel that aborts between steps.
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								padding: '10px 12px',
								borderRadius: 9,
								border: `1px solid ${T.bd}`,
								background: T.alt,
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<Badge status="info">{statusText ?? 'Working…'}</Badge>
								<div style={{ flex: 1 }} />
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									onClick={() => abortRef.current?.abort()}
								>
									Cancel
								</Button>
							</div>
							<Skeleton variant="text" lines={3} />
						</div>
					)}
					<Switch
						checked={notify}
						onChange={(on: boolean) => void toggleNotify(on)}
						disabled={!capabilities.notifications.available}
						label={
							!capabilities.notifications.available
								? (capabilities.notifications.unavailableMessage ??
									'Notifications are unavailable.')
								: 'Notify me on this device when a run finishes.'
						}
					/>
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
						<Button
							variant="primary"
							size="sm"
							icon="sparkle"
							disabled={asking || input.trim() === ''}
							onClick={ask}
						>
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
	const actors = Object.values(runtime.state.permissions.actors) as {
		id: string;
		role: string;
		displayName: string;
	}[];

	// Register-agent form (a binding names WHICH actor a future connection speaks as — no capability).
	const [newAgentId, setNewAgentId] = useState('');
	const [newLabel, setNewLabel] = useState('');
	const [newActorId, setNewActorId] = useState<string>(
		actors.find((a) => a.role !== 'dm')?.id ?? actors[0]?.id ?? '',
	);
	const selectedNewActorId = actors.some((actor) => actor.id === newActorId)
		? newActorId
		: (actors.find((actor) => actor.role !== 'dm')?.id ?? actors[0]?.id ?? '');

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
	const pending = (Object.values(mcp.proposals) as McpStagedProposal[]).filter(
		(pr) => pr.status === 'pending',
	);
	const recentAudit = mcp.auditEntries.slice(-5).reverse();
	const actorName = (id: string) => runtime.state.permissions.actors[id]?.displayName ?? id;

	const registerAgent = () => {
		const agentId = newAgentId.trim();
		if (!agentId || !selectedNewActorId) {
			Toaster.error(
				'Give the agent connection an id and choose the campaign identity it should use.',
			);
			return;
		}
		run(
			{
				type: 'mcp.set-agent-binding',
				actorId,
				payload: { agentId, actorId: selectedNewActorId, label: newLabel.trim() },
			},
			`Registered ${agentId} — it starts with the campaign default (${MCP_MODE_LABEL[mcp.vaultDefaultMode]}) until you set a policy.`,
		);
		setNewAgentId('');
		setNewLabel('');
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			{!canWrite && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Agent access is DM-only and cannot be changed while previewing as a player.
				</div>
			)}
			<Panel
				title="AI & agent access"
				action={
					<Switch
						checked={mcp.enabled}
						disabled={!canWrite || busy}
						label={mcp.enabled ? 'Enabled' : 'Off'}
						onChange={() =>
							run(
								{ type: 'mcp.set-enabled', actorId, payload: { enabled: !mcp.enabled } },
								mcp.enabled
									? 'Agent access turned off.'
									: 'Agent access turned on — the policies below now apply.',
							)
						}
					/>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This switch controls every assistant connection for this campaign. Turning it off
					immediately blocks all campaign tool access, regardless of the saved provider key or
					individual agent policy.
				</div>
				<div
					style={{
						marginTop: 8,
						padding: '9px 12px',
						borderRadius: 9,
						border: `1px solid ${T.bd}`,
						background: T.alt,
						font: `12px/1.6 ${T.sans}`,
						color: T.ter,
					}}
				>
					The built-in assistant uses the provider configured below. Each agent also needs an
					identity and policy, so you stay in control of what it can read and whether proposed
					changes need review.
				</div>
				<SetRow
					label="Default posture for new agents"
					help="The starting policy for a new connection. New agents can be disabled or require review; they never start with direct write access."
					control={
						<Seg
							value={mcp.vaultDefaultMode}
							ariaLabel="Vault default agent posture"
							onChange={(v) => {
								if (!canWrite || busy) return;
								run(
									{ type: 'mcp.set-vault-default', actorId, payload: { mode: v } },
									`New agents now default to ${MCP_MODE_LABEL[v as McpPolicyMode]}.`,
								);
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
					Each connection uses one campaign identity and gains no permissions of its own. It can
					never see or do more than that identity, and its policy decides whether changes require
					review.
				</div>
				{bindings.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No agent connections registered yet — register one below to author its policy ahead of
						time.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{bindings.map((b, i) => {
							const policy = mcp.policies[b.agentId] ?? null;
							const mode: McpPolicyMode = policy?.mode ?? mcp.vaultDefaultMode;
							const allowedToolIds = policy?.allowedToolIds ?? [];
							const baselineMembership = baselineAllowlistMembership(allowedToolIds);
							return (
								<div
									key={b.agentId}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										padding: '11px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
										flexWrap: 'wrap',
									}}
								>
									<Icon name="sparkle" size={16} color={T.acc} />
									<div style={{ flex: '1 1 180px', minWidth: 0 }}>
										<div style={{ font: `600 13px ${T.sans}` }}>{b.label || b.agentId}</div>
										<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
											{b.agentId} → {actorName(b.actorId)}
										</div>
									</div>
									<Badge status="neutral">Policy saved</Badge>
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
														payload: {
															agentId: b.agentId,
															mode: e.target.value,
															allowedToolIds: policy?.allowedToolIds ?? [],
															auditVisible: policy?.auditVisible ?? true,
														},
													},
													`${b.label || b.agentId} set to ${MCP_MODE_LABEL[e.target.value as McpPolicyMode]}.`,
												)
											}
											options={MCP_POLICY_MODES.map((m) => ({
												value: m,
												label: MCP_MODE_LABEL[m],
											}))}
										/>
									</span>
									<Switch
										checked={baselineMembership.all}
										disabled={!canWrite || busy}
										label={
											baselineMembership.some && !baselineMembership.all
												? `Baseline tools (${baselineMembership.count}/${baselineMembership.total})`
												: 'Baseline tools'
										}
										onChange={() =>
											run(
												{
													type: 'mcp.set-agent-policy',
													actorId,
													payload: {
														agentId: b.agentId,
														mode,
														allowedToolIds: toggleBaselineToolAllowlist(allowedToolIds),
														auditVisible: policy?.auditVisible ?? true,
													},
												},
												baselineMembership.all
													? 'Baseline tools removed; custom tool grants were preserved.'
													: 'The complete current baseline was granted; custom tool grants were preserved.',
											)
										}
									/>
									<Button
										variant="ghost"
										size="sm"
										icon="trash"
										disabled={!canWrite || busy}
										onClick={() =>
											run(
												{
													type: 'mcp.remove-agent-binding',
													actorId,
													payload: { agentId: b.agentId },
												},
												`${b.label || b.agentId} removed — its pending proposals expire.`,
											)
										}
									>
										Remove
									</Button>
								</div>
							);
						})}
					</div>
				)}
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
				>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input
							value={newAgentId}
							onChange={(e: { target: { value: string } }) => setNewAgentId(e.target.value)}
							placeholder="Agent id (e.g. prep-assistant)"
							aria-label="Agent connection id"
							maxLength={60}
						/>
					</span>
					<span style={{ flex: '1 1 140px', minWidth: 120 }}>
						<Input
							value={newLabel}
							onChange={(e: { target: { value: string } }) => setNewLabel(e.target.value)}
							placeholder="Label (optional)"
							aria-label="Agent label"
							maxLength={80}
						/>
					</span>
					<span style={{ flex: '0 0 170px' }}>
						<Select
							aria-label="Campaign identity the agent uses"
							value={selectedNewActorId}
							onChange={(e: { target: { value: string } }) => setNewActorId(e.target.value)}
							options={actors.map((a) => ({ value: a.id, label: `${a.displayName} (${a.role})` }))}
						/>
					</span>
					<Button
						variant="primary"
						size="sm"
						icon="add"
						disabled={!canWrite || busy}
						onClick={registerAgent}
					>
						Register
					</Button>
				</div>
			</Panel>

			<Panel
				title="Staged writes awaiting review"
				action={<Badge status={pending.length ? 'warning' : 'success'}>{pending.length}</Badge>}
			>
				{pending.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Nothing staged. Under strict review, every agent write lands here as a proposal you
						approve or reject — nothing an agent does commits without you.
					</div>
				) : (
					pending.map((pr, i) => (
						<div
							key={pr.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 10,
								padding: '10px 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
								flexWrap: 'wrap',
							}}
						>
							<Icon name="warning" size={15} color={T.warn} />
							<div style={{ flex: '1 1 200px', minWidth: 0 }}>
								<div style={{ font: `600 13px ${T.sans}` }}>{pr.commandType}</div>
								<div style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
									{pr.agentId} as {actorName(pr.actorId)} · {pr.toolId} · {pr.writeRisk}
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								icon="check"
								disabled={!canWrite || busy}
								onClick={() =>
									run(
										{ type: 'mcp.approve-proposal', actorId, payload: { proposalId: pr.id } },
										'Proposal approved and committed through the normal dispatch.',
									)
								}
							>
								Approve
							</Button>
							<Button
								variant="ghost"
								size="sm"
								icon="close"
								disabled={!canWrite || busy}
								onClick={() =>
									run(
										{ type: 'mcp.reject-proposal', actorId, payload: { proposalId: pr.id } },
										'Proposal rejected — nothing was written.',
									)
								}
							>
								Reject
							</Button>
						</div>
					))
				)}
			</Panel>

			<Panel title="Tool registry (baseline)">
				<div style={{ font: `12px/1.6 ${T.sans}`, color: T.ter, marginBottom: 6 }}>
					The campaign tools an agent may be granted. Read results respect its chosen identity, and
					changes wait for review unless you explicitly choose a more permissive policy.
				</div>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
					{MCP_BASELINE_TOOL_IDS.map((t) => (
						<Chip key={t} tone="neutral">
							{t}
						</Chip>
					))}
				</div>
				{recentAudit.length > 0 && (
					<div style={{ marginTop: 12 }}>
						<div
							style={{
								font: `600 11px ${T.sans}`,
								letterSpacing: '.08em',
								textTransform: 'uppercase',
								color: T.ter,
								marginBottom: 6,
							}}
						>
							Recent agent activity
						</div>
						{recentAudit.map((a) => (
							<div
								key={a.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '5px 0',
									font: `12px ${T.sans}`,
									color: T.sub,
								}}
							>
								<Badge
									status={a.mode === 'denied' ? 'error' : a.mode === 'staged' ? 'warning' : 'info'}
								>
									{a.mode}
								</Badge>
								<span style={{ font: `11.5px ${T.mono}`, color: T.ter }}>
									{a.agentId} · {a.toolId}
								</span>
								<span style={{ marginLeft: 'auto', font: `11px ${T.sans}`, color: T.ter }}>
									{new Date(a.recordedAt).toLocaleString()}
								</span>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}

/** The one durable consent control. It remains reachable when AI is hidden, but the AI setup and
 * assistant panels themselves never render until the user explicitly picks Complete use. */
function SettingsToolPreferences() {
	const [preference, setPreference] = useState<AiUsagePreference>(getAiUsagePreference);
	const choose = (next: AiUsagePreference) => {
		saveAiUsagePreference(next);
		setPreference(next);
		Toaster.success(
			next === 'complete'
				? 'Complete use enabled. AI & tools is now available in Settings.'
				: next === 'generation-only'
					? 'Random generation stays available. AI tools are hidden and blocked.'
					: 'AI tools are hidden and blocked.',
		);
	};
	return (
		<Panel title="Tool preferences">
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Control optional tools for this device. Choosing anything except Complete use immediately
				hides the assistant and provider setup, and blocks model requests even if a key remains
				stored.
			</div>
			<div
				role="radiogroup"
				aria-label="Optional tool preference"
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
					gap: 10,
				}}
			>
				{(
					[
						{
							id: 'complete' as const,
							title: 'Complete use',
							desc: 'Use the optional campaign assistant and its provider setup, plus built-in generators.',
						},
						{
							id: 'generation-only' as const,
							title: 'Random generation stuff',
							desc: 'Keep built-in offline generators. Assistant, provider, and model controls stay hidden.',
						},
						{
							id: 'none' as const,
							title: 'None',
							desc: 'Hide and block all optional AI tools. Only this Settings control can re-enable them.',
						},
					] satisfies Array<{ id: AiUsagePreference; title: string; desc: string }>
				).map((option) => {
					const selected = preference === option.id;
					return (
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={selected}
							onClick={() => choose(option.id)}
							style={{
								padding: 12,
								borderRadius: 10,
								border: `1px solid ${selected ? T.accBd : T.bd}`,
								background: selected ? T.accSub : T.alt,
								textAlign: 'left',
								cursor: 'pointer',
							}}
						>
							<div style={{ font: `600 13px ${T.sans}`, color: selected ? T.acc : T.ink }}>
								{option.title}
							</div>
							<div style={{ marginTop: 4, font: `12px/1.5 ${T.sans}`, color: T.ter }}>
								{option.desc}
							</div>
						</button>
					);
				})}
			</div>
		</Panel>
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
				Installed widget packages — their capabilities, host-permission review, and enable/disable —
				are managed in <strong style={{ color: T.ink }}>Extensions</strong>, backed by the live
				widget registry.
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="widget"
				onClick={() => navigate('/extensions')}
				style={{ alignSelf: 'flex-start' }}
			>
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
				Switching the campaign rules system — including the non-destructive migration dry-run that
				has to come back clean first — lives in{' '}
				<strong style={{ color: T.ink }}>Extensions → System</strong>, backed by the live extension
				registry and the same safe migration check used throughout the app.
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="scroll"
				onClick={() => navigate('/extensions')}
				style={{ alignSelf: 'flex-start' }}
			>
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
	{
		keys: '← ↑ ↓ →',
		action: 'Move between canvas widgets; move the selected widget while editing',
	},
	{ keys: 'Enter / Space', action: 'Select the focused widget (opens the inspector in edit mode)' },
	{ keys: 'Shift + Arrows', action: 'Resize the selected widget (canvas edit mode)' },
	{ keys: 'Delete', action: 'Remove the selected widget (canvas edit mode)' },
	{ keys: 'Esc', action: 'Close dialog / deselect widget / exit preview' },
];
function SettingsAccessibility() {
	const runtime = useRuntime();
	// Single source of truth = the live <html> attribute (the same one Appearance + index.html restore).
	const [theme, setTheme] = useState<string>(
		document.documentElement.getAttribute('data-theme') || 'tavern',
	);
	const [motion, setMotion] = useState<string>(
		document.documentElement.getAttribute('data-motion') || 'full',
	);
	const reduceMotion = motion === 'reduced';
	const highContrast = theme === 'high-contrast';

	// REAL player-safety checks: run the SAME actor-filtered reads a player actor gets and assert no
	// dm-only entity leaks through them. Computed live against the current vault, not authored flags.
	const leakChecks = (() => {
		const players = (
			Object.values(runtime.state.permissions.actors) as { id: string; role: string }[]
		).filter((a) => a.role === 'player');
		const checks: { id: string; ok: boolean; label: string }[] = [];
		let sceneLeaks = 0;
		let contentLeaks = 0;
		for (const p of players) {
			sceneLeaks += listScenesForActor(
				runtime.state.scenes,
				runtime.state.permissions,
				p.id,
			).filter((s) => s.visibility === 'dm-only').length;
			contentLeaks += getContentItemsForActor(
				runtime.state.content,
				runtime.state.permissions,
				p.id,
			).filter((c) => c.visibility === 'dm-only').length;
		}
		checks.push({
			id: 'scenes',
			ok: sceneLeaks === 0,
			label:
				players.length === 0
					? 'DM-only scenes: add a player to run this check'
					: `DM-only scenes are hidden from all ${players.length} players`,
		});
		checks.push({
			id: 'content',
			ok: contentLeaks === 0,
			label:
				players.length === 0
					? 'DM-only notes and handouts: add a player to run this check'
					: 'DM-only notes and handouts are hidden from every player view',
		});
		checks.push({
			id: 'preview',
			ok: true,
			label: 'Player preview is read-only, so campaign changes are blocked',
		});
		return checks;
	})();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<Panel title="Display & motion">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					These mirror your Appearance settings, take effect immediately, and stay selected next
					time.
				</div>
				<SetRow
					label="Reduce motion"
					help="Turns off interface animation while keeping every action available."
					control={
						<Switch
							checked={reduceMotion}
							aria-label="Reduce motion"
							onChange={() => {
								const v = reduceMotion ? 'full' : 'reduced';
								setMotion(v);
								setDocAttr('data-motion', 'dndtools:react:motion', v);
							}}
						/>
					}
				/>
				<SetRow
					label="High-contrast theme"
					help="Switches to the accessibility-floor theme; turning it off restores the Tavern theme."
					control={
						<Switch
							checked={highContrast}
							aria-label="High-contrast theme"
							onChange={() => {
								const v = highContrast ? 'tavern' : 'high-contrast';
								setTheme(v);
								setDocAttr('data-theme', 'dndtools:react:theme', v);
							}}
						/>
					}
				/>
			</Panel>
			<Panel title="Keyboard shortcuts">
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))',
						gap: '8px 24px',
					}}
				>
					{REAL_SHORTCUTS.map((s, i) => (
						<div
							key={i}
							style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}
						>
							<span
								style={{
									font: `12px ${T.mono}`,
									color: T.ink,
									border: `1px solid ${T.bd}`,
									borderRadius: 5,
									padding: '2px 7px',
									background: T.alt,
									whiteSpace: 'nowrap',
								}}
							>
								{s.keys}
							</span>
							<span
								style={{
									minWidth: 0,
									font: `12.5px ${T.sans}`,
									color: T.sub,
									overflowWrap: 'anywhere',
								}}
							>
								{s.action}
							</span>
						</div>
					))}
				</div>
			</Panel>
			<Panel title="Player-safety checks">
				<div style={{ font: `12.5px/1.5 ${T.sans}`, color: T.ter, marginBottom: 4 }}>
					These checks use the same views your players receive and confirm DM-only content stays
					hidden.
				</div>
				{leakChecks.map((c) => (
					<div
						key={c.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: '6px 0',
							font: `12.5px ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name={c.ok ? 'success' : 'error'} size={16} color={c.ok ? T.ok : T.err} />
						<span>{c.label}</span>
					</div>
				))}
			</Panel>
		</div>
	);
}

const SUBPAGES: Record<string, () => JSX.Element> = {
	appearance: SettingsAppearance,
	language: SettingsLanguage,
	account: SettingsAccount,
	subscription: SettingsSubscription,
	players: SettingsPlayers,
	permissions: SettingsPermissions,
	vault: SettingsVault,
	sync: SettingsSync,
	tools: SettingsToolPreferences,
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
	const viewport = useViewport();
	const [tier, setTier] = useState<FeatureTier>(() => readTier());
	const [aiEnabled, setAiEnabled] = useState(isAiAssistantEnabled);
	useEffect(() => {
		const onTier = () => setTier(readTier());
		window.addEventListener(TIER_EVENT, onTier);
		return () => window.removeEventListener(TIER_EVENT, onTier);
	}, []);
	useEffect(() => {
		const onAiPreference = () => setAiEnabled(isAiAssistantEnabled());
		window.addEventListener(AI_USAGE_PREFERENCE_EVENT, onAiPreference);
		return () => window.removeEventListener(AI_USAGE_PREFERENCE_EVENT, onAiPreference);
	}, []);
	const gatedOff = (id: string) => (TAB_GATE[id] ? !isFeatureVisible(TAB_GATE[id], tier) : false);
	const urlTab = new URLSearchParams(location.search).get('tab');
	const requestedTab = urlTab && urlTab in SUBPAGES ? urlTab : 'appearance';
	// A bookmarked AI URL must never disclose its UI after the user opts out.
	const tab = requestedTab === 'ai' && !aiEnabled ? 'tools' : requestedTab;
	const setTab = (next: string) => navigate(`/settings?tab=${next}`, { replace: true });
	const Sub = SUBPAGES[tab] || SettingsAppearance;
	const visibleNav = SETTINGS_NAV.filter((s) => s.id !== 'ai' || aiEnabled).filter(
		(s) => !gatedOff(s.id),
	);
	return (
		<Page
			max={1180}
			style={{
				display: 'grid',
				gridTemplateColumns:
					viewport === 'phone'
						? '1fr'
						: viewport === 'rail'
							? '190px minmax(0,1fr)'
							: '232px minmax(0,1fr)',
				gap: viewport === 'phone' ? 16 : 24,
				alignItems: 'start',
			}}
		>
			<nav
				aria-label="Settings navigation"
				style={{
					position: viewport === 'phone' ? 'static' : 'sticky',
					top: 0,
					display: viewport === 'phone' ? 'block' : 'flex',
					flexDirection: 'column',
					gap: 2,
				}}
			>
				{viewport === 'phone' && (
					<Select
						aria-label="Settings section"
						value={tab}
						onChange={(e: { target: { value: string } }) => setTab(e.target.value)}
						options={visibleNav.map((s) => ({ value: s.id, label: s.label }))}
					/>
				)}
				{viewport !== 'phone' &&
					visibleNav.map((s) => {
						const on = s.id === tab;
						return (
							<button
								key={s.id}
								type="button"
								aria-current={on ? 'page' : undefined}
								onClick={() => setTab(s.id)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '9px 11px',
									// The rail profile is used on touch-capable tablets and foldables too.
									// Keep every category row at the shared primary touch-target minimum.
									minHeight: 44,
									borderRadius: 8,
									border: 'none',
									cursor: 'pointer',
									textAlign: 'left',
									position: 'relative',
									background: on ? T.accSub : 'transparent',
									color: on ? T.acc : T.sub,
								}}
							>
								{on && (
									<span
										style={{
											position: 'absolute',
											left: -6,
											top: 8,
											bottom: 8,
											width: 3,
											borderRadius: 3,
											background: T.acc,
										}}
									/>
								)}
								<Icon name={s.icon} size="sm" color={on ? T.acc : 'currentColor'} />
								<span
									style={{ font: `${on ? 600 : 500} 13px ${T.sans}`, color: on ? T.acc : T.ink }}
								>
									{s.label}
								</span>
							</button>
						);
					})}
			</nav>
			<div style={{ minWidth: 0 }}>
				{gatedOff(tab) ? <GatedTab gateId={TAB_GATE[tab]} tier={tier} /> : <Sub />}
			</div>
		</Page>
	);
}
