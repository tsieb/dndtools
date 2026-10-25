import { settingsGateVisible, useSettingsTier } from '../../screens/settings/Experience';
import { ShellLoading } from './ShellLoading';
import { usePresenceStatus } from './presence';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	campaignNameOf,
	isDefaultScreen,
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	getContentItemsForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
	type SceneListEntry,
} from '@dndtools/core';
import { Avatar, Badge, BrandLockup, Icon, IconButton, StatusDot } from '../../ds';
import { useI18n } from '../../i18n';
import { isPlaceholderActorName, useRuntime } from '../../runtime/RuntimeContext';
import {
	PRIMARY,
	RUN,
	SETTINGS_SECTION,
	activeSectionId,
	routeOwner,
	type NavSection,
} from '../nav';
import { T } from '../screen-kit';
import { localEntriesFor, sectionPath } from './sections';
import { PinnedScreenRows, SideGroup, SideRow } from './rows';
import { useSessionPosture } from './session-posture';
import { useScreens } from '../../screens/screen/useScreens';
import { screenPath } from '../../screens/screen/screenModel';
import { LOCAL_VAULT_RENAMED_EVENT, listLocalVaults } from '../../platform/storage/coreStore';
const VaultSwitcher = lazy(() =>
	import('./VaultSwitcher').then((module) => ({ default: module.VaultSwitcher })),
);

