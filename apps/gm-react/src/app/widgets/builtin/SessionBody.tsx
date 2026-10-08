import { useState, type ReactElement } from 'react';
import {
	SESSION_LOG_SUBTYPE,
	VAULT_OBJECT_SUBTYPE_KEY,
	getSessionStatusStrip,
} from '@dndtools/core';
import { Toaster } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { useSession } from '../../../net/SessionContext';
import type { BoardWidget } from '../../board-helpers';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';
import { StagePanel } from '../../../screens/session/ActiveMap';
import { CampaignDatePanel } from '../../../screens/session/CampaignDate';
import { CapturePanel, type CaptureSubmission } from '../../../screens/session/Capture';
import { HandoutsPanel } from '../../../screens/session/Handouts';
import {
	CallRestDialog,
	EndSessionDialog,
	RestTimelinePanel,
	SessionHeader,
	StandbyStatus,
	StartSessionDialog,
	type SessionStartChoice,
} from '../../../screens/session/Lifecycle';
import { AudioPanel } from '../../../screens/session/NowPlaying';
import { RecapPanel } from '../../../screens/session/PrepRecap';
import { PartyPanel, RosterPanel } from '../../../screens/session/Roster';
import { SchedulePanel } from '../../../screens/session/Schedule';
import { TablesPanel, type TableView } from '../../../screens/session/Tables';
import {
	useArchives,
	useCampaignDateValue,
	useCampaignDateView,
	useCaptureCandidates,
	useHandoutsView,
	useMapList,
	useNowPlayingView,
	usePlayers,
	usePrepRecapDigest,
	usePresence,
	useRestLog,
	useRoster,
	useSessionDispatch,
	useSessionScenes,
	useSessionSeat,
	useStageView,
	useTablesView,
} from '../../../screens/session/useSessionView';
import { LiveReadout, LiveStats, StateMark } from './live';

/**
 * The `session` widget. Its default view is the Command Center status strip (RC-WID-4.1). RC-CAN-7.8
 * gives it a view per row of the Session screen (SCREENS_PARITY §3): `console` is the status row
 * (SE-01–SE-06 and the SE-30–SE-32 dialogs: the session's name and scene, the Standby / Prep / Live /
 * Recap control, Start session, Call a rest and End session), and each of the others is one panel of
 * the console's right-hand column (SE-16–SE-26). The combat tracker and the dice tray are views of
 * `combat` and `dice`. Every view reads only its own row's hook (`useSessionView`).
 */
export function SessionBody({ widget }: { widget: BoardWidget }) {
	const View = SESSION_VIEWS[cfg<string>(widget, 'view') ?? 'strip'] ?? SessionStrip;
	return <View />;
}

/**
 * The strip. Every cell comes from ONE actor-filtered read model, `getSessionStatusStrip`
 * (UX-CMD-003): the core decides what this viewer may see, so the roster cell is simply ABSENT for a
 * player rather than blanked out here, and a hidden active combatant never reaches the turn label.
 */
function SessionStrip() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const strip = getSessionStatusStrip(runtime.state, runtime.defaultActorId);
	if (strip.kind !== 'status-strip') return <Muted>{t('widgetBody.session.unavailable')}</Muted>;
	return (
		<div style={bodyWrap}>
			<LiveStats>
				<StatPill label={t('widgetBody.session.phase')} value={strip.phase.label} />
				<StatPill label={t('widgetBody.session.turn')} value={strip.turn.label} />
			</LiveStats>
			<LiveReadout style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{/* DM-only cell: `players` is null for a player or observer, so the roster count cannot
				    leak through a widget a DM shared onto a player view. */}
				{strip.players && <Chip>{strip.players.label}</Chip>}
				{/* The DM's audio label is the track's source id, so only the accent tone said whether
				    it was playing. A participant's label is already the word, and needs no mark. */}
				<Chip tone={strip.audio.playing ? 'accent' : 'neutral'}>
					{strip.audio.playing && strip.audio.sourceId !== null && (
						<StateMark icon="play" label={t('session.audio.playing')} />
					)}
					{strip.audio.label}
				</Chip>
			</LiveReadout>
			{strip.observerMode && <Muted>{t('widgetBody.session.observer')}</Muted>}
		</div>
	);
}

/**
 * The session lifecycle (`session.set-workflow`). Starting is a flow, not a press (RC-SES-1.3): the
 * dialog asks which scene and lets a new session be named. Leaving Live for Standby discards the
 * round, the order, the handouts, the dice log, the timers and the staged map and writes no archive,
 * so it confirms; Recap archives instead.
 */
