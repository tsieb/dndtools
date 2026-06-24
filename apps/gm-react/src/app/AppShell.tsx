import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	listScenesForActor,
	listCharactersForActor,
	listMapsForActor,
	getContentItemsForActor,
	type SceneListEntry,
} from '@dndtools/core';
import { Avatar, Icon, IconButton, StatusDot, ToastViewport } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { CommandPalette } from './CommandPalette';
import { ViewAsControl } from './ViewAsControl';
import { ProjectionControl } from './ProjectionControl';
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
		<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ position: 'relative' }}>
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
				{active && <span style={{ position: 'absolute', left: -6, top: 7, bottom: 7, width: 3, borderRadius: 3, background: T.acc }} />}
				<span style={{ flex: '0 0 auto', display: 'inline-flex' }}>
					{status === 'draft' ? (
						<Icon name="lock" size={14} color={T.ter} />
					) : (
						<StatusDot status={st.dot === 'off' ? 'idle' : st.dot} pulse={status === 'live'} />
					)}
				</span>
				<span style={{ flex: 1, minWidth: 0 }}>
					<span style={{ display: 'block', font: `${active ? 600 : 500} 13px ${T.sans}`, color: active ? T.acc : T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scene.name}</span>
					<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
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
				transition: 'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
			}}
		>
			{active && (
				<span
					style={{ position: 'absolute', left: -6, top: 8, bottom: 8, width: 3, borderRadius: 3, background: T.acc }}
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

function SideGroup({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
	const eb: CSSProperties = {
		font: `600 11px ${T.sans}`,
		letterSpacing: '.09em',
		textTransform: 'uppercase',
		color: T.ter,
	};
	return (
		<div style={{ marginTop: 14 }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px 6px' }}>
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

	const { scenes, counts, recent } = useMemo(() => {
		const allScenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter(
			(s) => !s.isTemplate,
		);
		const characters = listCharactersForActor(runtime.state.characters, runtime.state.permissions, actorId);
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, actorId);
		const notes = getContentItemsForActor(runtime.state.content, runtime.state.permissions, actorId);
		const pcCount = characters.filter((c) => c.kind === 'pc').length;
		const npcCount = characters.length - pcCount;
		const ordered = [...allScenes].sort((a, b) => {
			const rank = (s: SceneListEntry) => (s.id === activeSceneId ? 0 : s.visibility === 'dm-only' ? 2 : 1);
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
				campaign: `${allScenes.length} scenes`,
				knowledge: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`,
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

	return (
		<aside
			style={{
				width: 264,
				flex: '0 0 264px',
				height: '100vh',
				display: 'flex',
				flexDirection: 'column',
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
						DND<span style={{ color: T.acc }}>Tools</span>
					</div>
				</div>
				<IconButton icon="search" label="Search (⌘K)" variant="ghost" size="sm" onClick={onOpenPalette} />
			</div>

			{/* campaign chip */}
			<button
				type="button"
				onClick={() => go('campaign')}
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
					<span style={{ display: 'block', font: `600 12.5px ${T.sans}`, color: T.ink }}>Your campaign</span>
					<span style={{ display: 'block', font: `10.5px ${T.sans}`, color: T.ter }}>{scenes.length} scenes · {counts.characters}</span>
				</span>
				<Icon name="chevron-down" size={13} color={T.ter} />
			</button>

			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '4px 12px 16px' }}>
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
						action={<IconButton icon="add" label="New scene" variant="ghost" size="sm" onClick={() => navigate('/scenes')} />}
					>
						{visibleScenes.length === 0 && (
							<div style={{ padding: '6px 10px', font: `11.5px ${T.sans}`, color: T.ter }}>No scenes yet.</div>
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
								style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: T.ter, font: `12px ${T.sans}` }}
							>
								<Icon name={showAllScenes ? 'chevron-up' : 'chevron-down'} size={14} color={T.ter} />
								{showAllScenes ? 'Show fewer' : `All scenes (${scenes.length})`}
							</button>
						)}
					</SideGroup>

					<SideGroup label="Library">{LIBRARY.map((s) => row(s))}</SideGroup>

					<SideGroup
						label="More"
						action={
							<IconButton
								icon={moreOpen ? 'chevron-up' : 'chevron-down'}
								label={moreOpen ? 'Collapse' : 'Expand'}
								variant="ghost"
								size="sm"
								onClick={() => setMoreOpen((v) => !v)}
							/>
						}
					>
						{moreOpen && PLATFORM.map((s) => row(s))}
					</SideGroup>
				</nav>

				{recent.length > 0 && (
					<nav aria-label="Shortcuts">
						<SideGroup label="Recent scenes">
							{recent.map((s) => (
								<SideRow key={s.id} icon="scene" label={s.name} onClick={() => navigate(`/scene/${s.id}`)} />
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
						<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>Dungeon Master</div>
					</div>
					<StatusDot status="live" label="Online" />
				</div>
			</div>
		</aside>
	);
}

function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
	const location = useLocation();
	const id = activeSectionId(location.pathname);
	const title = sectionLabel(id);
	const sub = sectionSubtitle(id);
	return (
		<header
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 14,
				padding: '13px 24px',
				borderBottom: `1px solid ${T.bd}`,
				background: 'color-mix(in srgb, var(--color-bg) 86%, transparent)',
				backdropFilter: 'blur(6px)',
				flex: '0 0 auto',
			}}
		>
			<div style={{ minWidth: 0, flex: '2 1 200px' }}>
				<h1
					style={{
						margin: 0,
						font: `700 21px ${T.disp}`,
						letterSpacing: '-.01em',
						lineHeight: 1.15,
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					}}
				>
					{title}
				</h1>
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
			</div>
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
				<span style={{ font: `11px ${T.mono}`, color: T.ter, border: `1px solid ${T.bd}`, borderRadius: 5, padding: '1px 5px' }}>
					⌘K
				</span>
			</button>
			<ViewAsControl />
			<ProjectionControl />
		</header>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	const [paletteOpen, setPaletteOpen] = useState(false);
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	return (
		<div
			style={{
				display: 'flex',
				height: '100vh',
				overflow: 'hidden',
				background: T.bg,
				backgroundImage: 'radial-gradient(1200px 620px at 50% -240px, var(--color-accent-subtle), transparent 70%)',
			}}
		>
			<a
				href="#main-content"
				style={{
					position: 'fixed',
					left: 8,
					top: -48,
					zIndex: 100,
					padding: '8px 14px',
					borderRadius: 8,
					background: 'var(--color-accent)',
					color: 'var(--color-accent-foreground)',
					font: '600 13px var(--font-sans)',
					textDecoration: 'none',
					transition: 'top var(--duration-fast) var(--easing-standard)',
				}}
				onFocus={(e) => (e.currentTarget.style.top = '8px')}
				onBlur={(e) => (e.currentTarget.style.top = '-48px')}
			>
				Skip to content
			</a>
			<Sidebar onOpenPalette={() => setPaletteOpen(true)} />
			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				<TopBar onOpenPalette={() => setPaletteOpen(true)} />
				<main id="main-content" tabIndex={-1} style={{ flex: 1, overflowY: 'auto', outline: 'none' }}>
					{children}
				</main>
			</div>
			<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
			<ToastViewport placement="bottom-right" />
		</div>
	);
}
