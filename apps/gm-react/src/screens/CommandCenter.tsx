import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	getContentItemsForActor,
	resolveCommandCenterHome,
	VAULT_OBJECT_SUBTYPE_KEY,
	type SceneListEntry,
} from '@dndtools/core';
import { Avatar, Badge, Button, Card, Icon, StatusDot } from '../ds';
import { Page, T, eb } from '../app/screen-kit';
import { LIBRARY } from '../app/nav';
import { useRuntime } from '../runtime/RuntimeContext';
import { useViewport } from '../app/useViewport';

/**
 * CommandCenter — the navigational hub (port of app.jsx HomeSection), wired to the live
 * Processing Core. The single Resume primary drops back into the live
 * scene, the Scenes board opens the real `/scene/:id` editor, Create launchers reach the real
 * sections, and every count comes from the actor-filtered read model. A player/observer device sees
 * only their own player-safe view (UX-CMD-012), never the DM hub.
 */

function HubLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				marginBottom: 11,
			}}
		>
			<span style={eb}>{children}</span>
			{action}
		</div>
	);
}

function statusOf(scene: SceneListEntry, activeSceneId: string | null): 'live' | 'ready' | 'draft' {
	if (scene.id === activeSceneId) return 'live';
	return scene.visibility === 'dm-only' ? 'draft' : 'ready';
}

function SceneTile({
	scene,
	status,
	widgetCount,
	onOpen,
}: {
	scene: SceneListEntry;
	status: 'live' | 'ready' | 'draft';
	widgetCount: number;
	onOpen: () => void;
}) {
	const live = status === 'live';
	const [h, setH] = useState(false);
	return (
		<button
			type="button"
			onClick={onOpen}
			onMouseEnter={() => setH(true)}
			onMouseLeave={() => setH(false)}
			style={{
				textAlign: 'left',
				padding: 0,
				border: `1px solid ${live || h ? T.accBd : T.bd}`,
				borderRadius: 11,
				overflow: 'hidden',
				background: h ? T.alt : T.surf,
				boxShadow: h ? T.ssm : 'none',
				cursor: 'pointer',
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard)',
			}}
		>
			<div
				style={{
					position: 'relative',
					height: 96,
					background: 'linear-gradient(135deg,var(--color-surface-raised),var(--color-bg))',
				}}
			>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						backgroundImage:
							'linear-gradient(var(--map-grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--map-grid-line) 1px,transparent 1px)',
						backgroundSize: '20px 20px',
					}}
				/>
				<div style={{ position: 'absolute', top: 9, right: 9 }}>
					{live ? (
						<Badge status="success" icon="visibility-players">
							Live
						</Badge>
					) : status === 'ready' ? (
						<Badge status="info">Ready</Badge>
					) : (
						<Badge status="neutral">Draft</Badge>
					)}
				</div>
				{status === 'draft' && (
					<div style={{ position: 'absolute', top: 9, left: 9, color: T.ter }}>
						<Icon name="lock" size="sm" label="Draft — not visible to players" />
					</div>
				)}
			</div>
			<div style={{ padding: '10px 13px' }}>
				<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{scene.name}</div>
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					{scene.tags[0] ?? 'Scene'} · {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'}
				</div>
			</div>
		</button>
	);
}

function LaunchTile({
	icon,
	label,
	sub,
	onClick,
}: {
	icon: string;
	label: string;
	sub?: string;
	onClick: () => void;
}) {
	const [h, setH] = useState(false);
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setH(true)}
			onMouseLeave={() => setH(false)}
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'flex-start',
				gap: 9,
				padding: 14,
				borderRadius: 11,
				cursor: 'pointer',
				textAlign: 'left',
				border: `1px solid ${h ? T.accBd : T.bd}`,
				background: h ? T.accSub : T.surf,
				transition:
					'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<span
				style={{
					width: 34,
					height: 34,
					borderRadius: 9,
					background: T.surf,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					color: T.acc,
				}}
			>
				<Icon name={icon} size="md" />
			</span>
			<span style={{ minWidth: 0 }}>
				<span style={{ display: 'block', font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{label}
				</span>
				{sub && (
					<span style={{ display: 'block', font: `11px ${T.sans}`, color: T.ter, marginTop: 2 }}>
						{sub}
					</span>
				)}
			</span>
		</button>
	);
}

