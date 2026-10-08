import { useState } from 'react';
import { getSessionStatusStrip } from '@dndtools/core';
import { Toaster } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import type { BoardWidget } from '../../board-helpers';
import { Chip, Muted, StatPill, bodyWrap, cfg } from '../../widget-body-kit';
import {
	CallRestDialog,
	EndSessionDialog,
	SessionHeader,
	StandbyStatus,
	StartSessionDialog,
	type SessionStartChoice,
} from '../../../screens/session/Lifecycle';
import {
	useRoster,
	useSessionDispatch,
	useSessionScenes,
	useSessionSeat,
} from '../../../screens/session/useSessionView';
import { LiveReadout, LiveStats, StateMark } from './live';

/**
 * The `session` widget. Its default view is the Command Center status strip (RC-WID-4.1); its
 * `console` view is the Session screen's status row (RC-CAN-7.8, SCREENS_PARITY SE-01–SE-06 and the
 * SE-30–SE-32 dialogs): the session's name and scene, the Standby / Prep / Live / Recap control,
 * Start session, Call a rest and End session, and the dialogs those open.
 */
export function SessionBody({ widget }: { widget: BoardWidget }) {
	return cfg<string>(widget, 'view') === 'console' ? <SessionConsole /> : <SessionStrip />;
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