function SessionConsole() {
	const { t } = useI18n();
	const { runtime, actorId, workflow, isLive, canStart, canReview, previewing, isDm } =
		useSessionSeat();
	const dispatch = useSessionDispatch();
	const { startableScenes, activeSceneName, continueSceneId } = useSessionScenes();
	const { party } = useRoster();
	const [startOpen, setStartOpen] = useState(false);
	const [endOpen, setEndOpen] = useState(false);
	// RC-CHR-1.2 — the DM's party-wide "Call a rest" dialog.
	const [restOpen, setRestOpen] = useState(false);

	// Every other lifecycle control confirms what it did; the phase control alone changed durable
	// state silently, so a screen-reader DM got only a re-checked radio.
	function announce(target: 'prep' | 'recap' | 'idle'): string {
		if (target === 'prep') return t('session.movedToPrep');
		if (target === 'recap') return t('session.archivedIntoRecap');
		return t('session.end.toast');
	}

	// Opening is gated exactly as the dispatch is, so a blocked start opens nothing rather than a
	// dialog it cannot honour.
	function openStart(): void {
		if (previewing || !isDm || !canStart) return;
		if (startableScenes.length === 0) {
			Toaster.warning(t('session.goLive.needsScene'));
			return;
		}
		setStartOpen(true);
	}

	function start(choice: SessionStartChoice): void {
		void dispatch(
			{
				type: 'session.set-workflow',
				actorId,
				// An unnamed start clears any name left on the slice, so a new session never inherits
				// the previous one's name.
				payload: { workflow: 'active', activeSceneId: choice.sceneId, title: choice.title },
			},
			t('session.goLive.announcement'),
		);
	}

	function moveTo(target: 'prep' | 'recap' | 'idle'): void {
		void dispatch(
			{ type: 'session.set-workflow', actorId, payload: { workflow: target } },
			announce(target),
		);
	}

	function setWorkflow(target: 'prep' | 'active' | 'recap' | 'idle'): void {
		// The phase control is disabled while previewing or for a non-DM; this is the guard behind it.
		if (previewing || !isDm) return;
		if (target === 'active') return openStart();
		// From Live, Standby is one ArrowLeft away and throws away more than `combat.end` does.
		if (target === 'idle' && isLive) return setEndOpen(true);
		moveTo(target);
	}

	/**
	 * RC-CHR-1.2 — one `character.rest` per player character, in order, so each is stamped and
	 * recorded on its own. A character the core refuses is counted out, so the toast never claims more
	 * than happened.
	 */
	async function callRest(rest: 'short' | 'long'): Promise<void> {
		let rested = 0;
		for (const character of party) {
			const ok = await dispatch({
				type: 'character.rest',
				actorId,
				payload: { characterId: character.id, rest },
			});
			if (ok) rested += 1;
		}
		if (rested > 0) Toaster.success(t('session.rest.called', { count: rested }));
	}

	return (
		<div>
			<SessionHeader
				workflow={workflow}
				sceneName={activeSceneName}
				sessionTitle={runtime.state.session.title}
				previewing={previewing}
				isDm={isDm}
				canStart={canStart}
				onSetWorkflow={setWorkflow}
				onStart={openStart}
				onEnd={() => setEndOpen(true)}
				onCallRest={() => setRestOpen(true)}
				flush={isLive}
			/>
			{!isLive && <StandbyStatus workflow={workflow} canStart={canStart} t={t} flush />}
			<EndSessionDialog
				open={endOpen}
				canReview={canReview}
				onClose={() => setEndOpen(false)}
				onReview={() => {
					setEndOpen(false);
					moveTo('recap');
				}}
				onConfirm={() => {
					setEndOpen(false);
					moveTo('idle');
				}}
			/>
			<StartSessionDialog
				open={startOpen}
				scenes={startableScenes}
				continueSceneId={continueSceneId}
				onClose={() => setStartOpen(false)}
				onConfirm={(choice) => {
					setStartOpen(false);
					start(choice);
				}}
			/>
			<CallRestDialog
				open={restOpen}
				partyCount={party.length}
				onClose={() => setRestOpen(false)}
				onConfirm={(rest) => {
					setRestOpen(false);
					void callRest(rest);
				}}
			/>
		</div>
	);
}

/**
 * The Session screen's rollable tables (RC-CAN-7.8, SCREENS_PARITY SE-16): draw a `dice-table`
 * object (`dice.roll-table`, recorded to the dice log) and pin or unpin it for quick reference.
 */
