import { useMemo } from 'react';
import {
	EMPTY_PRESENCE_STATE,
	allowedTransitionsFrom,
	getCalendarContinuityForActor,
	getCombatTrackerForActor,
	getContentItemsForActor,
	getDiceHistoryForActor,
	getHandoutsForActor,
	getHandoutStatusForDm,
	getPartyOverviewForActor,
	getPrepRecapDigest,
	getQuickReferencePanelsForActor,
	getSessionAudioView,
	findHomeScreen,
	findSessionScreen,
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	projectSessionPresence,
	resourcesOf,
	restKindOfLedgerEntry,
	type CalendarDefinition,
	type CommandResult,
	type SessionWorkflowState,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { type CaptureCandidate } from './Capture';
import { type RestTimelineEntry } from './Lifecycle';
import { latestDrawsByTable, tablesFromContent } from './Tables';

/**
 * What the Session screen's widgets read out of the core (RC-CAN-7.8). Each widget calls only the
 * hook for its own row, so a widget placed alone on another screen reads only what it shows — and the
 * builder parity gate (`app/widgets/parity.ts`) charges each widget only with the reads it makes.
 * Every read is actor-filtered, so previewing as a player projects that player's view.
 */

type Runtime = ReturnType<typeof useRuntime>;
type Command = Parameters<Runtime['dispatch']>[0];

/** Who is looking and in what state the session is: the gates every Session widget shares. */
export function useSessionSeat() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const workflow = runtime.state.session.workflow;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	return {
		runtime,
		actorId,
		workflow,
		isLive: workflow === 'active',
		// `recap → active` is not a legal core transition (session-workflow.ts), so a start from
		// Recap is a control that could only ever fail.
		canStart: allowedTransitionsFrom(workflow as SessionWorkflowState).includes('active'),
		canReview: allowedTransitionsFrom(workflow as SessionWorkflowState).includes('recap'),
		previewing: !!runtime.preview,
		isDm,
	};
}

/**
 * Dispatch one command and say what happened: the optional success toast, else the core's rejection.
 * Resolves whether the core accepted it.
 */
export function useSessionDispatch() {
	const runtime = useRuntime();
	return async (command: Command, ok?: string): Promise<boolean> => {
		const result: CommandResult = await runtime.dispatch(command);
		if (result.status === 'accepted') {
			if (ok) Toaster.success(ok);
			return true;
		}
		Toaster.error(result.rejection.message);
		return false;
	};
}

/**
 * The scenes a session can run on, by name (actor-scoped, never a template or a GM workspace), the
 * scene a "Continue" start resumes, and the live one. RC-SES-1.3 — the start flow picks the scene
 * explicitly, so it needs them all rather than the single resolved active one.
 */
export function useSessionScenes() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { scenes, permissions, commandCenter, session } = runtime.state;
	return useMemo(() => {
		const visible = listScenesForActor(scenes, permissions, actorId);
		const activeSceneId = session.activeSceneId;
		// RC-CAN-7.6/7.8: the home and Session screens are the GM's own workspaces, not somewhere to
		// run play from. The GM screen's board stays startable, as it always was.
		const workspaces = new Set([findHomeScreen(scenes)?.id, findSessionScreen(scenes)?.id]);
		return {
			startableScenes: visible
				.filter((s) => !s.isTemplate && !workspaces.has(s.id))
				.map((s) => ({ id: s.id, name: s.name })),
			activeSceneId,
			activeSceneName: visible.find((s) => s.id === activeSceneId)?.name ?? null,
			/** The scene a "Continue" start resumes: the session's own scene, else the GM screen. */
			continueSceneId: activeSceneId ?? commandCenter.homeSceneId ?? null,
		};
	}, [scenes, permissions, commandCenter, session, actorId]);
}

/** The registered players: who a push or a projection goes to. */
export function usePlayers() {
	const runtime = useRuntime();
	const actors = runtime.state.permissions.actors;
	return useMemo(() => Object.values(actors).filter((a) => a.role === 'player'), [actors]);
}

/** The roster: every character this viewer may see, and the party (the player characters). */
export function useRoster() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { characters, permissions } = runtime.state;
	return useMemo(() => {
		const all = listCharactersForActor(characters, permissions, actorId);
		return { characters: all, party: all.filter((c) => c.kind === 'pc') };
	}, [characters, permissions, actorId]);
}

/**
 * The combat tracker (`getCombatTrackerForActor`), and what the encounter builder seeds from: the
 * staged map and, RC-SES-3.5, ambush initiative from the marching order.
 */
export function useCombatView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, permissions, characters } = runtime.state;
	return useMemo(
		() => ({
			tracker: getCombatTrackerForActor(session.combat, permissions, actorId),
			activeMapId: session.activeMap?.mapId ?? null,
			marchingOrder: getPartyOverviewForActor(characters, permissions, actorId).marchingOrder,
		}),
		[session, permissions, characters, actorId],
	);
}

/** The session's roll history, actor-filtered. */
export function useDiceView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, permissions } = runtime.state;
	return useMemo(
		() => getDiceHistoryForActor(session, permissions, actorId),
		[session, permissions, actorId],
	);
}

/**
 * RC-SES-2.3 — the drawable `dice-table` objects, their latest draw out of the roll history, and the
 * quick-reference pins that point at them.
 */
export function useTablesView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, content, characters, permissions } = runtime.state;
	return useMemo(() => {
		const dice = getDiceHistoryForActor(session, permissions, actorId);
		return {
			tables: tablesFromContent(getContentItemsForActor(content, permissions, actorId)),
			draws: latestDrawsByTable(dice),
			pins: getQuickReferencePanelsForActor(session, content, characters, permissions, actorId),
		};
	}, [session, content, characters, permissions, actorId]);
}