/* Desktop (≥1025px): the 264px sidebar — brand · campaign chip · the six Primary sections (IA-1,
 * RC-ENG-15.1) · the current section's local pages · Screen shortcuts · Pinned screens · Recent ·
 * settings + DM account. Each group below Primary is its own labelled landmark, so the section you
 * are in and the screen you are on are told apart (ADR-013). */

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const [vaultsOpen, setVaultsOpen] = useState(false);
	const readVault = useCallback(() => {
		try {
			return listLocalVaults().find((vault) => vault.id === runtime.vaultId);
		} catch {
			return undefined;
		}
	}, [runtime]);
	const [vault, setVault] = useState(readVault);
	useEffect(() => {
		const refresh = () => setVault(readVault());
		window.addEventListener(LOCAL_VAULT_RENAMED_EVENT, refresh);
		return () => window.removeEventListener(LOCAL_VAULT_RENAMED_EVENT, refresh);
	}, [readVault]);
	const active = activeSectionId(location.pathname);
	const owner = routeOwner(location.pathname);
	const go = (id: string) => navigate(sectionPath(id, runtime.state, actorId));

	const activeSceneId = runtime.state.session.activeSceneId;
	const dmActor = runtime.state.permissions.actors[actorId];
	const presence = usePresenceStatus();
	// RC-SES-1.1 — the live posture comes from the session WORKFLOW, not from a selected scene: a
	// scene stays active through Standby, so the old `activeSceneId` test marked the row LIVE while
	// the Core was refusing every session command.
	const posture = useSessionPosture();
	const { t } = useI18n();
	const tier = useSettingsTier();
	const canManageSeat = settingsGateVisible('settings.nav.players', tier);
	// RC-UX-6.2 — one name: the campaign's own, or the placeholder while it has none. The catalog
	// entry is still read for the demo badge (the vault's kind is device data, not campaign data).
	const campaign = runtime.state.commandCenter.campaign;
	const campaignName = campaignNameOf(runtime.state.commandCenter) ?? t('shell.yourCampaign');
	const dmName =
		campaign?.gmDisplayName ??
		(dmActor && !isPlaceholderActorName(dmActor.displayName)
			? dmActor.displayName
			: t('settings.players.role.dm'));

	const { scenes, counts, recent } = useMemo(() => {
		// The GM Screen's backing home scene is reachable via its own nav row — listing it among the
		// table scenes (as a scene literally named "Command Center") only reads as a mystery scene.
		// The same goes for the home screen itself (RC-CAN-7.6): both are default screens.
		const allScenes = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
		).filter((s) => !s.isTemplate && !isDefaultScreen(runtime.state, s.id));
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			actorId,
		);
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId);
		const items = getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			actorId,
		);
		// Count what each screen actually lists: Notes shows kind==='note' only; Story counts its
		// Quests and Factions tabs (RC-KNW-6.2 — NPCs are counted on Characters, and the old "threads"
		// counted notes no Story tab shows). A raw item count here once claimed "9 notes" while the
		// Notes screen showed 6.
		const noteCount = items.filter((n) => n.kind === 'note').length;
		const objectCount = (subtype: string) =>
			items.filter((n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === subtype)
				.length;
		const pcCount = characters.filter((c) => c.kind === 'pc').length;
		const npcCount = characters.length - pcCount;
		const ordered = [...allScenes].sort((a, b) => {
			const rank = (s: SceneListEntry) =>
				s.id === activeSceneId ? 0 : s.visibility === 'dm-only' ? 2 : 1;
			return rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt);
		});
		const recentScenes = [...allScenes]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 3);
		return {
			scenes: ordered,
			recent: recentScenes,
			counts: {
				characters: t('shell.countCharacters', { pcs: pcCount, npcs: npcCount }),
				atlas: t('shell.countMaps', { count: maps.length }),
				campaign: t('shell.countStory', {
					quests: objectCount('quest'),
					factions: objectCount('faction'),
				}),
				knowledge: t('shell.countNotes', { count: noteCount }),
			} as Record<string, string>,
		};
	}, [runtime.state, actorId, activeSceneId, t]);

	const liveBadge = (s: NavSection) =>
		s.liveBadge === true && posture.live ? (
			<span
				style={{
					font: `700 9px ${T.sans}`,
					letterSpacing: '.08em',
					color: T.ok,
					background: 'var(--color-status-success-subtle)',
					padding: 'var(--space-0-5) var(--space-1-5)',
					borderRadius: 'var(--radius-full)',
				}}
			>
				{t('shell.live')}
			</span>
		) : null;
	const row = (
		s: NavSection,
		isActive: boolean,
		badge?: ReactNode,
		ring = false,
		current: 'page' | 'true' = 'page',
	) => {
		// RC-SES-1.1 — a live entry is wrapped, not restyled: the ring is a decorative box-shadow on
		// the wrapper (reduced motion pins it to its static resting frame), while the state itself is
		// carried by the text badge and the row's own accessible name.
		const ringed = ring && s.liveBadge === true && posture.live;
		const rendered = (
			<SideRow
				key={s.id}
				icon={s.icon}
				label={t(s.labelKey)}
				sub={counts[s.id] ?? (s.subKey ? t(s.subKey) : undefined)}
				active={isActive}
				current={current}
				onClick={() => go(s.id)}
				badge={badge}
			/>
		);
		if (!ringed) return rendered;
		return (
			<div key={s.id} className="session-live-ring" data-testid="sidebar-session-live">
				{rendered}
			</div>
		);
	};

	// IA-1 — the current section's own pages (the player sheet under Characters, Graph & search
	// under Notes). RC-UX-3.5/6.4 gates still apply, except to the page you're on.
	const ownerSection = PRIMARY.find((s) => s.id === owner);
	const local = localEntriesFor(owner, active, runtime.state, tier);
	// A shortcut is current when its own route is, or the screen it resolves to.
	const shortcutActive = (id: string) =>
		active === id || location.pathname === sectionPath(id, runtime.state, actorId);
	const { entries } = useScreens();
	// The section is `page` on its own landing and `true` while a shortcut, pin or local page under
	// it is the page — two landmarks, one `page` each (ADR-013 as amended).
	const subCurrent =
		local.some((s) => s.id === active) ||
		(owner === 'screens' &&
			(RUN.some((s) => shortcutActive(s.id)) ||
				entries.some((entry) => entry.pinned && location.pathname === screenPath(entry.id))));
	// Keep the existing recent-scene shortcuts for larger scene collections.
	const showRecent = recent.length > 0 && scenes.length > 5;

	return (
		<aside
			style={{
				width: 'calc(264px + var(--safe-area-left, 0px))',
				flex: '0 0 calc(264px + var(--safe-area-left, 0px))',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				boxSizing: 'border-box',
				paddingTop: 'var(--safe-area-top, 0px)',
				paddingBottom: 'var(--safe-area-bottom, 0px)',
				paddingLeft: 'var(--safe-area-left, 0px)',
				background: T.surf,
				borderRight: `1px solid ${T.bd}`,
			}}
		>
			{/* brand */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					padding: 'var(--space-4) var(--space-4) var(--space-3)',
				}}
			>
				<BrandLockup markSize={30} wordSize={15} gap={10} style={{ flex: 1, minWidth: 0 }} />
				<IconButton
					icon="search"
					label={t('shell.searchShortcut')}
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			</div>

			{/* The campaign chip opens the device-local vault catalog. */}
			<button
				type="button"
				onClick={() => setVaultsOpen(true)}
				aria-label={t('vaults.title')}
				aria-haspopup="dialog"
				aria-expanded={vaultsOpen}
				style={{
					margin: 'var(--space-0) var(--space-3) var(--space-1)',
					padding: 'var(--space-2) var(--space-3)',
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					background: T.alt,
					border: `1px solid ${T.bd}`,
					borderRadius: 'var(--radius-md)',
					cursor: 'pointer',
					textAlign: 'left',
				}}
			>
				<Icon name="campaign-scroll" size="sm" color={T.acc} />
				<span style={{ flex: 1, minWidth: 0 }}>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: T.space.oneHalf,
							minWidth: 0,
						}}
					>
						<span
							style={{
								display: 'block',
								minWidth: 0,
								font: `600 12.5px ${T.sans}`,
								color: T.ink,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}
						>
							{campaignName}
						</span>
						{/* RC-UX-3.7 — the demo vault is badged wherever its name shows. */}
						{vault?.kind === 'demo' && (
							<span style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
								<Badge status="info">{t('vaults.demoBadge')}</Badge>
							</span>
						)}
					</span>
					<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.sub }}>
						{t('shell.campaignCounts', {
							scenes: scenes.length,
							characters: counts.characters,
						})}
					</span>
				</span>
				<Icon name="chevron-down" size={13} color={T.ter} />
			</button>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: 'auto',
					overflowX: 'hidden',
					padding: 'var(--space-1) var(--space-3) var(--space-2)',
				}}
			>
				<nav role="navigation" aria-label={t('shell.navPrimary')}>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-0-5)',
							marginTop: 'var(--space-2)',
						}}
					>
						{PRIMARY.map((s) =>
							row(s, owner === s.id, liveBadge(s), false, subCurrent ? 'true' : 'page'),
						)}
					</div>
				</nav>

				{ownerSection && local.length > 0 && (
					<nav aria-label={t(ownerSection.labelKey)}>
						<SideGroup label={t(ownerSection.labelKey)}>
							{local.map((s) =>
								row(
									s,
									active === s.id,
									// RC-UX-3.5 — Graph just earned its spot via usage, not a manual tier
									// switch: flag it so the DM notices the newly-revealed surface.
									s.id === 'graph' ? (
										<Badge status="accent">{t('shell.navSurfaceNew')}</Badge>
									) : undefined,
								),
							)}
						</SideGroup>
					</nav>
				)}

				<nav aria-label={t('shell.navScreenShortcuts')}>
					<SideGroup label={t('shell.groupRunTable')}>
						{RUN.map((s) => row(s, shortcutActive(s.id), liveBadge(s), true))}
					</SideGroup>
				</nav>

				<PinnedScreenRows />

				{showRecent && (
					<nav aria-label={t('shell.navShortcuts')}>
						<SideGroup label={t('shell.groupRecentScenes')}>
							{recent.map((s) => (
								<SideRow
									key={s.id}
									icon="scene"
									label={s.name}
									onClick={() => navigate(`/scene/${s.id}`)}
								/>
							))}
						</SideGroup>
					</nav>
				)}
			</div>

			{/* footer: the Settings utility (it owns Plans & cloud) + account */}
			<div style={{ borderTop: `1px solid ${T.bd}`, padding: 'var(--space-2) var(--space-3)' }}>
				<nav aria-label={t('shell.navSettings')}>
					<SideRow
						icon={SETTINGS_SECTION.icon}
						label={t(SETTINGS_SECTION.labelKey)}
						active={owner === 'settings'}
						onClick={() => go('settings')}
					/>
				</nav>
				{/* account block — the DM's own seat. One button (→ Settings › Players, where the name is
				    edited); the presence dot sits INSIDE the caption so the name column keeps its width.
				    A never-renamed seat shows the role rather than the seeded "Default DM" placeholder. */}
				<button
					type="button"
					disabled={!canManageSeat}
					onClick={canManageSeat ? () => navigate('/settings?tab=players') : undefined}
					// Below Players' tier the seat stays visible but names why it doesn't open (RC-UX-5.2).
					title={canManageSeat ? t('shell.accountOpen') : t('shell.accountGated')}
					aria-label={
						canManageSeat
							? t('shell.accountLabel', { name: dmName, presence: presence.label })
							: dmName
					}
					aria-description={canManageSeat ? undefined : t('shell.accountGated')}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						width: '100%',
						marginTop: 'var(--space-1)',
						padding: 'var(--space-2) var(--space-2)',
						border: 'none',
						borderRadius: 'var(--radius-md)',
						background: 'transparent',
						color: T.ink,
						cursor: canManageSeat ? 'pointer' : 'default',
						textAlign: 'left',
					}}
					onMouseEnter={(e) => {
						if (canManageSeat) e.currentTarget.style.background = T.hover;
					}}
					onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
				>
					<Avatar name={dmName} size="sm" ring="active" style={{ color: T.ink }} />
					<span style={{ flex: 1, minWidth: 0 }}>
						<span
							style={{
								display: 'block',
								font: `600 12.5px ${T.sans}`,
								color: T.ink,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{dmName}
						</span>
						<span
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-1-5)',
								marginTop: 'var(--space-0-5)',
								font: `11px ${T.sans}`,
								color: T.sub,
								minWidth: 0,
							}}
						>
							<StatusDot status={presence.dot} pulse={presence.dot === 'pending'} />
							<span style={{ minWidth: 0, overflowWrap: 'anywhere' }} title={presence.label}>
								{presence.label}
							</span>
						</span>
					</span>
					<Icon name="chevron-right" size={13} color={T.ter} />
				</button>
			</div>
			{vaultsOpen && (
				<Suspense fallback={<ShellLoading onClose={() => setVaultsOpen(false)} />}>
					<VaultSwitcher
						onClose={() => setVaultsOpen(false)}
						onChanged={() => setVault(readVault())}
					/>
				</Suspense>
			)}
		</aside>
	);
}
