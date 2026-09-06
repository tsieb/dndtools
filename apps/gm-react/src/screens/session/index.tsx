import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	EMPTY_PRESENCE_STATE,
	allowedTransitionsFrom,
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
	type SessionWorkflowState,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { EncounterDialog } from '../../app/EncounterBuilder';
import { Page } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSession } from '../../net/SessionContext';
import { useViewport } from '../../app/useViewport';
import { StagePanel } from './ActiveMap';
import { CampaignDatePanel } from './CampaignDate';
import { CombatPanel, ConditionPickerDialog } from './CombatTracker';
import { DicePanel } from './DiceTray';
import { HandoutsPanel } from './Handouts';
import { EndCombatDialog, EndSessionDialog, SessionHeader, StandbyCard } from './Lifecycle';
import { AudioPanel } from './NowPlaying';
import { RecapPanel } from './PrepRecap';
import { PartyPanel, RosterPanel } from './Roster';
import { SchedulePanel } from './Schedule';

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

export function Session() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const session = useSession();
	const actorId = runtime.defaultActorId;
	const workflow = runtime.state.session.workflow;
	const isLive = workflow === 'active';
	// `recap → active` is not a legal core transition (session-workflow.ts), so the standby card's
	// "Go live" was a button that could only ever fail.
	const canGoLive = allowedTransitionsFrom(workflow as SessionWorkflowState).includes('active');
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
	const [standbyConfirmOpen, setStandbyConfirmOpen] = useState(false);

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

	// Every other lifecycle control on this screen confirms what it did — `goLive` toasts, the top-bar
	// ProjectionControl toasts. The phase Seg alone changed durable lifecycle state and said nothing,
	// so a screen-reader DM got only a silently re-checked radio.
	function workflowAnnounce(target: 'prep' | 'recap' | 'idle'): string {
		if (target === 'prep') return t('session.movedToPrep');
		if (target === 'recap') return t('session.archivedIntoRecap');
		return t('session.end.toast');
	}

	async function goLive(): Promise<void> {
		const sceneId =
			runtime.state.session.activeSceneId ??
			runtime.state.commandCenter.homeSceneId ??
			listScenesForActor(runtime.state.scenes, runtime.state.permissions, actorId).filter(
				(s) => !s.isTemplate,
			)[0]?.id;
		if (!sceneId) {
			Toaster.warning(t('session.goLive.needsScene'));
			return;
		}
		await dispatch(
			{
				type: 'session.set-workflow',
				actorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			},
			t('session.goLive.announcement'),
		);
	}

	async function deliverHandout(): Promise<void> {
		const title = handoutTitle.trim();
		if (!title) return;
		if (!activeSceneId) {
			Toaster.warning(t('session.goLive.needsSceneShort'));
			return;
		}
		if (players.length === 0) {
			Toaster.warning(t('projection.noPlayers'));
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
			t('projection.pushed', { title, count: players.length }),
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
				previewing={previewing}
				isDm={isDm}
				onSetWorkflow={(w) => setWorkflow(w)}
			/>

			{!isLive && (
				<StandbyCard
					workflow={workflow}
					canGoLive={canGoLive}
					previewing={previewing}
					isDm={isDm}
					onGoLive={() => void goLive()}
					t={t}
				/>
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
								Toaster.warning(t('projection.noPlayers'));
								return;
							}
							void dispatch(
								{
									type: 'session.project-active-map',
									actorId,
									payload: { playerActorIds: players.map((p) => p.id) },
								},
								t('projection.mapProjected'),
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
							maps={maps}
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
			<EndCombatDialog
				open={endConfirmOpen}
				round={tracker.round}
				onClose={() => setEndConfirmOpen(false)}
				onConfirm={() => {
					setEndConfirmOpen(false);
					void dispatch({ type: 'combat.end', actorId, payload: {} }, 'Combat ended');
				}}
			/>
			<EndSessionDialog
				open={standbyConfirmOpen}
				onClose={() => setStandbyConfirmOpen(false)}
				onConfirm={() => {
					setStandbyConfirmOpen(false);
					void dispatch(
						{ type: 'session.set-workflow', actorId, payload: { workflow: 'idle' } },
						workflowAnnounce('idle'),
					);
				}}
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
		// The phase Seg was the ONLY control on /session with no `previewing`/`isDm` gate (every other
		// one of its 50-odd references has one), so previewing as a player and pressing Standby raised
		// the full-red "End the live session?" dialog for a teardown the core would then refuse
		// read-only. The Seg now disables those options, and this is the belt-and-braces guard.
		if (previewing || !isDm) return;
		if (target === 'active') return void goLive();
		// `idle` runs resetLiveSessionFields (session-control.ts) — it discards the round, the whole
		// initiative order with every combatant's HP and conditions, the delivered handouts, the dice
		// log, the timers and the staged map, and unlike Recap it writes NO archive. That is a strict
		// superset of what `combat.end` throws away, and `combat.end` has had a danger confirm since
		// run #5. The Seg is selection-follows-focus, so from Live this was one ArrowLeft away.
		if (target === 'idle' && workflow === 'active') return setStandbyConfirmOpen(true);
		void dispatch(
			{ type: 'session.set-workflow', actorId, payload: { workflow: target } },
			workflowAnnounce(target),
		);
	}
}
