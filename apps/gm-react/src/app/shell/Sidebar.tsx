import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	getContentItemsForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
	type SceneListEntry,
} from '@dndtools/core';
import { Avatar, BrandLockup, Icon, IconButton, StatusDot } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	LIBRARY,
	PLATFORM,
	PLAYER_SECTION,
	RUN,
	SETTINGS_SECTION,
	activeSectionId,
	type NavSection,
} from '../nav';
import { T } from '../screen-kit';
import { SECTION_PATH } from './sections';
import { SceneSideRow, SideGroup, SideRow, sceneStatus, usePresenceStatus } from './rows';

/* Desktop (≥1025px): the 264px sidebar — brand · campaign chip · Run the table / Scenes / Library /
 * Platform / Recent · player + settings + DM account. Extracted from AppShell.tsx unchanged
 * (RC-STB-2.6). */

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const active = activeSectionId(location.pathname);
	const go = (id: string) => navigate(SECTION_PATH[id] ?? '/');

	const activeSceneId = runtime.state.session.activeSceneId;
	const dmActor = runtime.state.permissions.actors[actorId];
	const presence = usePresenceStatus();
	const { t } = useI18n();

	const { scenes, counts, recent } = useMemo(() => {
		// The GM Screen's backing home scene is reachable via its own nav row — listing it among the
		// table scenes (as a scene literally named "Command Center") only reads as a mystery scene.
		const homeSceneId = runtime.state.commandCenter.homeSceneId;
		const allScenes = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			actorId,
		).filter((s) => !s.isTemplate && s.id !== homeSceneId);
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
		// Count what each screen actually lists: Notes shows kind==='note' only; Story's tabs surface
		// those notes as threads plus the faction dossiers (a raw item count here once claimed
		// "9 notes" while the Notes screen showed 6).
		const noteCount = items.filter((n) => n.kind === 'note').length;
		const factionCount = items.filter(
			(n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction',
		).length;
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
				campaign: t('shell.countStory', { threads: noteCount, factions: factionCount }),
				knowledge: t('shell.countNotes', { count: noteCount }),
			} as Record<string, string>,
		};
	}, [runtime.state, actorId, activeSceneId, t]);

	const row = (s: NavSection, badge?: ReactNode) => (
		<SideRow
			key={s.id}
			icon={s.icon}
			label={t(s.labelKey)}
			sub={counts[s.id] ?? (s.subKey ? t(s.subKey) : undefined)}
			active={active === s.id}
			onClick={() => go(s.id)}
			badge={badge}
		/>
	);

	const [showAllScenes, setShowAllScenes] = useState(false);
	const [moreOpen, setMoreOpen] = useState(false);
	const visibleScenes = showAllScenes ? scenes : scenes.slice(0, 5);
	// Never hide the row you're ON: arriving at a platform section OPENS the group. It stays a real
	// disclosure though — OR-ing `platformActive` into the expanded flag made the toggle a no-op on
	// every platform route and pinned aria-expanded to true.
	const platformActive = PLATFORM.some((s) => s.id === active);
	useEffect(() => {
		if (platformActive) setMoreOpen(true);
	}, [platformActive]);
	const moreExpanded = moreOpen;
	// "Recent scenes" earns its keep only once the Scenes list truncates — below that it just
	// mirrors the same handful of scenes twice in one sidebar.
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
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px' }}>
				<BrandLockup markSize={30} wordSize={15} gap={10} style={{ flex: 1, minWidth: 0 }} />
				<IconButton
					icon="search"
					label={t('shell.searchShortcut')}
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			</div>

			{/* campaign chip — a "which campaign am I in" affordance; it goes HOME (the campaign hub),
			    not to the Story section (sending it there read as a broken campaign switcher). */}
			<button
				type="button"
				onClick={() => go('home')}
				style={{
					margin: '0 12px 4px',
					padding: '9px 11px',
					display: 'flex',
					alignItems: 'center',
					gap: 9,
					background: T.alt,
					border: `1px solid ${T.bd}`,
					borderRadius: 9,
					cursor: 'pointer',
					textAlign: 'left',
				}}
			>
				<Icon name="campaign-scroll" size="sm" color={T.acc} />
				<span style={{ flex: 1, minWidth: 0 }}>
					<span style={{ display: 'block', font: `600 12.5px ${T.sans}`, color: T.ink }}>
						{t('shell.yourCampaign')}
					</span>
					<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>
						{t('shell.campaignCounts', {
							scenes: scenes.length,
							characters: counts.characters,
						})}
					</span>
				</span>
				{/* chevron-right = "this navigates"; chevron-down here implied a dropdown that never opened */}
				<Icon name="chevron-right" size={13} color={T.ter} />
			</button>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: 'auto',
					overflowX: 'hidden',
					padding: '4px 12px 16px',
				}}
			>
				<nav role="navigation" aria-label={t('shell.navPrimary')}>
					<SideGroup label={t('shell.groupRunTable')}>
						{RUN.map((s) =>
							row(
								s,
								s.id === 'session' && activeSceneId ? (
									<span
										style={{
											font: `700 9px ${T.sans}`,
											letterSpacing: '.08em',
											color: T.ok,
											background: 'var(--color-status-success-subtle)',
											padding: '2px 6px',
											borderRadius: 20,
										}}
									>
										{t('shell.live')}
									</span>
								) : null,
							),
						)}
					</SideGroup>

					<SideGroup
						label={t('shell.groupScenes')}
						action={
							<IconButton
								icon="add"
								label={t('shell.newScene')}
								variant="ghost"
								size="sm"
								onClick={() => navigate('/scenes')}
							/>
						}
					>
						{visibleScenes.length === 0 && (
							<div style={{ padding: '6px 10px', font: `11.5px ${T.sans}`, color: T.ter }}>
								{t('shell.noScenes')}
							</div>
						)}
						{visibleScenes.map((s) => {
							const status = sceneStatus(s, activeSceneId);
							return (
								<SceneSideRow
									key={s.id}
									scene={s}
									status={status}
									active={location.pathname === `/scene/${s.id}`}
									onOpen={() => navigate(`/scene/${s.id}`)}
								/>
							);
						})}
						{scenes.length > 5 && (
							<button
								type="button"
								onClick={() => setShowAllScenes((v) => !v)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									width: '100%',
									padding: '7px 10px',
									border: 'none',
									borderRadius: 8,
									cursor: 'pointer',
									background: 'transparent',
									color: T.ter,
									font: `12px ${T.sans}`,
								}}
							>
								<Icon
									name={showAllScenes ? 'chevron-up' : 'chevron-down'}
									size={14}
									color={T.ter}
								/>
								{showAllScenes
									? t('shell.showFewer')
									: t('shell.allScenes', { count: scenes.length })}
							</button>
						)}
					</SideGroup>

					<SideGroup label={t('shell.groupLibrary')}>{LIBRARY.map((s) => row(s))}</SideGroup>

					{/* The whole header is the toggle — a label-plus-tiny-chevron where only the chevron
					    worked made the group look empty and unclickable. */}
					<div style={{ marginTop: 14 }}>
						<button
							type="button"
							aria-expanded={moreExpanded}
							aria-controls="nav-more-panel"
							onClick={() => setMoreOpen((v) => !v)}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								width: '100%',
								padding: '4px 10px 6px',
								border: 'none',
								background: 'transparent',
								cursor: 'pointer',
								borderRadius: 8,
							}}
						>
							<span
								style={{
									font: `600 11px ${T.sans}`,
									letterSpacing: '.09em',
									textTransform: 'uppercase',
									color: T.ter,
								}}
							>
								{t('shell.groupMore')}
							</span>
							<Icon name={moreExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={T.ter} />
						</button>
						{moreExpanded && (
							<div id="nav-more-panel" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
								{PLATFORM.map((s) => row(s))}
							</div>
						)}
					</div>
				</nav>

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

			{/* footer: player view + settings + account */}
			<div style={{ borderTop: `1px solid ${T.bd}`, padding: '10px 12px' }}>
				<nav aria-label={t('shell.navSettings')}>
					<SideRow
						icon={PLAYER_SECTION.icon}
						label={t(PLAYER_SECTION.labelKey)}
						sub={PLAYER_SECTION.subKey ? t(PLAYER_SECTION.subKey) : undefined}
						active={active === 'player'}
						onClick={() => go('player')}
					/>
					<SideRow
						icon={SETTINGS_SECTION.icon}
						label={t(SETTINGS_SECTION.labelKey)}
						active={active === 'settings'}
						onClick={() => go('settings')}
					/>
				</nav>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 4px' }}>
					<Avatar
						name={dmActor?.displayName ?? t('session.roster.role.dm')}
						size="sm"
						ring="active"
					/>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ font: `600 12.5px ${T.sans}` }}>
							{dmActor?.displayName ?? t('session.roster.role.dm')}
						</div>
						<div
							style={{
								font: `10.5px ${T.sans}`,
								color: T.ter,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
							title={presence.label}
						>
							{t('shell.dmPresence', { presence: presence.label })}
						</div>
					</div>
					<StatusDot
						status={presence.dot}
						label={presence.label}
						pulse={presence.dot === 'pending'}
					/>
				</div>
			</div>
		</aside>
	);
}
