import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FEATURE_GATES, isFeatureVisible, type FeatureTier } from '@dndtools/core';
import { Button, Icon, Select } from '../../ds';
import { Page, Panel, T } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { AI_USAGE_PREFERENCE_EVENT, isAiAssistantEnabled } from '../../ai/usagePreference';
import { TIER_ATTR, TIER_EVENT, TIER_KEY, readTier, setDocAttr } from './shared';
import { COMPLEXITY_LEVELS } from './Experience';
import { SettingsAppearance } from './Appearance';
import { SettingsLanguage } from './Language';
import { SettingsAccount } from './Account';
import { SettingsSubscription } from './Subscription';
import { SettingsPlayers } from './Players';
import { SettingsPermissions } from './Permissions';
import { SettingsVault } from './Vault';
import { SettingsSync } from './Sync';
import { SettingsPlugins, SettingsSystems, SettingsToolPreferences } from './Tools';
import { SettingsAI } from './Ai';
import { SettingsAccessibility } from './Accessibility';

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
 *
 * RC-STB-2.1 split the former 4,989-line `screens/Settings.tsx` into this directory: one file per
 * subpage, with `shared.tsx` holding the device-scoped display prefs every subpage writes through and
 * the one error-message helper. This file stays the tab shell — the nav rail, the tier gate, and the
 * `SUBPAGES` map — so `App.tsx` still lazy-imports one module for the whole section.
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
	// The active sub-page can legitimately be one the tier gates off — Command Center's Manage list
	// deep-links to /settings?tab=permissions, which needs the `advanced` tier while the default is
	// `core`. Dropping it from the nav made the phone `<Select>` LIE: a native select whose `value`
	// matches no option renders the FIRST one, so the picker read "Appearance" while the panel beside
	// it read "Hidden at your experience level". Keep the active entry in the list (GatedTab still
	// renders the unlock, so it is not a dead end) and mark it on the desktop rail too.
	const activeNav = SETTINGS_NAV.find((s) => s.id === tab);
	const navItems =
		activeNav && !visibleNav.some((s) => s.id === tab) ? [...visibleNav, activeNav] : visibleNav;
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
						options={navItems.map((s) => ({ value: s.id, label: s.label }))}
					/>
				)}
				{viewport !== 'phone' &&
					navItems.map((s) => {
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
									// The literal 44 was a trap: an INLINE minHeight beats the stylesheet in
									// both directions, so it SHRANK these 13 rows below the 48px floor that
									// `html[data-android]` (styles/index.css:41) mandates. The token is 44px
									// normally and 48px under the Android runtime.
									minHeight: 'var(--touch-target-min)',
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
