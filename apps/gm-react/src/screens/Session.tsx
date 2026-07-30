import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	EMPTY_PRESENCE_STATE,
	addDays,
	allowedTransitionsFrom,
	daysInMonth,
	getCalendarContinuityForActor,
	getCombatTrackerForActor,
	getDiceHistoryForActor,
	getHandoutsForActor,
	getHandoutStatusForDm,
	getPrepRecapDigest,
	getSessionAudioView,
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	projectSessionPresence,
	type CalendarDefinition,
	type CombatTrackerView,
	type CustomDate,
	type PrepRecapDigest,
	type ProjectedPresenceEntry,
	type SessionArchiveSnapshot,
	type SessionWorkflowState,
} from '@dndtools/core';
import {
	Avatar,
	Badge,
	Button,
	Card,
	CONDITIONS,
	ConditionBadge,
	DiceResult,
	Dialog,
	EmptyState,
	Field,
	HPBar,
	Icon,
	IconButton,
	Input,
	Select,
	Slider,
	StatPill,
	StatusDot,
	Textarea,
	VisibilityChip,
} from '../ds';
import { Toaster } from '../ds';
import { EncounterDialog } from '../app/EncounterBuilder';
import { Page, Panel, Seg, SetRow, T, eb, mono } from '../app/screen-kit';
import {
	GOOGLE_CALENDAR_SETUP_RUNBOOK,
	connectGoogleCalendar,
	createSessionEvent,
	isGoogleCalendarConfigured,
	isGoogleCalendarSignedIn,
	rosterAttendeeEmails,
} from '../cloud/googleCalendar';
import { useI18n } from '../i18n';
import { useRuntime } from '../runtime/RuntimeContext';
import { useSession } from '../net/SessionContext';
import type { HostPeer } from '../net/SessionHost';
import { useViewport } from '../app/useViewport';

/**
 * Session — the live-play console, wired to the real Processing Core (was a local-reducer mock).
 * It runs the session lifecycle (`session.set-workflow`), the encounter builder (a composition
 * dialog over the real character roster dispatching `encounter.build` → `combat.start`), the combat
 * tracker (`combat.advance-turn/previous-turn/apply-resource/end` plus the mid-fight roster ops
 * `combat.add-combatants/remove-combatant/reorder-combatant/set-combatant-visibility` over
 * `getCombatTrackerForActor`), the dice roller (`dice.roll` over `getDiceHistoryForActor`), handout
 * delivery (`session.deliver-handout/revoke-handout/acknowledge-handout`), now-playing session audio
 * (`session.audio.pause/resume/stop/set-volume`), the active-map stage
 * (`session.set-active-map/project-active-map`), the campaign date (`session.set-campaign-date`
 * over `getCalendarContinuityForActor` — the control the Campaign timeline points at), and the
 * SES-009 prep/recap panel (the `getPrepRecapDigest` continuity digest, the session archives, and
 * recap authoring via `session.author-recap`). Combat, dice,
 * and delivery are Processing-Core gated to the live (`active`) workflow, so the console guides the
 * DM to go live first. Reads are actor-filtered, so previewing as a player projects the player-safe
 * view; every durable write is rejected read-only while previewing. Tracker rows follow the DS
 * InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold active left rail ·
 * HPBar) with per-condition ConditionBadge chips from the CONDITIONS registry (distinct icon per
 * condition — the grayscale-safe contract). The spatial widget board lives on `/board` and
 * `/scene/:id`; this screen is the combat hot path.
 */

type HandoutView = ReturnType<typeof getHandoutsForActor>[number];
type HandoutStatusView = ReturnType<typeof getHandoutStatusForDm>[number];
type SessionAudioView = ReturnType<typeof getSessionAudioView>;
type MapEntry = ReturnType<typeof listMapsForActor>[number];
type ContinuityDate = NonNullable<ReturnType<typeof getCalendarContinuityForActor>['currentDate']>;
type CombatantRow = CombatTrackerView['combatants'][number];