/** The handouts delivered to this viewer, and (for the DM) who has read them. */
export function useHandoutsView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, permissions } = runtime.state;
	return useMemo(
		() => ({
			handouts: getHandoutsForActor(session, permissions, actorId),
			status: getHandoutStatusForDm(session, permissions, actorId),
		}),
		[session, permissions, actorId],
	);
}

/**
 * What is playing, with the track resolved to a friendly title (asset title, else source display
 * name): the track view carries only ids, so a raw uuid would otherwise show.
 */
export function useNowPlayingView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { audio, session, permissions } = runtime.state;
	return useMemo(() => {
		const view = getSessionAudioView(audio, session.audioPlayback, permissions, actorId);
		const track = view.track;
		const label = track
			? ((track.assetId
					? listAudioAssetsForActor(audio, permissions, actorId).find((a) => a.id === track.assetId)
							?.title
					: undefined) ??
				listAudioSourceClassificationsForActor(audio, permissions, actorId).find(
					(s) => s.sourceId === track.sourceId,
				)?.displayName ??
				track.assetId ??
				track.sourceId)
			: null;
		return { audio: view, label };
	}, [audio, session, permissions, actorId]);
}

/** The maps this viewer may see. */
export function useMapList() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { maps, permissions } = runtime.state;
	return useMemo(() => listMapsForActor(maps, permissions, actorId), [maps, permissions, actorId]);
}

/** The maps this viewer may stage, and the one staged. */
export function useStageView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { maps, session, permissions } = runtime.state;
	return useMemo(
		() => ({
			maps: listMapsForActor(maps, permissions, actorId),
			activeMapId: session.activeMap?.mapId ?? null,
		}),
		[maps, session, permissions, actorId],
	);
}

/**
 * SES-012 — the campaign calendar and its current date, formatted (the Campaign timeline reads the
 * same view) and raw: dating the session-log note with the raw date is what puts it on the timeline.
 */
export function useCampaignDateView() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, content, maps, permissions } = runtime.state;
	return useMemo(
		() => ({
			calendar: (Object.values(content.calendars)[0] ?? null) as CalendarDefinition | null,
			current: getCalendarContinuityForActor(session, content, maps, permissions, actorId, 'long')
				.currentDate,
			value: session.calendarContinuity.currentDate ?? null,
		}),
		[session, content, maps, permissions, actorId],
	);
}

/** The campaign's current date, raw: what a session-log note is dated with. */
export function useCampaignDateValue() {
	const runtime = useRuntime();
	return runtime.state.session.calendarContinuity.currentDate ?? null;
}

/** The durable session archives, newest first, and the one recap authoring writes onto. */
export function useArchives() {
	const runtime = useRuntime();
	const { session } = runtime.state;
	return useMemo(
		() => ({
			archives: Object.values(session.archives).sort((a, b) =>
				b.archivedAt.localeCompare(a.archivedAt),
			),
			recapArchiveId: session.recapArchiveId,
		}),
		[session],
	);
}

/**
 * SES-009 — the prep/recap continuity digest (DM-only: a non-DM receives an EMPTY digest). In
 * `recap` it looks back at the just-archived session; every other phase preps forward.
 */
export function usePrepRecapDigest() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, content, maps, characters, permissions, sync } = runtime.state;
	return useMemo(
		() =>
			getPrepRecapDigest(
				session,
				content,
				maps,
				characters,
				permissions,
				sync,
				actorId,
				session.workflow === 'recap' ? 'recap' : 'prep',
			),
		[session, content, maps, characters, permissions, sync, actorId],
	);
}

/**
 * RC-SES-4.1 — what the end-of-session capture can mark as CHANGED: the roster and the visible vault
 * items, as REFERENCES (type + id + the label captured), never copies.
 */
export function useCaptureCandidates(): CaptureCandidate[] {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { characters, content, permissions } = runtime.state;
	return useMemo(
		() => [
			...listCharactersForActor(characters, permissions, actorId).map((c) => ({
				entityType: 'character',
				entityId: c.id,
				label: c.name,
			})),
			...getContentItemsForActor(content, permissions, actorId).map((item) => ({
				entityType: 'content-item',
				entityId: item.id,
				label: item.title,
			})),
		],
		[characters, content, permissions, actorId],
	);
}

/**
 * RC-CHR-1.2 — the rests taken so far, read back from each character's durable expenditure history,
 * only for characters the ACTOR-SCOPED roster returned, newest first.
 */
export function useRestLog(): RestTimelineEntry[] {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { characters, permissions } = runtime.state;
	return useMemo(
		() =>
			listCharactersForActor(characters, permissions, actorId)
				.flatMap((character) => {
					const record = characters.characters[character.id];
					if (!record) return [];
					return resourcesOf(record)
						.ledger.filter((entry) => entry.kind === 'rest')
						.map((entry) => ({
							id: entry.id,
							characterName: character.name,
							label: entry.label,
							at: entry.at,
							rest: restKindOfLedgerEntry(entry) ?? ('short' as const),
						}));
				})
				.sort((a, b) => b.at.localeCompare(a.at))
				.slice(0, 12),
		[characters, permissions, actorId],
	);
}

/**
 * COLLAB-004 — the ephemeral core presence, projected for this viewer (fail closed: only registered
 * participants surface). Written by `session.set-presence`, which the P2P host applies whenever a
 * connected player's presence beat arrives; never persisted.
 */
export function usePresence() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { presence, permissions } = runtime.state;
	return useMemo(() => {
		const projection = projectSessionPresence(
			presence ?? EMPTY_PRESENCE_STATE,
			permissions,
			actorId,
		);
		return new Map(projection.visible.map((entry) => [entry.actorId, entry]));
	}, [presence, permissions, actorId]);
}