function TablesView() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { tables, draws, pins } = useTablesView();
	return (
		<TablesPanel
			tables={tables}
			draws={draws}
			pins={pins}
			isDm={isDm}
			previewing={previewing}
			onRoll={(table: TableView) =>
				void dispatch({
					type: 'dice.roll-table',
					actorId,
					payload: { tableItemId: table.id, label: table.title },
				})
			}
			onPin={(table: TableView) =>
				void dispatch(
					{
						type: 'session.pin-quick-reference',
						actorId,
						payload: { kind: 'dice-table', label: table.title, targetId: table.id },
					},
					t('session.tables.pinned'),
				)
			}
			onUnpin={(panelId: string) =>
				void dispatch(
					{ type: 'session.unpin-quick-reference', actorId, payload: { panelId } },
					t('session.tables.unpinned'),
				)
			}
		/>
	);
}

/**
 * The Session screen's handouts (RC-CAN-7.8, SCREENS_PARITY SE-17): push one to the players
 * (`session.deliver-handout`), revoke it, and mark one read.
 */
function HandoutsView() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { handouts, status } = useHandoutsView();
	const { startableScenes, activeSceneId, continueSceneId } = useSessionScenes();
	const players = usePlayers();
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');

	async function deliver(): Promise<void> {
		const heading = title.trim();
		if (!heading) return;
		// RC-SES-6.2 — a push works outside a session too, where no scene is active: it lands on the
		// scene a "Continue" start would resume, else the first scene the DM can see.
		const sceneId =
			activeSceneId ??
			startableScenes.find((scene) => scene.id === continueSceneId)?.id ??
			startableScenes[0]?.id ??
			null;
		if (!sceneId) {
			Toaster.warning(t('session.goLive.needsScene'));
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
					title: heading,
					sections: [{ heading, body: body.trim(), visibility: 'player-visible' as const }],
					sceneId,
					recipientActorIds: players.map((p) => p.id),
				},
			},
			t('projection.pushed', { title: heading, count: players.length }),
		);
		if (ok) {
			setTitle('');
			setBody('');
		}
	}

	return (
		<HandoutsPanel
			handouts={handouts}
			status={status}
			isDm={isDm}
			previewing={previewing}
			// Only DM-ness and preview gate the push: a missing scene or no players are said as toasts,
			// never a permanently greyed button nobody explains (RC-SES-6.2).
			canDeliver={isDm && !previewing}
			title={title}
			body={body}
			onTitle={setTitle}
			onBody={setBody}
			onDeliver={() => void deliver()}
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
	);
}

/**
 * The Session screen's now playing (RC-CAN-7.8, SCREENS_PARITY SE-18): the track, pause, resume,
 * stop and volume over `session.audio.*`.
 */
function NowPlayingView() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { audio, label } = useNowPlayingView();
	return (
		<AudioPanel
			audio={audio}
			trackLabel={label}
			isDm={isDm}
			previewing={previewing}
			onPause={() => dispatch({ type: 'session.audio.pause', actorId, payload: {} })}
			onResume={() => dispatch({ type: 'session.audio.resume', actorId, payload: {} })}
			onStop={() => dispatch({ type: 'session.audio.stop', actorId, payload: {} }, 'Audio stopped')}
			onVolume={(volume) =>
				dispatch({ type: 'session.audio.set-volume', actorId, payload: { volume } })
			}
		/>
	);
}

/**
 * The Session screen's stage and projection (RC-CAN-7.8, SCREENS_PARITY SE-19): the active map
 * (`session.set-active-map`), projecting it (`session.project-active-map`) and the per-player
 * projection row.
 */
function StageView() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { maps, activeMapId } = useStageView();
	const players = usePlayers();
	return (
		<StagePanel
			maps={maps}
			activeMapId={activeMapId}
			isDm={isDm}
			// RC-SES-6.2 — projecting works in every workflow state, so the live gate is held open.
			isLive
			previewing={previewing}
			onSelect={(mapId) =>
				dispatch({ type: 'session.set-active-map', actorId, payload: { mapId } }, 'Active map set')
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
	);
}

/**
 * The Session screen's campaign date (RC-CAN-7.8, SCREENS_PARITY SE-20): `session.set-campaign-date`
 * over the calendar continuity the Campaign timeline reads. DM only.
 */
function CampaignDateView() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { calendar, current } = useCampaignDateView();
	if (!isDm) return null;
	return (
		<CampaignDatePanel
			calendar={calendar}
			current={current}
			previewing={previewing}
			onSet={(date, ok) =>
				void dispatch({ type: 'session.set-campaign-date', actorId, payload: { date } }, ok)
			}
		/>
	);
}

/**
 * The Session screen's prep and recap (RC-CAN-7.8, SCREENS_PARITY SE-21): the continuity digest,
 * the session archives and, in Recap, recap authoring (`session.author-recap`). DM only.
 */