export function Session() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const session = useSession();
	const actorId = runtime.defaultActorId;
	const workflow = runtime.state.session.workflow;
	const isLive = workflow === 'active';
	const previewing = !!runtime.preview;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const {
		tracker,
		dice,
		characters,
		party,
		activeSceneName,
		activeSceneId,
		handouts,
		handoutStatus,
		audio,
		audioLabel,
		maps,
		activeMapId,
		players,
		calendar,
		campaignDate,
		digest,
		archives,
		recapArchiveId,
	} = useMemo(() => {
		const session = runtime.state.session;
		const perms = runtime.state.permissions;
		const tracker = getCombatTrackerForActor(session.combat, perms, actorId);
		const dice = getDiceHistoryForActor(session, perms, actorId);
		const characters = listCharactersForActor(runtime.state.characters, perms, actorId);
		const scenes = listScenesForActor(runtime.state.scenes, perms, actorId);
		const activeSceneId = session.activeSceneId;
		const audioView = getSessionAudioView(
			runtime.state.audio,
			session.audioPlayback,
			perms,
			actorId,
		);
		// Resolve the now-playing track to a friendly title (asset title, else source display name) — the
		// track view carries only ids, so a raw uuid would otherwise show in the "Now playing" strip.
		const aTrack = audioView.track;
		const audioLabel = aTrack
			? ((aTrack.assetId
					? listAudioAssetsForActor(runtime.state.audio, perms, actorId).find(
							(a) => a.id === aTrack.assetId,
						)?.title
					: undefined) ??
				listAudioSourceClassificationsForActor(runtime.state.audio, perms, actorId).find(
					(s) => s.sourceId === aTrack.sourceId,
				)?.displayName ??
				aTrack.assetId ??
				aTrack.sourceId)
			: null;
		// SES-012 — the campaign calendar + current date (the Campaign timeline reads the same view).
		const calendar = (Object.values(runtime.state.content.calendars)[0] ??
			null) as CalendarDefinition | null;
		const campaignDate = getCalendarContinuityForActor(
			session,
			runtime.state.content,
			runtime.state.maps,
			perms,
			actorId,
			'long',
		).currentDate;
		// SES-009 — the prep/recap continuity digest (DM-only: a non-DM receives an EMPTY digest) and
		// the durable session archives that recap authoring writes onto. In `recap` the digest looks
		// back at the just-archived session; every other phase preps forward.
		const digest = getPrepRecapDigest(
			session,
			runtime.state.content,
			runtime.state.maps,
			runtime.state.characters,
			perms,
			runtime.state.sync,
			actorId,
			session.workflow === 'recap' ? 'recap' : 'prep',
		);
		const archives = Object.values(session.archives).sort((a, b) =>
			b.archivedAt.localeCompare(a.archivedAt),
		);
		return {
			tracker,
			dice,
			characters,
			party: characters.filter((c) => c.kind === 'pc'),
			activeSceneName: scenes.find((s) => s.id === activeSceneId)?.name ?? null,
			activeSceneId,
			handouts: getHandoutsForActor(session, perms, actorId),
			handoutStatus: getHandoutStatusForDm(session, perms, actorId),
			audio: audioView,
			audioLabel,
			maps: listMapsForActor(runtime.state.maps, perms, actorId),
			activeMapId: session.activeMap?.mapId ?? null,
			players: Object.values(perms.actors).filter((a) => a.role === 'player'),
			calendar,
			campaignDate,
			digest,
			archives,
			recapArchiveId: session.recapArchiveId,
		};
	}, [runtime.state, actorId]);

	// COLLAB-004 — the ephemeral core presence, projected for this viewer via the core query (fail
	// closed: only registered participants surface). Written by `session.set-presence`, which the P2P
	// host applies (stamped) whenever a connected player's presence beat arrives; never persisted.
	const presenceByActor = useMemo(() => {
		const projection = projectSessionPresence(
			runtime.state.presence ?? EMPTY_PRESENCE_STATE,
			runtime.state.permissions,
			actorId,
		);
		return new Map(projection.visible.map((entry) => [entry.actorId, entry]));
	}, [runtime.state, actorId]);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [diceExpr, setDiceExpr] = useState('1d20+7');
	const [handoutTitle, setHandoutTitle] = useState('');
	const [handoutBody, setHandoutBody] = useState('');
	// The encounter-composition dialog: 'start' builds `encounter.build` → `combat.start`;
	// 'reinforce' adds to running combat via `combat.add-combatants`.
	const [builderMode, setBuilderMode] = useState<'start' | 'reinforce' | null>(null);
	// The combatant id the condition-picker dialog is open for (the design-b condPick modal pattern).
	const [condPickFor, setCondPickFor] = useState<string | null>(null);
	// `combat.end` discards the round counter, the initiative order, and every combatant's HP and
	// conditions, and the core has no restore command — so it needs a confirm step, like the other
	// irreversible actions in this app.
	const [endConfirmOpen, setEndConfirmOpen] = useState(false);

	// Create-intent handoff from the "Build encounter" launchers (⌘K palette, the shell's Create
	// menu). They used to perform a bare navigation to /session and leave the DM to hunt for the
	// dialog — every other Create entry hands its destination an intent. Consumed once, then cleared.
	const location = useLocation();
	const navigate = useNavigate();
	useEffect(() => {
		const intent = (location.state ?? null) as { createEncounter?: boolean } | null;
		if (intent?.createEncounter) {
			setBuilderMode('start');
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	async function dispatch(
		command: Parameters<typeof runtime.dispatch>[0],
		ok?: string,
	): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'accepted') {
			if (ok) Toaster.success(ok);
			return true;
		}
		Toaster.error(result.rejection.message);
		return false;
	}

	async function goLive(): Promise<void> {
		const sceneId =
			runtime.state.session.activeSceneId ??
			runtime.state.commandCenter.homeSceneId ??
			listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter(
				(s) => !s.isTemplate,
			)[0]?.id;
		if (!sceneId) {
			Toaster.warning(t('Create a scene first — a live session needs an active scene.'));
			return;
		}
		await dispatch(
			{
				type: 'session.set-workflow',
				actorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			},
			t('You are live — combat, dice, and maps now reach players'),
		);
	}

	async function deliverHandout(): Promise<void> {
		const title = handoutTitle.trim();
		if (!title) return;
		if (!activeSceneId) {
			Toaster.warning(t('Go live with a scene first.'));
			return;
		}
		if (players.length === 0) {
			Toaster.warning(t('No players yet — add players in Settings → Players first.'));
			return;
		}
		const ok = await dispatch(
			{
				type: 'session.deliver-handout',
				actorId,
				payload: {
					title,
					sections: [
						{ heading: title, body: handoutBody.trim(), visibility: 'player-visible' as const },
					],
					sceneId: activeSceneId,
					recipientActorIds: players.map((p) => p.id),
				},
			},
			players.length === 1
				? t('Pushed “{title}” to 1 player', { title })
				: t('Pushed “{title}” to {count} players', { title, count: players.length }),
		);
		if (ok) {
			setHandoutTitle('');
			setHandoutBody('');
		}
	}

	const selected = tracker.combatants.find((c) => c.id === selectedId) ?? null;
	const condPickTarget = tracker.combatants.find((c) => c.id === condPickFor) ?? null;
	// `canDeliver` gates only on DM-ness + being live: requiring `activeSceneId`/`players.length` here
	// too made `deliverHandout`'s two Toaster.warning branches DEAD, so a DM with no registered players
	// saw a permanently greyed "Push to players" and was never told why.
	const canDeliver = isDm && isLive;

	return (
		<Page max={1280}>
			<SessionHeader
				workflow={workflow}
				sceneName={activeSceneName}
				onSetWorkflow={(w) => setWorkflow(w)}
			/>

			{!isLive && (
				<Card
					elevation="flat"
					padding="md"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 14,
						marginBottom: 18,
						borderColor: T.accBd,
						background: T.accSub,
						flexWrap: 'wrap',
					}}
				>
					<Icon name="info" size="md" color={T.acc} />
					<div style={{ flex: 1 }}>
						<div style={{ font: `600 13.5px ${T.sans}`, color: T.ink }}>
							{t('Session is on standby')}
						</div>
						<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
							{t('Go live to open combat, dice, handouts, and what players see.')}
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						icon="visibility-players"
						disabled={previewing || !isDm}
						onClick={goLive}
					>
						{t('Go live')}
					</Button>
				</Card>
			)}

			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						viewport === 'phone' ? 'minmax(0,1fr)' : 'minmax(0,1.6fr) minmax(0,1fr)',
					gap: 16,
					alignItems: 'start',
				}}
			>
				<CombatPanel
					tracker={tracker}
					isLive={isLive}
					isDm={isDm}
					selectedId={selectedId}
					selected={selected}
					previewing={previewing}
					onStart={() => setBuilderMode('start')}
					onAdd={() => setBuilderMode('reinforce')}
					onSelect={setSelectedId}
					onAdvance={() => dispatch({ type: 'combat.advance-turn', actorId, payload: {} })}
					onPrevious={() => dispatch({ type: 'combat.previous-turn', actorId, payload: {} })}
					onEnd={() => setEndConfirmOpen(true)}
					onHp={(combatantId, delta) =>
						dispatch({
							type: 'combat.apply-resource',
							actorId,
							payload: { combatantId, kind: 'hp', delta },
						})
					}
					onCondition={(combatantId, condition, present) =>
						dispatch({
							type: 'combat.apply-resource',
							actorId,
							payload: { combatantId, kind: 'condition', condition, present },
						})
					}
					onPickCondition={(combatantId) => setCondPickFor(combatantId)}
					onRemove={(combatantId, name) =>
						dispatch(
							{ type: 'combat.remove-combatant', actorId, payload: { combatantId } },
							`${name} removed from combat`,
						)
					}
					onReorder={(combatantId, direction) =>
						dispatch({
							type: 'combat.reorder-combatant',
							actorId,
							payload: { combatantId, direction },
						})
					}
					onVisibility={(combatantId, hidden) =>
						dispatch(
							{
								type: 'combat.set-combatant-visibility',
								actorId,
								payload: { combatantId, hidden },
							},
							hidden ? 'Hidden from players' : 'Revealed to players',
						)
					}
				/>

				<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
					<DicePanel
						rolls={dice.rolls}
						isLive={isLive}
						previewing={previewing}
						expr={diceExpr}
						onExpr={setDiceExpr}
						onRoll={(expression) =>
							dispatch({ type: 'dice.roll', actorId, payload: { expression } })
						}
					/>
					<HandoutsPanel
						handouts={handouts}
						status={handoutStatus}
						isDm={isDm}
						isLive={isLive}
						previewing={previewing}
						canDeliver={canDeliver}
						title={handoutTitle}
						body={handoutBody}
						onTitle={setHandoutTitle}
						onBody={setHandoutBody}
						onDeliver={deliverHandout}
						onRevoke={(id) =>
							dispatch(
								{ type: 'session.revoke-handout', actorId, payload: { handoutId: id } },
								'Handout revoked',
							)
						}
						onAcknowledge={(id) =>
							dispatch(
								{ type: 'session.acknowledge-handout', actorId, payload: { handoutId: id } },
								'Marked read',
							)
						}
					/>
					<AudioPanel
						audio={audio}
						trackLabel={audioLabel}
						isDm={isDm}
						previewing={previewing}
						onPause={() => dispatch({ type: 'session.audio.pause', actorId, payload: {} })}
						onResume={() => dispatch({ type: 'session.audio.resume', actorId, payload: {} })}
						onStop={() =>
							dispatch({ type: 'session.audio.stop', actorId, payload: {} }, 'Audio stopped')
						}
						onVolume={(volume) =>
							dispatch({ type: 'session.audio.set-volume', actorId, payload: { volume } })
						}
					/>
					<StagePanel
						maps={maps}
						activeMapId={activeMapId}
						isDm={isDm}
						isLive={isLive}
						previewing={previewing}
						onSelect={(mapId) =>
							dispatch(
								{ type: 'session.set-active-map', actorId, payload: { mapId } },
								'Active map set',
							)
						}
						onProject={() => {
							if (players.length === 0) {
								Toaster.warning(t('No players yet — add players in Settings → Players first.'));
								return;
							}
							void dispatch(
								{
									type: 'session.project-active-map',
									actorId,
									payload: { playerActorIds: players.map((p) => p.id) },
								},
								t('Map projected to players'),
							);
						}}
					/>
					{isDm && (
						<CampaignDatePanel
							calendar={calendar}
							current={campaignDate}
							previewing={previewing}
							onSet={(date, ok) =>
								void dispatch({ type: 'session.set-campaign-date', actorId, payload: { date } }, ok)
							}
						/>
					)}
					{isDm && (
						<RecapPanel
							digest={digest}
							archives={archives}
							defaultArchiveId={recapArchiveId}
							previewing={previewing}
							onAuthor={(archiveId, markdown) =>
								dispatch(
									{ type: 'session.author-recap', actorId, payload: { archiveId, markdown } },
									'Recap saved',
								)
							}
						/>
					)}
					<RosterPanel
						hosting={session.role === 'host'}
						peers={session.peers}
						presence={presenceByActor}
					/>
					<PartyPanel party={party} />
					{isDm && <SchedulePanel />}
				</div>
			</div>

			<EncounterDialog
				mode={builderMode}
				onClose={() => setBuilderMode(null)}
				characters={characters}
				party={party}
				defaultTitle={activeSceneName ? `${activeSceneName} — encounter` : 'Encounter'}
			/>
			<Dialog
				open={endConfirmOpen}
				onClose={() => setEndConfirmOpen(false)}
				title="End this combat?"
				description={`Round ${tracker.round} and the initiative order are discarded, along with every combatant's current HP and conditions. There is no undo — you would have to build the encounter again from your roster.`}
				icon="warning"
				// Without `tone`, Dialog leaves `accent` undefined and the header mark renders gold on
				// --color-accent-subtle — visually identical to an info dialog, on the app's most
				// destructive confirm. The footer button was already `variant="danger"`.
				tone="danger"
				size="sm"
				footer={
					<>
						<Button variant="secondary" size="sm" onClick={() => setEndConfirmOpen(false)}>
							Keep running
						</Button>
						<Button
							variant="danger"
							size="sm"
							icon="close"
							onClick={() => {
								setEndConfirmOpen(false);
								void dispatch({ type: 'combat.end', actorId, payload: {} }, 'Combat ended');
							}}
						>
							End combat
						</Button>
					</>
				}
			/>
			<ConditionPickerDialog
				target={condPickTarget}
				onClose={() => setCondPickFor(null)}
				onPick={(combatantId, condition) => {
					setCondPickFor(null);
					void dispatch({
						type: 'combat.apply-resource',
						actorId,
						payload: { combatantId, kind: 'condition', condition, present: true },
					});
				}}
			/>
		</Page>
	);

	function setWorkflow(target: 'prep' | 'active' | 'recap' | 'idle') {
		if (target === 'active') return void goLive();
		void dispatch({ type: 'session.set-workflow', actorId, payload: { workflow: target } });
	}
}

