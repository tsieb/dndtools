import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	getContentItemsForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
	type SceneListEntry,
} from '@dndtools/core';
import {
	Avatar,
	BottomTabBar,
	Icon,
	IconButton,
	NavRail,
	Sheet,
	StatusDot,
	Toaster,
	ToastViewport,
} from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { useCloudSync } from '../cloud/CloudSyncContext';
import { useSession } from '../net/SessionContext';
import { CommandPalette } from './CommandPalette';
import { ViewAsControl } from './ViewAsControl';
import { ProjectionControl } from './ProjectionControl';
import { HostSessionButton, AccountButton } from '../net/SessionPanel';
import { useCompactTopBar, useViewport } from './useViewport';
import {
	LIBRARY,
	PLATFORM,
	PLAYER_SECTION,
	RUN,
	SETTINGS_SECTION,
	activeSectionId,
	sectionLabel,
	sectionSubtitle,
	type NavSection,
} from './nav';
import { T } from './screen-kit';
import { SceneDisplayOverlay, useSceneDisplayBroadcast } from './SceneDisplayOverlay';
import { getSceneDisplayForActor } from '@dndtools/core';

/**
 * AppShell — the React port of the online prototype's shell (app.jsx Sidebar + Topbar): a 264px
 * sidebar (brand · campaign chip · Run the table / Scenes / Library / Platform / Recent · player +
 * settings + DM account) beside a calm top bar (title, ⌘K search, view-as + projection).
 *
 * Everything is wired to the live Processing Core through `useRuntime()`: the Scenes list, library
 * counts, and the DM account come from the real actor-filtered read model, scene rows open the real
 * `/scene/:id` editor, and the topbar carries the working command palette, "view as" actor switch,
 * and projection control. A single ToastViewport is mounted here so any screen's `Toaster.*` call
 * surfaces a confirmation.
 */

const SECTION_PATH: Record<string, string> = {
	home: '/',
	board: '/board',
	session: '/session',
	characters: '/characters',
	atlas: '/atlas',
	campaign: '/campaign',
	knowledge: '/knowledge',
	graph: '/graph',
	audio: '/audio',
	extensibility: '/extensions',
	community: '/community',
	pricing: '/upgrade',
	player: '/player',
	settings: '/settings',
};

/* ── Responsive breakpoints (UX nav-profiles): ≥1025px the full sidebar, 641–1024px the icon
 * NavRail (same IA, presentation change only), ≤640px a BottomTabBar of the hot destinations
 * plus a "More" sheet. The matchMedia hook lives in ./useViewport (shared with detail screens). */

type SceneStatus = 'live' | 'ready' | 'draft';
const SCENE_STATUS: Record<SceneStatus, { dot: 'live' | 'idle' | 'off'; label: string }> = {
	live: { dot: 'live', label: 'Live' },
	ready: { dot: 'idle', label: 'Ready' },
	draft: { dot: 'off', label: 'Draft' },
};

function sceneStatus(scene: SceneListEntry, activeSceneId: string | null): SceneStatus {
	if (scene.id === activeSceneId) return 'live';
	return scene.visibility === 'dm-only' ? 'draft' : 'ready';
}

/**
 * A scene row in the sidebar Scenes library: a status indicator (lock for drafts, pulsing dot when
 * live) + name / status line. Clicking opens the real `/scene/:id` canvas editor.
 */