function PrepRecapView() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const digest = usePrepRecapDigest();
	const { archives, recapArchiveId } = useArchives();
	const maps = useMapList();
	if (!isDm) return null;
	return (
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
	);
}

/**
 * The Session screen's end-of-session capture (RC-CAN-7.8, SCREENS_PARITY SE-22, SE-39–SE-41). DM
 * only.
 */
function CaptureView() {
	const { t } = useI18n();
	const { runtime, actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { archives, recapArchiveId } = useArchives();
	const candidates = useCaptureCandidates();
	const campaignDate = useCampaignDateValue();

	/**
	 * RC-SES-4.1 — one capture writes TWO durable records through existing commands: the structured
	 * recap onto the session archive, then the `session-log` note. The note is created ONLY after the
	 * recap is accepted, so a rejected capture never leaves an orphan note, and a failure at either
	 * step says which half did not land.
	 */
	async function capture(submission: CaptureSubmission): Promise<boolean> {
		const { archiveId, title, markdown, capture: parts } = submission;
		const recap = await runtime.dispatch({
			type: 'session.author-recap',
			actorId,
			payload: {
				archiveId,
				markdown,
				happened: parts.happened,
				changes: parts.changes,
				followUps: parts.followUps,
			},
		});
		if (recap.status !== 'accepted') {
			Toaster.error(recap.rejection.message);
			return false;
		}
		const note = await runtime.dispatch({
			type: 'content.create-item',
			actorId,
			payload: {
				kind: 'note',
				title,
				body: markdown,
				visibility: 'dm-only',
				fields: {
					[VAULT_OBJECT_SUBTYPE_KEY]: SESSION_LOG_SUBTYPE,
					title,
					sessionArchiveId: archiveId,
					happened: parts.happened,
					changes: parts.changes,
					followUps: parts.followUps,
				},
				// Dating the note at the campaign's current date places it on the Campaign timeline. With
				// no date set there is nothing truthful to date it with, so it is left undated.
				...(campaignDate ? { dateFields: { occurred: campaignDate } } : {}),
			},
		});
		if (note.status !== 'accepted') {
			Toaster.error(t('session.capture.noteFailed'));
			return false;
		}
		Toaster.success(t('session.capture.saved'));
		return true;
	}

	if (!isDm) return null;
	return (
		<CapturePanel
			archives={archives}
			defaultArchiveId={recapArchiveId}
			candidates={candidates}
			hasCampaignDate={!!campaignDate}
			previewing={previewing}
			onCapture={capture}
			// RC-SES-4.2 — the continuity check's "Create": a DM-only quick-create NPC, named exactly as
			// the capture's prose named it.
			onQuickCreateNpc={(name) =>
				dispatch(
					{ type: 'character.quick-create', actorId, payload: { kind: 'npc', name } },
					t('session.capture.continuityCreated', { name }),
				)
			}
		/>
	);
}

/**
 * The Session screen's table roster (RC-CAN-7.8, SCREENS_PARITY SE-23): the live P2P peers and the
 * core presence, projected for this viewer.
 */
function RosterView() {
	const session = useSession();
	const presence = usePresence();
	return (
		<RosterPanel hosting={session.role === 'host'} peers={session.peers} presence={presence} />
	);
}

/** The Session screen's party (RC-CAN-7.8, SCREENS_PARITY SE-24): each PC with its hit points. */
function PartyView() {
	const { party } = useRoster();
	return <PartyPanel party={party} />;
}

/**
 * The Session screen's rest timeline (RC-CAN-7.8, SCREENS_PARITY SE-25). It draws nothing while no
 * rest has been taken, and the screen leaves it out of the layout until one is.
 */
function RestsView() {
	return <RestTimelinePanel entries={useRestLog()} />;
}

/**
 * The Session screen's "Schedule next session" (RC-CAN-7.8, SCREENS_PARITY SE-26): the host's
 * Google Calendar integration. DM only.
 */
function ScheduleView() {
	const { isDm } = useSessionSeat();
	return isDm ? <SchedulePanel /> : null;
}

/** The `view` setting's values (the `session` definition's "Shows" options) and what each draws. */
const SESSION_VIEWS: Readonly<Record<string, () => ReactElement | null>> = {
	strip: SessionStrip,
	console: SessionConsole,
	tables: TablesView,
	handouts: HandoutsView,
	'now-playing': NowPlayingView,
	stage: StageView,
	'campaign-date': CampaignDateView,
	'prep-recap': PrepRecapView,
	capture: CaptureView,
	roster: RosterView,
	party: PartyView,
	rests: RestsView,
	schedule: ScheduleView,
};