function SessionHeader({
	workflow,
	sceneName,
	onSetWorkflow,
}: {
	workflow: string;
	sceneName: string | null;
	onSetWorkflow: (w: 'prep' | 'active' | 'recap') => void;
}) {
	const phase = workflow === 'active' ? 'active' : workflow === 'recap' ? 'recap' : 'prep';
	// Only offer phases the core workflow table allows from here, so a click can't fire a rejected
	// transition + error toast (e.g. active→prep, recap→active are not legal). The current phase stays
	// enabled regardless (Seg keeps the checked option active).
	const allowed = new Set<string>(allowedTransitionsFrom(workflow as SessionWorkflowState));
	return (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}
		>
			<div style={{ minWidth: 0 }}>
				<div style={eb}>Live session</div>
				<div style={{ font: `700 19px/1.1 ${T.disp}` }}>{sceneName ?? 'No active scene'}</div>
			</div>
			<Seg
				value={phase}
				ariaLabel="Session phase"
				onChange={(v) => onSetWorkflow(v as 'prep' | 'active' | 'recap')}
				options={[
					{ value: 'prep', label: 'Prep', disabled: !allowed.has('prep') },
					{ value: 'active', label: 'Live', disabled: !allowed.has('active') },
					{ value: 'recap', label: 'Recap', disabled: !allowed.has('recap') },
				]}
			/>
			<div style={{ flex: 1 }} />
			<span
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 7,
					font: `12.5px ${T.sans}`,
					color: T.sub,
				}}
			>
				<StatusDot status={workflow === 'active' ? 'live' : 'idle'} pulse={workflow === 'active'} />
				{workflow === 'active' ? (
					<>
						Players see <strong style={{ color: T.ink }}>{sceneName ?? 'the scene'}</strong>
					</>
				) : (
					<>Standby</>
				)}
			</span>
		</div>
	);
}

// ── Combat tracker ────────────────────────────────────────────────────────────────────────────────