function SceneSideRow({
	scene,
	status,
	active,
	onOpen,
}: {
	scene: SceneListEntry;
	status: SceneStatus;
	active?: boolean;
	onOpen: () => void;
}) {
	const [hov, setHov] = useState(false);
	const st = SCENE_STATUS[status];
	const sub = scene.tags[0] ? `${st.label} · ${scene.tags[0]}` : st.label;
	return (
		<div
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			style={{ position: 'relative' }}
		>
			<button
				type="button"
				onClick={onOpen}
				aria-current={active ? 'page' : undefined}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					width: '100%',
					padding: '7px 10px',
					border: 'none',
					borderRadius: 8,
					cursor: 'pointer',
					textAlign: 'left',
					position: 'relative',
					background: active ? T.accSub : hov ? T.hover : 'transparent',
					transition: 'background var(--duration-fast) var(--easing-standard)',
				}}
			>
				{active && (
					<span
						style={{
							position: 'absolute',
							left: -6,
							top: 7,
							bottom: 7,
							width: 3,
							borderRadius: 3,
							background: T.acc,
						}}
					/>
				)}
				<span style={{ flex: '0 0 auto', display: 'inline-flex' }}>
					{status === 'draft' ? (
						<Icon name="lock" size={14} color={T.ter} />
					) : (
						<StatusDot status={st.dot === 'off' ? 'idle' : st.dot} pulse={status === 'live'} />
					)}
				</span>
				<span style={{ flex: 1, minWidth: 0 }}>
					<span
						style={{
							display: 'block',
							font: `${active ? 600 : 500} 13px ${T.sans}`,
							color: active ? T.acc : T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{scene.name}
					</span>
					<span
						style={{
							display: 'block',
							font: `10.5px ${T.sans}`,
							color: T.ter,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{sub}
					</span>
				</span>
			</button>
		</div>
	);
}

function SideRow({
	icon,
	label,
	sub,
	active,
	badge,
	onClick,
	color,
	right,
}: {
	icon: string;
	label: ReactNode;
	sub?: ReactNode;
	active?: boolean;
	badge?: ReactNode;
	onClick: () => void;
	color?: string;
	right?: ReactNode;
}) {
	const [hov, setHov] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHov(true)}
			onMouseLeave={() => setHov(false)}
			aria-current={active ? 'page' : undefined}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				width: '100%',
				padding: '8px 10px',
				border: 'none',
				borderRadius: 8,
				cursor: 'pointer',
				textAlign: 'left',
				position: 'relative',
				background: active ? T.accSub : hov ? T.hover : 'transparent',
				color: active ? T.acc : T.sub,
				transition:
					'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
			}}
		>
			{active && (
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
			<Icon name={icon} size="sm" color={active ? T.acc : color || 'currentColor'} />
			<span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
				<span
					style={{
						display: 'block',
						font: `${active ? 600 : 500} 13.5px ${T.sans}`,
						color: active ? T.acc : T.ink,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{label}
				</span>
				{sub && (
					<span
						style={{
							display: 'block',
							font: `11px ${T.sans}`,
							color: T.ter,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{sub}
					</span>
				)}
			</span>
			{badge}
			{right}
		</button>
	);
}

/**
 * The DM-footer presence dot — REAL state, not a hardcoded "Online": the live P2P session role wins
 * (hosting / joined), then the cloud-backup engine (error / backing up / current), else the honest
 * local-only baseline. The label doubles as the row's status caption.
 */
function usePresenceStatus(): { dot: 'live' | 'idle' | 'error' | 'pending'; label: string } {
	const session = useSession();
	const cloud = useCloudSync();
	if (session.role === 'host') {
		const n = session.peers.length;
		return {
			dot: 'live',
			label:
				n > 0
					? `Hosting — ${n} ${n === 1 ? 'player' : 'players'} connected`
					: 'Hosting — waiting for players',
		};
	}
	if (session.role === 'joined') return { dot: 'live', label: 'Connected to a table' };
	if (cloud.available && cloud.enabled) {
		const es = cloud.engineStatus;
		if (es?.lastError)
			return { dot: 'error', label: 'Cloud backup error — see Settings → Backup & history' };
		if (es?.busy) return { dot: 'pending', label: 'Backing up…' };
		return {
			dot: 'live',
			label: es?.lastSyncedAt ? 'Cloud backup up to date' : 'Cloud backup on',
		};
	}
	return { dot: 'idle', label: 'Local-only — this device' };
}

function SideGroup({
	label,
	action,
	children,
}: {
	label: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	const eb: CSSProperties = {
		font: `600 11px ${T.sans}`,
		letterSpacing: '.09em',
		textTransform: 'uppercase',
		color: T.ter,
	};
	return (
		<div style={{ marginTop: 14 }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '0 10px 6px',
				}}
			>
				<span style={eb}>{label}</span>
				{action}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</div>
		</div>
	);
}

function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const active = activeSectionId(location.pathname);
	const go = (id: string) => navigate(SECTION_PATH[id] ?? '/');

	const activeSceneId = runtime.state.session.activeSceneId;
	const dmActor = runtime.state.permissions.actors[actorId];
	const presence = usePresenceStatus();

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
				characters: `${pcCount} PCs · ${npcCount} NPCs`,
				atlas: `${maps.length} ${maps.length === 1 ? 'map' : 'maps'}`,
				campaign: `${noteCount} ${noteCount === 1 ? 'thread' : 'threads'} · ${factionCount} ${factionCount === 1 ? 'faction' : 'factions'}`,
				knowledge: `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`,
			} as Record<string, string>,
		};
	}, [runtime.state, actorId, activeSceneId]);

	const row = (s: NavSection, badge?: ReactNode) => (
		<SideRow
			key={s.id}
			icon={s.icon}
			label={s.label}
			sub={counts[s.id] ?? s.sub}
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
				<span
					style={{
						width: 30,
						height: 30,
						borderRadius: 7,
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxShadow: T.ssm,
					}}
				>
					<Icon name="dice" size="sm" />
				</span>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ font: `700 15px ${T.disp}`, letterSpacing: '.02em' }}>
						DND <span style={{ color: T.acc }}>Tools</span>
					</div>
				</div>
				<IconButton
					icon="search"
					label="Search (⌘K)"
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
						Your campaign
					</span>
					<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>
						{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {counts.characters}
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
				<nav role="navigation" aria-label="Primary">
					<SideGroup label="Run the table">
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
										LIVE
									</span>
								) : null,
							),
						)}
					</SideGroup>

					<SideGroup
						label="Scenes"
						action={
							<IconButton
								icon="add"
								label="New scene"
								variant="ghost"
								size="sm"
								onClick={() => navigate('/scenes')}
							/>
						}
					>
						{visibleScenes.length === 0 && (
							<div style={{ padding: '6px 10px', font: `11.5px ${T.sans}`, color: T.ter }}>
								No scenes yet.
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
								{showAllScenes ? 'Show fewer' : `All scenes (${scenes.length})`}
							</button>
						)}
					</SideGroup>

					<SideGroup label="Library">{LIBRARY.map((s) => row(s))}</SideGroup>

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
								More · audio, graph &amp; extensions
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
					<nav aria-label="Shortcuts">
						<SideGroup label="Recent scenes">
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
				<nav aria-label="Settings">
					<SideRow
						icon={PLAYER_SECTION.icon}
						label={PLAYER_SECTION.label}
						sub={PLAYER_SECTION.sub}
						active={active === 'player'}
						onClick={() => go('player')}
					/>
					<SideRow
						icon={SETTINGS_SECTION.icon}
						label={SETTINGS_SECTION.label}
						active={active === 'settings'}
						onClick={() => go('settings')}
					/>
				</nav>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 4px' }}>
					<Avatar name={dmActor?.displayName ?? 'DM'} size="sm" ring="active" />
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ font: `600 12.5px ${T.sans}` }}>{dmActor?.displayName ?? 'DM'}</div>
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
							Dungeon Master · {presence.label}
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