export function CommandCenter() {
	const navigate = useNavigate();
	const runtime = useRuntime();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;

	const data = useMemo(() => {
		const homeView = resolveCommandCenterHome(runtime.state, actorId, {
			widgetPackages: runtime.state.widgets,
		});
		const homeSceneId = runtime.state.commandCenter.homeSceneId;
		// The GM Screen's backing scene (named "Command Center") is not a table scene — keep it out
		// of the Scenes board (it has its own nav destination).
		const allScenes = listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId);
		const scenes = allScenes.filter((s) => !s.isTemplate && s.id !== homeSceneId);
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
		const notes = items.filter((n) => n.kind === 'note');
		const factionCount = items.filter(
			(n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'faction',
		).length;
		// The Campaign "Threads" tab lists real quest Vault Objects now — count those, not notes.
		const questCount = items.filter(
			(n) => n.kind === 'object' && n.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'quest',
		).length;
		const activeSceneId = runtime.state.session.activeSceneId;
		const workflow = runtime.state.session.workflow;
		// Resolved against the UNFILTERED list on purpose. `Session`'s "Go live" falls back to the GM
		// Screen's own home scene when nothing else is active, and that scene is deliberately excluded
		// from `scenes` — so looking it up there always missed, the old `scenes.find(id === homeSceneId)`
		// line was dead by construction, and the hero card fell through to `scenes[0]`: it announced
		// "Session live" over an UNRELATED scene's name and "Enter scene" navigated there. With no other
		// scene at all it resolved to null, disabling the hub's only primary CTA while still claiming a
		// live session.
		const liveScene = allScenes.find((s) => s.id === activeSceneId) ?? scenes[0] ?? null;
		// The GM Screen has its own route; `/scene/<homeSceneId>` is not where that scene is edited.
		const liveSceneIsHome = liveScene !== null && liveScene.id === homeSceneId;
		const party = characters.filter((c) => c.kind === 'pc');
		const widgetCountFor = (sceneId: string) =>
			runtime.state.scenes.scenes[sceneId]?.widgets.length ?? 0;
		return {
			homeView,
			scenes,
			maps,
			notes,
			activeSceneId,
			workflow,
			liveScene,
			liveSceneIsHome,
			party,
			pcCount: party.length,
			npcCount: characters.length - party.length,
			factionCount,
			questCount,
			widgetCountFor,
		};
	}, [runtime.state, actorId]);

	// Liveness is `session.workflow` everywhere else in the app (Session.tsx, ProjectionControl, every
	// StatusDot). Reading `activeSceneId` instead meant `session.recover` — which restores the scene id
	// while moving the workflow to `recap` — would make the hub pulse "Session live" over a read-only
	// archive review.
	const isLive = data.workflow === 'active';

	// Each launcher hands its destination a create-intent (router state) so the create flow OPENS on
	// arrival; the sub-line says what the thing is in GM vocabulary, since the labels alone
	// ("widget"?) didn't tell a new user where NPCs, locations, or lore go.
	const create = [
		{
			icon: 'scene',
			label: 'New scene',
			sub: 'A canvas for the table',
			run: () => navigate('/scenes'),
		},
		{
			icon: 'new-character',
			label: 'New character',
			sub: 'PC, NPC, or monster',
			run: () => navigate('/characters', { state: { create: true } }),
		},
		{
			icon: 'new-map',
			label: 'New map',
			sub: 'Battle map or region',
			run: () => navigate('/atlas', { state: { create: true } }),
		},
		{
			icon: 'widget',
			label: 'New widget',
			sub: 'A GM Screen tracker',
			run: () => navigate('/board', { state: { addWidget: true } }),
		},
		{
			icon: 'note-edit',
			label: 'New note',
			sub: 'Lore, quest, or handout',
			run: () => navigate('/knowledge', { state: { create: true } }),
		},
	];

	const manage = [
		{ id: 'players', icon: 'characters-person', label: 'Players', meta: 'Roster & invites' },
		{ id: 'permissions', icon: 'dm-only', label: 'Permissions', meta: 'Roles & capability grants' },
		{
			id: 'vault',
			icon: 'settings-gear',
			label: 'Vault connections',
			meta: 'Connected note sources',
		},
	];

	const libraryCounts: Record<string, string> = {
		characters: `${data.pcCount} PCs · ${data.npcCount} NPCs`,
		atlas: `${data.maps.length} ${data.maps.length === 1 ? 'map' : 'maps'}`,
		campaign: `${data.questCount} ${data.questCount === 1 ? 'thread' : 'threads'} · ${data.factionCount} ${data.factionCount === 1 ? 'faction' : 'factions'}`,
		knowledge: `${data.notes.length} ${data.notes.length === 1 ? 'note' : 'notes'}`,
	};

	// UX-CMD-012 — a player/observer device gets ONLY its own player-safe view, never the DM hub.
	if (data.homeView.kind === 'participant') {
		return (
			<Page max={1100}>
				<Card
					accent
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
				>
					<StatusDot status={isLive ? 'live' : 'idle'} pulse={isLive} />
					<div style={{ flex: 1, minWidth: 200 }}>
						<div
							style={{
								font: `600 11px ${T.sans}`,
								letterSpacing: '.09em',
								textTransform: 'uppercase',
								color: T.acc,
							}}
						>
							{data.homeView.observerMode ? 'Observer mode' : 'Player view'}
						</div>
						<div style={{ font: `700 22px/1.1 ${T.disp}`, marginTop: 2 }}>
							{data.homeView.displayName}
						</div>
						<div style={{ font: `13px ${T.sans}`, color: T.sub, marginTop: 3 }}>
							{data.homeView.readOnly
								? 'Your read-only view of the live table.'
								: 'Your live view of the table — what the DM is sharing right now.'}
						</div>
					</div>
				</Card>
			</Page>
		);
	}

	return (
		<Page max={1200}>
			{/* Resume — the single primary: drop back into the live scene */}
			<Card
				accent
				elevation="raised"
				padding="lg"
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 20,
					flexWrap: 'wrap',
					marginBottom: 26,
				}}
			>
				<StatusDot status={isLive ? 'live' : 'idle'} pulse={isLive} />
				<div style={{ flex: 1, minWidth: viewport === 'phone' ? 0 : 200 }}>
					<div
						style={{
							font: `600 11px ${T.sans}`,
							letterSpacing: '.09em',
							textTransform: 'uppercase',
							color: T.acc,
						}}
					>
						{isLive ? 'Session live' : 'Command Center'}
					</div>
					<div style={{ font: `700 23px/1.1 ${T.disp}`, marginTop: 2 }}>
						{/* `liveScene` falls back to `scenes[0]` so the "Enter scene" button always has a
						    destination — but with no session running that made the hub's 23px display heading
						    announce an arbitrary scene name, which a DM reads as the current scene. */}
						{(isLive ? data.liveScene?.name : null) ?? 'Your campaign'}
					</div>
					<div style={{ font: `13px ${T.sans}`, color: T.sub, marginTop: 3 }}>
						{isLive
							? 'Combat, initiative & rolls run inside the scene'
							: 'Resume or open a scene to run live play'}
						{data.party.length ? ` · ${data.party.length} in the party` : ''}
					</div>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 14,
						flexWrap: 'wrap',
						minWidth: 0,
						width: viewport === 'phone' ? '100%' : undefined,
					}}
				>
					<div style={{ display: 'flex' }}>
						{data.party.slice(0, 5).map((p, i) => (
							<span
								key={p.id}
								title={p.name}
								role="img"
								aria-label={p.name}
								style={{
									marginLeft: i ? -8 : 0,
									borderRadius: '50%',
									boxShadow: '0 0 0 2px var(--color-surface-raised)',
								}}
							>
								<Avatar name={p.name} size="sm" ring="active" />
							</span>
						))}
					</div>
					<Button
						variant="primary"
						size="lg"
						iconRight="enter"
						// Not `disabled` on an empty resolve any more: the hub's ONE primary CTA went inert
						// with no explanation, and the null branch already has a sensible destination.
						onClick={() =>
							!data.liveScene
								? navigate('/scenes')
								: // The GM Screen's backing scene is not editable at `/scene/:id` — it has its
									// own destination, and "Go live" with no active scene lands exactly there.
									navigate(data.liveSceneIsHome ? '/board' : `/scene/${data.liveScene.id}`)
						}
						style={{
							maxWidth: '100%',
							whiteSpace: viewport === 'phone' ? 'normal' : 'nowrap',
							overflowWrap: 'anywhere',
						}}
					>
						{data.liveSceneIsHome ? 'Enter GM Screen' : isLive ? 'Enter scene' : 'Open scene'}
					</Button>
				</div>
			</Card>

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: viewport === 'phone' ? '1fr' : 'minmax(0,1.5fr) minmax(0,1fr)',
					gap: viewport === 'phone' ? 24 : 28,
					alignItems: 'start',
				}}
			>
				<div>
					<HubLabel
						action={
							<Button variant="ghost" size="sm" icon="add" onClick={() => navigate('/scenes')}>
								New scene
							</Button>
						}
					>
						Scenes
					</HubLabel>
					{data.scenes.length === 0 ? (
						<Card elevation="flat" padding="lg" style={{ textAlign: 'center', color: T.ter }}>
							<div style={{ font: `13px ${T.sans}` }}>No scenes yet.</div>
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								onClick={() => navigate('/scenes')}
								style={{ marginTop: 10 }}
							>
								Create your first scene
							</Button>
						</Card>
					) : (
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
								gap: 14,
							}}
						>
							{data.scenes.map((s) => (
								<SceneTile
									key={s.id}
									scene={s}
									// Same correction as the hub heading: a scene is only "live" while the session is.
									status={statusOf(s, isLive ? data.activeSceneId : null)}
									widgetCount={data.widgetCountFor(s.id)}
									onOpen={() => navigate(`/scene/${s.id}`)}
								/>
							))}
						</div>
					)}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
					<div>
						<HubLabel>Create</HubLabel>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
							{create.map((c) => (
								<LaunchTile
									key={c.label}
									icon={c.icon}
									label={c.label}
									sub={c.sub}
									onClick={c.run}
								/>
							))}
						</div>
					</div>
					<div>
						<HubLabel>Manage</HubLabel>
						<Card
							elevation="flat"
							padding="sm"
							style={{ display: 'flex', flexDirection: 'column' }}
						>
							{manage.map((m, i) => (
								<button
									key={m.id}
									type="button"
									// Deep-link the exact Settings subpage (Settings reads `?tab=`), not the section root.
									onClick={() => navigate(`/settings?tab=${m.id}`)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 11,
										padding: '10px 8px',
										border: 'none',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
										background: 'transparent',
										cursor: 'pointer',
										textAlign: 'left',
									}}
								>
									<Icon name={m.icon} size="sm" color={T.sub} />
									<span style={{ flex: 1, minWidth: 0 }}>
										<span style={{ display: 'block', font: `600 12.5px ${T.sans}`, color: T.ink }}>
											{m.label}
										</span>
										<span style={{ display: 'block', font: `11px ${T.sans}`, color: T.ter }}>
											{m.meta}
										</span>
									</span>
									<Icon name="chevron-right" size="sm" color={T.ter} />
								</button>
							))}
						</Card>
					</div>
				</div>
			</div>

			<div style={{ marginTop: 28 }}>
				<HubLabel>Library</HubLabel>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
						gap: 14,
					}}
				>
					{LIBRARY.map((l) => (
						<Card
							key={l.id}
							elevation="flat"
							interactive
							padding="md"
							onClick={() => navigate(l.path)}
							style={{ display: 'flex', alignItems: 'center', gap: 12 }}
						>
							<span
								style={{
									width: 40,
									height: 40,
									borderRadius: 9,
									background: T.accSub,
									color: T.acc,
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									flex: '0 0 auto',
								}}
							>
								<Icon name={l.icon} size="md" />
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>{l.label}</div>
								<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
									{libraryCounts[l.id] ?? l.sub}
								</div>
							</div>
							<Icon name="chevron-right" size="sm" color={T.ter} />
						</Card>
					))}
				</div>
			</div>
		</Page>
	);
}