function CombatPanel({
	tracker,
	isLive,
	isDm,
	selectedId,
	selected,
	previewing,
	onStart,
	onAdd,
	onSelect,
	onAdvance,
	onPrevious,
	onEnd,
	onHp,
	onCondition,
	onPickCondition,
	onRemove,
	onReorder,
	onVisibility,
}: {
	tracker: CombatTrackerView;
	isLive: boolean;
	isDm: boolean;
	selectedId: string | null;
	selected: CombatantRow | null;
	previewing: boolean;
	onStart: () => void;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onAdvance: () => void;
	onPrevious: () => void;
	onEnd: () => void;
	onHp: (id: string, delta: number) => void;
	onCondition: (id: string, condition: string, present: boolean) => void;
	onPickCondition: (id: string) => void;
	onRemove: (id: string, name: string) => void;
	onReorder: (id: string, direction: 'earlier' | 'later') => void;
	onVisibility: (id: string, hidden: boolean) => void;
}) {
	const running = tracker.status === 'running';
	const activeCombatant =
		tracker.combatants.find((c) => c.id === tracker.activeCombatantId) ?? null;
	const lowest = tracker.combatants
		.filter((c) => c.resources)
		.reduce<CombatantRow | null>(
			(m, c) =>
				!m ||
				c.resources!.hp / Math.max(1, c.resources!.maxHp) <
					m.resources!.hp / Math.max(1, m.resources!.maxHp)
					? c
					: m,
			null,
		);
	const selectedIndex = selected ? tracker.combatants.findIndex((c) => c.id === selected.id) : -1;

	return (
		<Panel
			title="Combat"
			action={
				running ? (
					<div style={{ display: 'flex', gap: 7 }}>
						{isDm && (
							<Button
								variant="secondary"
								size="sm"
								icon="add"
								disabled={previewing}
								onClick={onAdd}
							>
								Add
							</Button>
						)}
						<Button variant="ghost" size="sm" icon="close" disabled={previewing} onClick={onEnd}>
							End combat
						</Button>
					</div>
				) : (
					<Button
						variant="primary"
						size="sm"
						icon="sword"
						// aria-disabled, not disabled: this is where ⌘K's "Build encounter" lands, and a
						// natively disabled button leaves the tab order — so the DM arrived at a mute dead
						// control. The EmptyState below explains it, but only to sighted users who scroll;
						// the reason belongs on the control that refuses.
						aria-disabled={!isLive || previewing || !isDm || undefined}
						title={
							previewing
								? 'Exit player preview to build an encounter'
								: !isDm
									? 'Only the DM can build an encounter'
									: !isLive
										? 'Go live before building an encounter'
										: 'Build encounter'
						}
						aria-label={
							previewing
								? 'Build encounter (unavailable — exit player preview first)'
								: !isDm
									? 'Build encounter (unavailable — DM only)'
									: !isLive
										? 'Build encounter (unavailable — go live first)'
										: 'Build encounter'
						}
						onClick={onStart}
					>
						Build encounter
					</Button>
				)
			}
		>
			{/* Next turn / Previous turn / Heal / Damage / conditions are the four things a DM touches
			    every thirty seconds, and they were the ONLY durable writes on this screen that pass no
			    `ok` string to the dispatch helper — so no toast fires and nothing is announced.
			    `aria-current` moving between list items is not announced either. This region is
			    permanently mounted (a status node inserted together with its text is routinely
			    dropped) and sits OUTSIDE the `<ul>` so it cannot join the list's text. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{running && activeCombatant
					? `Round ${tracker.round}, turn ${tracker.turn + 1} — ${activeCombatant.name}. ${
							activeCombatant.resources
								? `${activeCombatant.resources.hp} of ${activeCombatant.resources.maxHp} hit points.`
								: ''
						}`
					: ''}
			</div>
			{!running ? (
				<EmptyState
					icon="sword"
					title={isLive ? 'No combat running' : 'Go live to start combat'}
					description={
						isLive
							? 'Compose an encounter from your roster — party, NPCs, monsters — set initiative, and run it.'
							: 'Combat is open only while the session is live.'
					}
				/>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
						<StatPill label="Round" value={String(tracker.round)} tone="accent" />
						<StatPill label="Turn" value={String(tracker.turn + 1)} />
						{lowest && lowest.resources && (
							<StatPill
								label="Lowest HP"
								value={`${lowest.resources.hp}/${lowest.resources.maxHp}`}
								tone="error"
							/>
						)}
						<div style={{ flex: 1 }} />
						<IconButton
							icon="chevron-left"
							label="Previous turn"
							variant="ghost"
							size="sm"
							disabled={previewing}
							onClick={onPrevious}
						/>
						<Button
							variant="primary"
							size="sm"
							iconRight="skip"
							disabled={previewing}
							onClick={onAdvance}
						>
							Next turn
						</Button>
					</div>

					{/* The initiative order IS a list, and announcing "list, 4 items" is how a screen-reader
					    DM gets the shape of the turn order without walking every row. */}
					<ul
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
							listStyle: 'none',
							margin: 0,
							padding: 0,
						}}
					>
						{tracker.combatants.map((c) => {
							const active = c.id === tracker.activeCombatantId;
							const sel = c.id === selectedId;
							const res = c.resources;
							return (
								// The DS InitiativeRow anatomy (mono initiative · avatar with gold turn ring · gold
								// 3px active left rail · HPBar · quick HP steps), hand-hosted so the row can also
								// carry selection, state badges, and per-condition ConditionBadge chips with the
								// distinct-icon grayscale contract (the plain component renders generic chips only).
								//
								// The row itself is NOT a control. It used to be `role="button"` with
								// `aria-label={`Select ${name}`}`, and an aria-label on a role=button REPLACES the
								// whole descendant subtree — so a screen-reader DM heard "Select Goblin, toggle
								// button" and lost the HP, the AC, the conditions and whose turn it was. It also
								// nested the condition-remove and Heal/Damage buttons inside a button, which is an
								// axe `nested-interactive` violation (serious). The name is now the control; the
								// row keeps its pointer target as a mouse-only convenience.
								<li
									key={c.id}
									aria-current={active ? 'true' : undefined}
									onClick={() => onSelect(c.id)}
									style={{
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										gap: 12,
										padding: '9px 12px',
										borderRadius: 9,
										border: `1px solid ${active ? T.accBd : sel ? T.bdS : T.bd}`,
										borderLeft: `3px solid ${active ? T.acc : 'transparent'}`,
										background: active ? T.accSub : T.surf,
										opacity: c.hidden ? 0.75 : 1,
									}}
								>
									<span
										style={{
											minWidth: 28,
											textAlign: 'center',
											font: `700 14px ${T.mono}`,
											color: active ? T.acc : T.sub,
										}}
									>
										{c.statBlock.initiative ?? '—'}
									</span>
									<Avatar name={c.name} size="sm" ring={active ? 'turn' : undefined} />
									<div style={{ flex: 1, minWidth: 0 }}>
										{/* Wraps on purpose. On a 391px phone this row is left ~183px after the initiative
										    span, avatar, row actions and paddings, and "Active" + "Bloodied" alone exceed
										    that. Every child here is shrinkable, so the COMBATANT NAME was what collapsed to
										    an ellipsis while the badge text stacked one character per line. Let the badges
										    drop to their own line instead. */}
										<div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
											{/* The row's one real control. `aria-pressed` carries the selection state that
											    used to sit on the row, so the toggle semantics survive the restructure. */}
											<button
												type="button"
												aria-pressed={sel}
												// The row also selects (mouse-only convenience), so stop the bubble
												// rather than letting one click run the same selection twice.
												onClick={(e) => {
													e.stopPropagation();
													onSelect(c.id);
												}}
												style={{
													font: `600 13.5px ${T.sans}`,
													color: T.ink,
													whiteSpace: 'nowrap',
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													background: 'none',
													border: 'none',
													padding: 0,
													textAlign: 'left',
													cursor: 'pointer',
													minWidth: 0,
												}}
											>
												{c.name}
											</button>
											{c.hidden && <VisibilityChip level="dm-only" compact />}
											{active && <Badge status="success">Active</Badge>}
											{c.isBloodied && <Badge status="warning">Bloodied</Badge>}
											{c.isDefeated && <Badge status="error">Down</Badge>}
										</div>
										{res && (
											<div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
												<div style={{ flex: 1, minWidth: 0 }}>
													<HPBar current={res.hp} max={res.maxHp} size="sm" />
												</div>
												<span style={{ font: `11px ${T.mono}`, color: T.ter }}>
													AC {c.statBlock.ac ?? '—'}
												</span>
											</div>
										)}
										{res && res.conditions.length > 0 && (
											<div
												style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}
												onClick={(e) => e.stopPropagation()}
											>
												{res.conditions.map((cond) => (
													<ConditionBadge
														key={cond}
														condition={cond}
														compact
														onRemove={previewing ? undefined : () => onCondition(c.id, cond, false)}
													/>
												))}
											</div>
										)}
									</div>
									{res && (
										<div
											style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
											onClick={(e) => e.stopPropagation()}
										>
											{/* The combatant's name has to be IN the name: with six rows a screen
											    reader otherwise hears six identical "Heal 1" buttons that each
											    write durable HP to a different creature. "Heal 1"/"Damage 1"
											    stay as the PREFIX so combat.spec's substring match still hits. */}
											<IconButton
												icon="add"
												label={`Heal 1 HP — ${c.name}`}
												variant="ghost"
												size="sm"
												disabled={previewing}
												onClick={() => onHp(c.id, 1)}
											/>
											<IconButton
												icon="remove"
												label={`Damage 1 HP — ${c.name}`}
												variant="ghost"
												size="sm"
												disabled={previewing}
												onClick={() => onHp(c.id, -1)}
											/>
										</div>
									)}
								</li>
							);
						})}
					</ul>

					{selected && (
						<div
							style={{
								borderTop: `1px solid ${T.bd}`,
								paddingTop: 12,
								display: 'flex',
								flexDirection: 'column',
								gap: 10,
							}}
						>
							<div style={{ ...eb }}>Selected · {selected.name}</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
								{selected.resources && (
									<Button
										variant="secondary"
										size="sm"
										icon="add"
										disabled={previewing}
										onClick={() => onPickCondition(selected.id)}
									>
										Add condition
									</Button>
								)}
								{isDm && (
									<>
										<span
											aria-hidden="true"
											style={{ width: 1, height: 20, background: T.bd, margin: '0 4px' }}
										/>
										<IconButton
											icon="chevron-up"
											label={`Move ${selected.name} earlier in initiative`}
											variant="ghost"
											size="sm"
											disabled={previewing || selectedIndex <= 0}
											onClick={() => onReorder(selected.id, 'earlier')}
										/>
										<IconButton
											icon="chevron-down"
											label={`Move ${selected.name} later in initiative`}
											variant="ghost"
											size="sm"
											disabled={
												previewing ||
												selectedIndex < 0 ||
												selectedIndex >= tracker.combatants.length - 1
											}
											onClick={() => onReorder(selected.id, 'later')}
										/>
										<Button
											variant="secondary"
											size="sm"
											icon={selected.hidden ? 'visibility-players' : 'visibility-hidden'}
											disabled={previewing}
											onClick={() => onVisibility(selected.id, !selected.hidden)}
										>
											{selected.hidden ? 'Reveal' : 'Hide'}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											icon="close"
											disabled={previewing}
											onClick={() => onRemove(selected.id, selected.name)}
										>
											Remove
										</Button>
									</>
								)}
							</div>
							{isDm && selected.hidden && (
								<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
									Players see this row as “Unknown creature”.
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</Panel>
	);
}

// ── Condition picker (design-b condPick modal, wired to combat.apply-resource) ────────────────────

function ConditionPickerDialog({
	target,
	onClose,
	onPick,
}: {
	target: CombatantRow | null;
	onClose: () => void;
	onPick: (combatantId: string, condition: string) => void;
}) {
	const present = new Set(target?.resources?.conditions ?? []);
	const keys = Object.keys(CONDITIONS).filter((k) => !present.has(k));
	return (
		<Dialog
			open={!!target}
			onClose={onClose}
			title={`Add condition${target ? ` — ${target.name}` : ''}`}
			description="Each condition has its own icon, so it stays readable at a glance."
			icon="cond-poisoned"
			size="md"
		>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
				{keys.map((k) => (
					<button
						key={k}
						type="button"
						aria-label={`Add ${(CONDITIONS as Record<string, { label: string }>)[k].label}`}
						onClick={() => target && onPick(target.id, k)}
						style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
					>
						<ConditionBadge condition={k} />
					</button>
				))}
				{keys.length === 0 && (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						Every condition is already applied.
					</div>
				)}
			</div>
		</Dialog>
	);
}

// ── Campaign date (SES-012 — the control the Campaign timeline points at) ─────────────────────────

function CampaignDatePanel({
	calendar,
	current,
	previewing,
	onSet,
}: {
	calendar: CalendarDefinition | null;
	current: ContinuityDate | null;
	previewing: boolean;
	onSet: (date: CustomDate, ok: string) => void;
}) {
	const [year, setYear] = useState(1);
	const [month, setMonth] = useState(1);
	const [day, setDay] = useState(1);
	// Day and Year coerced on every keystroke (`Number(v) || 1`), so backspacing the last digit
	// snapped the field straight back to 1 and it could never be cleared to retype. Hold the raw
	// text and commit on blur, as EncounterBuilder's CR drafts do.
	const [dayText, setDayText] = useState('1');
	const [yearText, setYearText] = useState('1');

	// Keep the form anchored to the canonical current date (e.g. after “+1 day” or a set elsewhere).
	const currentIso = current?.isoLike ?? null;
	useEffect(() => {
		if (!current) return;
		setYear(current.value.year);
		setMonth(current.value.month);
		setDay(current.value.day);
		setYearText(String(current.value.year));
		setDayText(String(current.value.day));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync from the canonical date only
	}, [currentIso]);

	if (!calendar) {
		return (
			<Panel title="Campaign date">
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					This campaign has no calendar yet, so there is no date to set.
				</div>
			</Panel>
		);
	}

	const maxDay = daysInMonth(calendar, month) ?? 1;

	// An empty or unparseable draft falls back to the last committed value rather than to a magic 1.
	function parsedDay(): number {
		const n = Number(dayText);
		if (!dayText.trim() || !Number.isFinite(n)) return Math.min(maxDay, Math.max(1, day));
		return Math.min(maxDay, Math.max(1, Math.trunc(n)));
	}
	function parsedYear(): number {
		const n = Number(yearText);
		if (!yearText.trim() || !Number.isFinite(n)) return Math.trunc(year);
		return Math.trunc(n);
	}
	function commitDay() {
		const next = parsedDay();
		setDay(next);
		setDayText(String(next));
	}
	function commitYear() {
		const next = parsedYear();
		setYear(next);
		setYearText(String(next));
	}

	function setDate() {
		if (!calendar) return;
		onSet(
			{
				calendarId: calendar.id,
				year: parsedYear(),
				month,
				day: parsedDay(),
			},
			'Campaign date set',
		);
	}

	function advanceDay() {
		if (!calendar || !current) return;
		const next = addDays(calendar, current.value, 1);
		if (next) onSet(next, 'Campaign date advanced one day');
	}

	return (
		<Panel title="Campaign date">
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<Icon name="recent" size="sm" color={current ? T.acc : T.ter} />
				<div style={{ flex: '1 1 180px', minWidth: 0 }}>
					<div
						style={{
							font: `600 13px ${T.sans}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{current ? current.display : 'No date set'}
					</div>
					<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
						{calendar.name} · drives the Campaign timeline
					</div>
				</div>
				<Button
					variant="secondary"
					size="sm"
					icon="skip"
					disabled={previewing || !current}
					onClick={advanceDay}
				>
					+1 day
				</Button>
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
				<Field label="Month" style={{ flex: '1 1 120px' }}>
					<Select
						value={String(month)}
						disabled={previewing}
						options={calendar.months.map((m, i) => ({ value: String(i + 1), label: m.name }))}
						onChange={(e: { target: { value: string } }) => {
							const next = Math.max(1, Math.trunc(Number(e.target.value) || 1));
							setMonth(next);
							const cap = daysInMonth(calendar, next) ?? 1;
							const clamped = Math.min(cap, Math.max(1, parsedDay()));
							setDay(clamped);
							setDayText(String(clamped));
						}}
					/>
				</Field>
				<Field label="Day" style={{ width: 70 }}>
					<Input
						type="number"
						min={1}
						max={maxDay}
						value={dayText}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setDayText(e.target.value)}
						onBlur={commitDay}
					/>
				</Field>
				<Field label="Year" style={{ width: 84 }}>
					<Input
						type="number"
						value={yearText}
						disabled={previewing}
						onChange={(e: { target: { value: string } }) => setYearText(e.target.value)}
						onBlur={commitYear}
					/>
				</Field>
				<Button variant="primary" size="sm" icon="check" disabled={previewing} onClick={setDate}>
					Set date
				</Button>
			</div>
		</Panel>
	);
}

// ── Prep & recap (SES-009 — the continuity digest, session archives, recap authoring) ─────────────

function formatArchiveStamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * RecapPanel — the DM-only SES-009 surface: the computed prep/recap continuity digest (pure
 * derivation, never a copied dataset), the durable session archives, and recap AUTHORING via
 * `session.author-recap` (markdown onto the selected archive; re-saving replaces it). Ending a live
 * session into Recap is what creates an archive — the empty state says so instead of faking one.
 */
function RecapPanel({
	digest,
	archives,
	defaultArchiveId,
	previewing,
	onAuthor,
}: {
	digest: PrepRecapDigest;
	archives: SessionArchiveSnapshot[];
	defaultArchiveId: string | null;
	previewing: boolean;
	onAuthor: (archiveId: string, markdown: string) => Promise<boolean>;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [busy, setBusy] = useState(false);
	const target =
		archives.find((a) => a.id === (selectedId ?? defaultArchiveId)) ?? archives[0] ?? null;

	// Seed the editor from the canonical authored recap whenever the target archive (or its authored
	// revision) changes — same sync-from-canonical pattern as CampaignDatePanel.
	const seedKey = target ? `${target.id}:${target.recap?.revision ?? 0}` : 'none';
	useEffect(() => {
		setDraft(target?.recap?.markdown ?? '');
		// eslint-disable-next-line react-hooks/exhaustive-deps -- seed from the canonical recap only
	}, [seedKey]);

	const prompts = digest.continuityPrompts.slice(0, 6);

	async function save() {
		if (!target || busy) return;
		setBusy(true);
		// `runtime.dispatch` rethrows on a persist failure, and `busy` disables "Update recap" too, so a
		// throw froze the recap panel with the DM's unsaved markdown and no way out but a reload.
		try {
			await onAuthor(target.id, draft);
		} finally {
			setBusy(false);
		}
	}

	return (
		// The whole panel (digest + recap authoring) is DM-only — labeled explicitly in the header.
		<Panel title="Prep & recap" action={<VisibilityChip level="dm-only" compact />}>
			<div>
				<div style={{ ...eb, marginBottom: 5 }}>
					{digest.mode === 'recap' ? 'What happened' : 'Carry into the session'}
				</div>
				{prompts.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>Nothing to carry over yet.</div>
				) : (
					prompts.map((p) => (
						<div
							key={p.id}
							style={{
								display: 'flex',
								alignItems: 'baseline',
								gap: 7,
								font: `12.5px/1.6 ${T.sans}`,
								color: T.sub,
							}}
						>
							<span
								aria-hidden
								style={{
									width: 5,
									height: 5,
									borderRadius: '50%',
									background: T.accBd,
									flexShrink: 0,
									transform: 'translateY(-2px)',
								}}
							/>
							<span style={{ minWidth: 0 }}>{p.text}</span>
						</div>
					))
				)}
			</div>

			<div
				style={{
					borderTop: `1px solid ${T.bd}`,
					paddingTop: 10,
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
				}}
			>
				<div style={eb}>Session archives</div>
				{archives.length === 0 ? (
					<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
						No archived sessions yet. Ending a live session into Recap creates one here.
					</div>
				) : (
					<>
						{archives.length > 1 && (
							<Select
								aria-label="Archived session"
								value={target?.id ?? ''}
								options={archives.map((a) => ({
									value: a.id,
									label: `${formatArchiveStamp(a.archivedAt)}${a.recap ? ' · has recap' : ''}`,
								}))}
								onChange={(e: { target: { value: string } }) => setSelectedId(e.target.value)}
							/>
						)}
						{target && (
							<>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{formatArchiveStamp(target.archivedAt)}
									{target.recap ? ` · recap v${target.recap.revision}` : ' · no recap yet'}
								</div>
								<Textarea
									value={draft}
									onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
									rows={4}
									aria-label="Session recap"
									placeholder="What happened this session…"
								/>
								<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
									Markdown supported. Saving replaces the recap for this archive.
								</div>
								<Button
									variant="primary"
									size="sm"
									icon="check"
									// An existing recap has to be clearable: gating on `!draft.trim()`
									// unconditionally meant emptying the box disabled the only control that
									// could store the emptied value, so a wrong recap was permanent.
									disabled={previewing || busy || (!draft.trim() && !target.recap)}
									onClick={() => void save()}
								>
									{target.recap ? 'Update recap' : 'Save recap'}
								</Button>
							</>
						)}
					</>
				)}
			</div>
		</Panel>
	);
}

// ── Dice ──────────────────────────────────────────────────────────────────────────────────────────

function DicePanel({
	rolls,
	isLive,
	previewing,
	expr,
	onExpr,
	onRoll,
}: {
	rolls: {
		id: string;
		expression: string;
		total: number;
		label: string | null;
		dice: number[];
		modifier: number;
	}[];
	isLive: boolean;
	previewing: boolean;
	expr: string;
	onExpr: (v: string) => void;
	onRoll: (expression: string) => void;
}) {
	const presets = ['1d20', '1d20+5', '2d6+3', '1d8+2', '4d6'];
	// `getDiceHistoryForActor` returns rolls oldest-first (appended), so the newest is the LAST element.
	const recent = [...rolls].reverse();
	const last = recent[0];
	const disabled = !isLive || previewing;
	return (
		<Panel title="Dice">
			{/* `DiceResult` is a plain <div> and `onRoll` passes no `ok` string, so pressing Roll used
			    to produce no announcement whatsoever — the result simply appeared. Permanently mounted
			    for the same reason as the combat readout above. */}
			<div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
				{last ? `Rolled ${last.expression} — total ${last.total}.` : ''}
			</div>
			{!isLive && (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Dice rolls record to the live session — go live to roll.
				</div>
			)}
			<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
				{presets.map((p) => (
					<Button
						key={p}
						variant="secondary"
						size="sm"
						disabled={disabled}
						onClick={() => onRoll(p)}
					>
						{p}
					</Button>
				))}
			</div>
			{/* A <form> so Enter (and a phone keyboard's Go key) rolls — typing "2d6+4" and pressing
			    Enter used to do nothing at all on the busiest control of the live-play screen. */}
			<form
				style={{ display: 'flex', gap: 8 }}
				onSubmit={(e) => {
					e.preventDefault();
					if (disabled || !expr.trim()) return;
					onRoll(expr.trim());
				}}
			>
				<Input
					value={expr}
					onChange={(e: { target: { value: string } }) => onExpr(e.target.value)}
					placeholder="e.g. 3d6+2"
					aria-label="Dice expression"
					style={{ flex: 1 }}
				/>
				<Button
					type="submit"
					variant="accent"
					icon="dice"
					disabled={disabled || !expr.trim()}
				>
					Roll
				</Button>
			</form>
			{last && (
				<DiceResult
					notation={last.expression}
					total={last.total}
					rolls={last.dice}
					modifier={last.modifier}
				/>
			)}
			{recent.length > 1 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{recent.slice(1, 6).map((d) => (
						<div
							key={d.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								font: `12px ${T.sans}`,
								color: T.ter,
							}}
						>
							<span style={{ ...mono, color: T.sub }}>{d.expression}</span>
							<span style={{ flex: 1, borderBottom: `1px dotted ${T.bd}` }} />
							<span style={{ ...mono, color: T.ink, fontWeight: 700 }}>{d.total}</span>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}

// Spoken labels for the handout kinds — the raw kind token never renders to users.
const HANDOUT_KIND_LABEL: Record<string, string> = {
	handout: 'Handout',
	image: 'Image',
	note: 'Note',
	'map-fragment': 'Map fragment',
	cipher: 'Cipher',
	rumor: 'Rumor',
};

function HandoutsPanel({
	handouts,
	status,
	isDm,
	isLive,
	previewing,
	canDeliver,
	title,
	body,
	onTitle,
	onBody,
	onDeliver,
	onRevoke,
	onAcknowledge,
}: {
	handouts: HandoutView[];
	status: HandoutStatusView[];
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	canDeliver: boolean;
	title: string;
	body: string;
	onTitle: (v: string) => void;
	onBody: (v: string) => void;
	onDeliver: () => void;
	onRevoke: (id: string) => void;
	onAcknowledge: (id: string) => void;
}) {
	const statusById = new Map(status.map((s) => [s.handoutId, s]));
	return (
		<Panel title="Handouts">
			{isDm ? (
				<>
					{!isLive && (
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							Handouts deliver to the live session — go live to push to players.
						</div>
					)}
					<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
						{/* These were the only two unlabelled fields on the screen: a `placeholder` is
						    not a label, and it disappears the moment the DM types (WCAG 3.3.2). axe
						    cannot flag it, because HTML-AAM accepts placeholder as an accname
						    fallback — so the a11y gate stayed green over it. */}
						<Field label="Handout title">
							<Input
								value={title}
								onChange={(e: { target: { value: string } }) => onTitle(e.target.value)}
								placeholder="Handout title"
							/>
						</Field>
						<Field label="What the players read">
							<Textarea
								value={body}
								onChange={(e: { target: { value: string } }) => onBody(e.target.value)}
								placeholder="What the players read…"
								rows={3}
							/>
						</Field>
						<Button
							variant="primary"
							size="sm"
							icon="send"
							disabled={!canDeliver || !title.trim()}
							onClick={onDeliver}
						>
							Push to players
						</Button>
					</div>
				</>
			) : (
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					Handouts the DM has shared with you appear here.
				</div>
			)}

			{handouts.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No handouts delivered yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{handouts.map((h) => {
						const st = statusById.get(h.id);
						const delivered = st ? st.recipients.length : 0;
						const opened = st ? st.recipients.filter((r) => r.acknowledged).length : 0;
						return (
							<div
								key={h.id}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${T.bd}`,
									background: T.surf,
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 13px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{h.title}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{HANDOUT_KIND_LABEL[h.handoutKind] ?? 'Handout'} · {h.sections.length}{' '}
										{h.sections.length === 1 ? 'section' : 'sections'}
										{isDm ? ` · ${opened}/${delivered} opened` : ''}
									</div>
								</div>
								{isDm ? (
									<IconButton
										icon="close"
										label={`Revoke handout — ${h.title}`}
										variant="ghost"
										size="sm"
										disabled={previewing}
										onClick={() => onRevoke(h.id)}
									/>
								) : h.acknowledged ? (
									<Badge status="success">Read</Badge>
								) : (
									<Button
										variant="secondary"
										size="sm"
										aria-label={`Mark read — ${h.title}`}
										disabled={previewing}
										onClick={() => onAcknowledge(h.id)}
									>
										Mark read
									</Button>
								)}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}

function AudioPanel({
	audio,
	trackLabel,
	isDm,
	previewing,
	onPause,
	onResume,
	onStop,
	onVolume,
}: {
	audio: SessionAudioView;
	trackLabel: string | null;
	isDm: boolean;
	previewing: boolean;
	onPause: () => void;
	onResume: () => void;
	onStop: () => void;
	onVolume: (volume: number) => void;
}) {
	const track = audio.track;
	return (
		<Panel title="Now playing">
			{!track ? (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						font: `12.5px ${T.sans}`,
						color: T.ter,
					}}
				>
					<Icon name="audio" size="sm" color={T.ter} />
					Nothing playing. Start ambience from the Audio library.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
						<Icon name="audio" size="sm" color={track.status === 'playing' ? T.acc : T.sub} />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									font: `600 13px ${T.sans}`,
									color: T.ink,
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{trackLabel ?? track.assetId ?? track.sourceId}
							</div>
							<div style={{ font: `11px ${T.sans}`, color: T.ter }}>session audio</div>
						</div>
						<Badge status={track.status === 'playing' ? 'success' : 'neutral'}>
							{track.status === 'playing' ? 'Playing' : 'Paused'}
						</Badge>
					</div>
					{isDm && (
						<>
							<div style={{ display: 'flex', gap: 7 }}>
								{track.status === 'playing' ? (
									<Button
										variant="secondary"
										size="sm"
										icon="pause"
										disabled={previewing}
										onClick={onPause}
									>
										Pause
									</Button>
								) : (
									<Button
										variant="secondary"
										size="sm"
										icon="play"
										disabled={previewing}
										onClick={onResume}
									>
										Resume
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									icon="close"
									disabled={previewing}
									onClick={onStop}
								>
									Stop
								</Button>
							</div>
							<Slider
								label="Volume"
								min={0}
								max={1}
								step={0.05}
								value={track.volume}
								valueLabel={`${Math.round(track.volume * 100)}%`}
								disabled={previewing}
								onChange={(v: number) => onVolume(v)}
							/>
						</>
					)}
				</div>
			)}
		</Panel>
	);
}

function StagePanel({
	maps,
	activeMapId,
	isDm,
	isLive,
	previewing,
	onSelect,
	onProject,
}: {
	maps: MapEntry[];
	activeMapId: string | null;
	isDm: boolean;
	isLive: boolean;
	previewing: boolean;
	onSelect: (mapId: string) => void;
	onProject: () => void;
}) {
	if (!isDm) return null;
	return (
		<Panel title="Stage">
			{maps.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					No maps yet — create one in the Atlas.
				</div>
			) : (
				<>
					<SetRow
						label="Active map"
						help="What you stage for the table."
						control={
							<Select
								aria-label="Active map"
								value={activeMapId ?? ''}
								disabled={previewing}
								options={[
									// Only offered while nothing IS staged, i.e. as an honest description of the
									// current value. Clearing the active map is not expressible as a command
									// (`session.set-active-map` requires a real id), so leaving "— none —"
									// selectable meant the DM picked it, the dropdown snapped back, and nothing
									// explained why.
									...(activeMapId ? [] : [{ value: '', label: '— none —' }]),
									...maps.map((m) => ({ value: m.id, label: m.name })),
								]}
								onChange={(e: { target: { value: string } }) => {
									if (e.target.value) onSelect(e.target.value);
								}}
							/>
						}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="visibility-players"
						disabled={!isLive || previewing || !activeMapId}
						onClick={onProject}
					>
						Project to players
					</Button>
				</>
			)}
		</Panel>
	);
}

// ── Table roster (COLLAB-004 — connected players + live presence) ─────────────────────────────────

/**
 * RosterPanel — who is at the table right now. Connection + the hand-raised / ready hints come from
 * the P2P host's peer roster; the online/away status and device come from the CORE presence state via
 * its projection query (`projectSessionPresence` — the model `session.set-presence` writes when a
 * player's presence beat arrives). Honest when there is no transport: not hosting ⇒ it says how to
 * host, hosting with nobody joined ⇒ it says players appear as they connect.
 */
// Roles and presence arrive as machine tokens; these are the words players and DMs actually read.
const ROLE_LABEL: Record<string, string> = {
	dm: 'DM',
	'co-dm': 'Co-DM',
	player: 'Player',
	observer: 'Observer',
};
const PRESENCE_LABEL: Record<string, string> = {
	online: 'Online',
	away: 'Away',
	offline: 'Offline',
};

function RosterPanel({
	hosting,
	peers,
	presence,
}: {
	hosting: boolean;
	peers: HostPeer[];
	presence: Map<string, ProjectedPresenceEntry>;
}) {
	const connected = peers.filter((p) => p.connected);
	return (
		<Panel
			title="Table roster"
			action={
				hosting ? (
					<Badge status={connected.length > 0 ? 'success' : 'neutral'}>
						{connected.length} connected
					</Badge>
				) : undefined
			}
		>
			{!hosting ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					No live table yet. Use <strong style={{ color: T.sub }}>Host</strong> in the top bar to
					open your table — players appear here as they connect.
				</div>
			) : peers.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Hosting — no players yet. Invite from the Host panel; players appear here as they connect.
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{peers.map((p) => {
						const entry = presence.get(p.actorId);
						const status = p.connected ? (entry?.status ?? p.status) : 'offline';
						return (
							<div
								key={p.peerId}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 10px',
									borderRadius: 9,
									border: `1px solid ${p.hand ? T.accBd : T.bd}`,
									background: p.hand ? T.accSub : T.surf,
								}}
							>
								<StatusDot status={status === 'online' ? 'live' : 'idle'} pulse={p.hand} />
								<Avatar name={p.displayName} size="sm" />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div
										style={{
											font: `600 13px ${T.sans}`,
											color: T.ink,
											whiteSpace: 'nowrap',
											overflow: 'hidden',
											textOverflow: 'ellipsis',
										}}
									>
										{p.displayName}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{ROLE_LABEL[p.role] ?? p.role}
										{p.connected
											? ` · ${PRESENCE_LABEL[status] ?? status}`
											: ' · Invited — not connected yet'}
										{entry && entry.device !== 'unknown' ? ` · ${entry.device}` : ''}
									</div>
								</div>
								{p.connected &&
									(p.hand ? (
										<Badge status="accent" icon="flag">
											Hand raised
										</Badge>
									) : p.ready ? (
										<Badge status="success" icon="check">
											Ready
										</Badge>
									) : (
										<Badge status="neutral">Connected</Badge>
									))}
							</div>
						);
					})}
				</div>
			)}
		</Panel>
	);
}