/** All sections in rail order — the same IA as the sidebar, flattened (a presentation change,
 * never an IA change). */
const ALL_SECTIONS: NavSection[] = [
	...RUN,
	...LIBRARY,
	...PLATFORM,
	PLAYER_SECTION,
	SETTINGS_SECTION,
];

/** Tablet: the DS NavRail — icon-only, labels move to the accessible name/tooltip. */
function RailNav({ onOpenPalette }: { onOpenPalette: () => void }) {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const active = activeSectionId(location.pathname);
	const liveDot = runtime.state.session.activeSceneId != null;
	return (
		<NavRail
			width={64}
			style={{
				width: 'calc(64px + var(--safe-area-left, 0px))',
				padding:
					'calc(var(--space-2) + var(--safe-area-top, 0px)) var(--space-2) calc(var(--space-2) + var(--safe-area-bottom, 0px)) calc(var(--space-2) + var(--safe-area-left, 0px))',
			}}
			items={ALL_SECTIONS.map((s) => ({
				key: s.id,
				icon: s.icon,
				label: s.label,
				badge: s.id === 'session' && liveDot ? '•' : undefined,
			}))}
			active={active}
			onSelect={(id: string) => navigate(SECTION_PATH[id] ?? '/')}
			header={
				<span
					style={{
						width: 30,
						height: 30,
						borderRadius: 7,
						background: T.acc,
						color: T.accFg,
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxShadow: T.ssm,
					}}
				>
					<Icon name="dice" size="sm" />
				</span>
			}
			footer={
				<IconButton
					icon="search"
					label="Search (⌘K)"
					variant="ghost"
					size="sm"
					onClick={onOpenPalette}
				/>
			}
		/>
	);
}