// ── Schedule next session (cloud-tier roadmap P2 #8, Calendar half — metadata only) ───────────────

/**
 * DM-only real-world scheduling: creates a Google Calendar event (attendee invites + a
 * Calendar-native reminder) for the next session. Strictly metadata — the event carries a title,
 * a time, roster emails, and only the note the DM types here; never vault content — so it works
 * identically for Private (E2EE) vaults (ADR-026). Fail closed: without a configured Google
 * client id the panel points at the setup runbook instead of showing a dead button.
 */
function SchedulePanel() {
	const [start, setStart] = useState('');
	const [duration, setDuration] = useState('180');
	const [reminder, setReminder] = useState('60');
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [link, setLink] = useState('');
	const emails = useMemo(rosterAttendeeEmails, []);

	if (!isGoogleCalendarConfigured) {
		return (
			<Panel title="Schedule next session" action={<VisibilityChip level="dm-only" compact />}>
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
					Google Calendar scheduling isn’t set up for this install. A one-time Google Cloud setup
					enables it — see the guide at{' '}
					<span style={{ ...mono, fontSize: 12 }}>{GOOGLE_CALENDAR_SETUP_RUNBOOK}</span>.
				</div>
			</Panel>
		);
	}

	const create = async () => {
		if (!start || busy) return;
		setBusy(true);
		setLink('');
		try {
			if (!isGoogleCalendarSignedIn()) {
				const outcome = await connectGoogleCalendar();
				if (outcome.status !== 'signed-in') {
					if (outcome.status === 'failed') Toaster.error(outcome.message);
					return;
				}
			}
			const startDate = new Date(start);
			const created = await createSessionEvent({
				summary: 'D&D — game session',
				startIso: startDate.toISOString(),
				durationMinutes: Number(duration),
				attendeeEmails: emails,
				details: note,
				reminderMinutes: Number(reminder),
			});
			setLink(created.htmlLink);
			Toaster.success(
				emails.length
					? `Session scheduled — ${emails.length} ${emails.length === 1 ? 'invite' : 'invites'} sent.`
					: 'Session scheduled on your calendar.',
			);
		} catch (error) {
			Toaster.error(
				error instanceof Error
					? error.message
					: 'The calendar event couldn’t be created — try again.',
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="Schedule next session" action={<VisibilityChip level="dm-only" compact />}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				<Field label="When">
					<Input
						type="datetime-local"
						value={start}
						onChange={(e: { target: { value: string } }) => setStart(e.target.value)}
					/>
				</Field>
				<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
					<Field label="Length" style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={duration}
							onChange={(e: { target: { value: string } }) => setDuration(e.target.value)}
							options={[
								{ value: '120', label: '2 hours' },
								{ value: '180', label: '3 hours' },
								{ value: '240', label: '4 hours' },
							]}
						/>
					</Field>
					<Field label="Reminder" style={{ flex: 1, minWidth: 120 }}>
						<Select
							value={reminder}
							onChange={(e: { target: { value: string } }) => setReminder(e.target.value)}
							options={[
								{ value: '60', label: '1 hour before' },
								{ value: '1440', label: '1 day before' },
								{ value: '0', label: 'Calendar default' },
							]}
						/>
					</Field>
				</div>
				<Field label="Note to players (optional)">
					<Input
						value={note}
						onChange={(e: { target: { value: string } }) => setNote(e.target.value)}
						placeholder="Bring snacks."
					/>
				</Field>
				<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{emails.length
						? `Invites go to ${emails.length} roster ${emails.length === 1 ? 'email' : 'emails'}.`
						: 'No roster emails yet — the event is created on your calendar only.'}{' '}
					Only the title, time, and this note leave the vault.
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<Button onClick={() => void create()} disabled={!start || busy}>
						{busy ? 'Scheduling…' : 'Create calendar event'}
					</Button>
					{link && (
						<a
							href={link}
							target="_blank"
							rel="noreferrer"
							style={{ font: `12.5px ${T.sans}`, color: T.acc }}
						>
							Open in Google Calendar
						</a>
					)}
				</div>
			</div>
		</Panel>
	);
}

function PartyPanel({
	party,
}: {
	party: { id: string; name: string; combat?: { hp: number; maxHp: number } }[];
}) {
	return (
		<Panel title="Party">
			{party.length === 0 ? (
				<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>No player characters yet.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
					{party.map((p) => (
						<div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<div style={{ flex: 1, minWidth: 0 }}>
								<HPBar
									current={p.combat?.hp ?? 0}
									max={p.combat?.maxHp ?? 1}
									label={p.name}
									size="sm"
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</Panel>
	);
}