/** Phone: the 4 hot destinations + "More" (a bottom sheet listing the rest of the IA). */
const PHONE_TABS: NavSection[] = [RUN[0], RUN[2], LIBRARY[0], LIBRARY[1]];

function PhoneNav() {
	const navigate = useNavigate();
	const location = useLocation();
	const runtime = useRuntime();
	const [moreOpen, setMoreOpen] = useState(false);
	const active = activeSectionId(location.pathname);
	const hotIds = new Set(PHONE_TABS.map((s) => s.id));
	const liveDot = runtime.state.session.activeSceneId != null;
	const rest = ALL_SECTIONS.filter((s) => !hotIds.has(s.id));
	return (
		<>
			<BottomTabBar
				items={[
					...PHONE_TABS.map((s) => ({
						key: s.id,
						icon: s.icon,
						label: s.id === 'home' ? 'Home' : s.label,
						badge: s.id === 'session' && liveDot ? '•' : undefined,
					})),
					{ key: 'more', icon: 'chevron-up', label: 'More' },
				]}
				active={hotIds.has(active) ? active : 'more'}
				onSelect={(id: string) => {
					if (id === 'more') {
						setMoreOpen(true);
						return;
					}
					navigate(SECTION_PATH[id] ?? '/');
				}}
			/>
			<Sheet open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom" title="All sections">
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'minmax(0,1fr)',
						gap: 4,
						paddingBottom: 8,
					}}
				>
					{rest.map((s) => (
						<SideRow
							key={s.id}
							icon={s.icon}
							label={s.label}
							sub={s.sub}
							active={active === s.id}
							onClick={() => {
								setMoreOpen(false);
								navigate(SECTION_PATH[s.id] ?? '/');
							}}
						/>
					))}
				</div>
			</Sheet>
		</>
	);
}

function TopBar({
	onOpenPalette,
	viewport,
	compactToolbar,
}: {
	onOpenPalette: () => void;
	viewport: ReturnType<typeof useViewport>;
	compactToolbar: boolean;
}) {
	const location = useLocation();
	const [controlsOpen, setControlsOpen] = useState(false);
	const id = activeSectionId(location.pathname);
	const title = sectionLabel(id);
	const sub = sectionSubtitle(id);
	const compact = viewport !== 'desktop' || compactToolbar;
	return (
		<>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: compact ? 6 : 14,
					padding:
						viewport === 'phone'
							? 'calc(10px + var(--safe-area-top, 0px)) max(12px, var(--safe-area-right, 0px)) 10px max(12px, var(--safe-area-left, 0px))'
							: compact
								? 'calc(11px + var(--safe-area-top, 0px)) max(16px, var(--safe-area-right, 0px)) 11px 16px'
								: 'calc(13px + var(--safe-area-top, 0px)) max(24px, var(--safe-area-right, 0px)) 13px 24px',
					borderBottom: `1px solid ${T.bd}`,
					background: 'color-mix(in srgb, var(--color-bg) 86%, transparent)',
					backdropFilter: 'blur(6px)',
					flex: '0 0 auto',
				}}
			>
				<div style={{ minWidth: 0, flex: '1 1 auto' }}>
					<h1
						style={{
							margin: 0,
							font: `700 ${viewport === 'phone' ? 17 : 21}px ${T.disp}`,
							letterSpacing: '-.01em',
							lineHeight: 1.15,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{title}
					</h1>
					{!compact && (
						<div
							style={{
								font: `12.5px ${T.sans}`,
								color: T.ter,
								marginTop: 1,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							{sub}
						</div>
					)}
				</div>
				{compact ? (
					<IconButton
						icon="search"
						label="Search"
						variant="outline"
						size="lg"
						onClick={onOpenPalette}
					/>
				) : (
					<button
						type="button"
						onClick={onOpenPalette}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '8px 12px',
							flex: '1 1 150px',
							minWidth: 46,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							borderRadius: 9,
							cursor: 'pointer',
							color: T.ter,
						}}
					>
						<Icon name="search" size="sm" />
						<span
							style={{
								flex: 1,
								textAlign: 'left',
								font: `13px ${T.sans}`,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							Search everything…
						</span>
						<span
							style={{
								font: `11px ${T.mono}`,
								color: T.ter,
								border: `1px solid ${T.bd}`,
								borderRadius: 5,
								padding: '1px 5px',
							}}
						>
							⌘K
						</span>
					</button>
				)}
				{viewport === 'phone' ? (
					<IconButton
						icon="session-bolt"
						label="Table controls"
						variant="outline"
						size="lg"
						onClick={() => setControlsOpen(true)}
					/>
				) : (
					<>
						<HostSessionButton compact />
						<ViewAsControl compact />
						<ProjectionControl compact />
						<AccountButton compact />
					</>
				)}
			</header>
			{viewport === 'phone' && (
				<Sheet
					open={controlsOpen}
					onClose={() => setControlsOpen(false)}
					side="bottom"
					title="Table controls"
				>
					<div
						className="table-controls-sheet"
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 10,
							paddingBottom: 8,
						}}
					>
						<HostSessionButton />
						<ViewAsControl />
						<ProjectionControl />
						<AccountButton />
					</div>
				</Sheet>
			)}
		</>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const [paletteOpen, setPaletteOpen] = useState(false);
	// I11 S11.2.2 — the in-window fullscreen scene display (Ctrl+Shift+S toggles; Escape exits).
	const [displayOpen, setDisplayOpen] = useState(false);
	const viewport = useViewport();
	const compactToolbar = useCompactTopBar();
	const runtime = useRuntime();
	// I11 S11.2.2 — keep any open second-screen window live with the DM window's edits.
	useSceneDisplayBroadcast(runtime);
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
			// The palette is itself `aria-modal`, so the overlay guard below used to swallow the very
			// keystroke that should dismiss it — Cmd/Ctrl+K could open the palette but never close it.
			// Handle the closing direction first, before the guard sees the palette as "some overlay".
			if (cmdK && paletteOpen) {
				e.preventDefault();
				setPaletteOpen(false);
				return;
			}
			// A full-screen editor overlay (e.g. the map editor) owns the keyboard while open and provides
			// its own command palette / shortcuts; don't double-fire the global shortcuts beneath it.
			if (
				document.querySelector(
					'[data-fullscreen-overlay], [aria-modal="true"]:not([data-scene-display-overlay])',
				)
			)
				return;
			if (cmdK) {
				e.preventDefault();
				setPaletteOpen(true);
				return;
			}
			// Ctrl/Cmd+Right is the OS "move by word" binding and Ctrl+Shift+S is a common save-as, so
			// firing them while the DM is typing (a handout body, a note, a scene name) hijacks the
			// caret and silently advances the players' queue. ⌘K stays deliberately global.
			const el = e.target as HTMLElement | null;
			const typing =
				!!el &&
				(el.tagName === 'INPUT' ||
					el.tagName === 'TEXTAREA' ||
					el.tagName === 'SELECT' ||
					el.isContentEditable);
			// I11 S11.2.2 — Ctrl/Cmd+Shift+S enters/exits the fullscreen scene display.
			if (!typing && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
				e.preventDefault();
				setDisplayOpen((v) => !v);
				return;
			}
			// I11 S11.2.3 — Ctrl/Cmd+Right advances the scene queue during play (only when a card is queued).
			if (!typing && (e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
				const display = getSceneDisplayForActor(
					runtime.state.session,
					runtime.state.permissions,
					runtime.defaultActorId,
				);
				if (display.queuedCount > 0) {
					e.preventDefault();
					// The visible effect of this shortcut happens on the PLAYER display — a second
					// screen the DM may not be looking at — so a bare `void dispatch` made "worked",
					// "refused" and "storage is full" completely indistinguishable. (`dispatchNow`
					// also rethrows a persist failure, which was landing as an unhandled rejection.)
					void (async () => {
						try {
							const result = await runtime.dispatch({
								type: 'scene-card.advance',
								actorId: runtime.defaultActorId,
								payload: {},
							});
							if (result.status === 'rejected') Toaster.error("That card couldn't be shown.");
							else Toaster.success('Showing the next card.');
						} catch {
							Toaster.error("That change couldn't be saved to this device.");
						}
					})();
				}
				return;
			}
			// Exit the fullscreen display on Escape. `preventDefault` has to happen HERE, while the
			// event is still being dispatched — calling it inside the setState updater ran it on the
			// next render, long after the browser had already taken its default action.
			if (e.key === 'Escape' && displayOpen) {
				e.preventDefault();
				setDisplayOpen(false);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [runtime, displayOpen, paletteOpen]);
	return (
		<div
			className="app-shell"
			style={{
				display: 'flex',
				height: '100%',
				position: 'relative',
				overflow: 'hidden',
				background: T.bg,
				backgroundImage:
					'radial-gradient(1200px 620px at 50% -240px, var(--color-accent-subtle), transparent 70%)',
			}}
		>
			<a
				href="#main-content"
				// Declares "I am a skip link parked off-viewport until focused" to the responsive
				// clipped-control audit (tests/e2e/responsive.spec.ts), which would otherwise read the
				// resting position as clipping. /play carries the same marker on its own skip link.
				data-skip-link="true"
				// The app is a HashRouter, so the hash IS the route. Letting the browser follow this
				// href rewrites `#/session` to `#main-content`, desyncing the URL from the rendered
				// screen and sending a reload to the catch-all route. Move focus ourselves instead;
				// `<main>` already carries tabIndex={-1} to receive it.
				onClick={(e) => {
					e.preventDefault();
					document.getElementById('main-content')?.focus();
				}}
				style={{
					position: 'fixed',
					left: 8,
					top: 'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) - 48px)',
					zIndex: 100,
					padding: '8px 14px',
					borderRadius: 8,
					background: 'var(--color-accent)',
					color: 'var(--color-accent-foreground)',
					font: '600 13px var(--font-sans)',
					textDecoration: 'none',
					transition: 'top var(--duration-fast) var(--easing-standard)',
				}}
				onFocus={(e) =>
					(e.currentTarget.style.top =
						'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) + 8px)')
				}
				onBlur={(e) =>
					(e.currentTarget.style.top =
						'calc(var(--native-titlebar-height) + var(--safe-area-top, 0px) - 48px)')
				}
			>
				Skip to content
			</a>
			{viewport === 'desktop' && <Sidebar onOpenPalette={() => setPaletteOpen(true)} />}
			{viewport === 'rail' && <RailNav onOpenPalette={() => setPaletteOpen(true)} />}
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<TopBar
					onOpenPalette={() => setPaletteOpen(true)}
					viewport={viewport}
					compactToolbar={compactToolbar}
				/>
				<main
					id="main-content"
					tabIndex={-1}
					style={{
						flex: 1,
						// A flex child defaults to `min-height: auto`, which can make its contents grow
						// behind the phone navigation rather than becoming the shell's scroll region.
						// This is the shell contract: one bounded, independently scrollable main pane.
						minHeight: 0,
						overflowY: 'auto',
						overflowX: 'hidden',
						overscrollBehavior: 'contain',
						WebkitOverflowScrolling: 'touch',
						// NO `outline: 'none'` here. An inline style beats the stylesheet, so it silently
						// killed the global `:focus-visible` ring — and this element is the skip link's
						// destination, so activating "Skip to content" confirmed nothing at all. The ring
						// is drawn INSIDE the pane (the global +2px offset would land outside a
						// viewport-filling box and never paint).
						outlineOffset: '-3px',
						boxSizing: 'border-box',
						paddingLeft: viewport === 'phone' ? 'var(--safe-area-left, 0px)' : 0,
						paddingRight: 'var(--safe-area-right, 0px)',
					}}
				>
					{children}
				</main>
				{viewport === 'phone' && <PhoneNav />}
			</div>
			<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
			<SceneDisplayOverlay open={displayOpen} onClose={() => setDisplayOpen(false)} />
			{/* On phone the tab bar owns the bottom edge (52px buttons + --space-1 padding + 1px
			    border) PLUS the bottom safe area, which the bar also pads for — omitting it here put
			    toasts on top of the primary nav on any device with a home indicator. */}
			<ToastViewport
				placement="bottom-right"
				data-testid="app-toast-viewport"
				style={
					viewport === 'phone'
						? {
								bottom: 'calc(52px + 2 * var(--space-1) + 1px + var(--safe-area-bottom, 0px))',
							}
						: undefined
				}
			/>
		</div>
	);
}
