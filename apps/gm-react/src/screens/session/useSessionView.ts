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
		// Workspace screens are never session scenes, including the legacy DM-only home board.
		const workspaces = new Set([findHomeScreen(scenes)?.id, findSessionScreen(scenes)?.id]);
		const startableScenes = visible
			.filter(
				(s) =>
					!s.isTemplate &&
					!workspaces.has(s.id) &&
					!(s.id === commandCenter.homeSceneId && s.visibility === 'dm-only'),
			)
			.map((s) => ({ id: s.id, name: s.name, shareable: s.visibility !== 'dm-only' }));
		const continueSceneId =
			startableScenes.find((s) => s.id === activeSceneId && s.shareable)?.id ?? null;
		return {
			startableScenes,
			activeSceneId,
			activeSceneName: visible.find((s) => s.id === activeSceneId)?.name ?? null,
			continueSceneId,
			defaultStartSceneId:
				continueSceneId ??
				(startableScenes.find((s) => s.shareable) ?? startableScenes[0])?.id ??
				null,
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
/** The kind of thing a reviewable change touched, as the Prep and recap list names it. */
export type ReviewChangeKind =
	| 'character'
	| 'item'
	| 'scene'
	| 'map'
	| 'calendar'
	| 'session'
	| 'combat'
	| 'audio'
	| 'access'
	| 'other';

/** One recent change the Prep and recap panel lists (RC-POL-1.4, §1.7). */
export interface ReviewChange {
	id: string;
	kind: ReviewChangeKind;
	/** The thing's name as this viewer may read it, or null when it is gone or not visible. */
	name: string | null;
	verb: 'created' | 'edited' | 'deleted' | 'changed';
	at: string;
}

/** How many recent changes the panel counts and lists, as the core digest bounds them. */
const REVIEW_LIMIT = 10;

const REVIEW_KIND: Readonly<Record<string, ReviewChangeKind>> = {
	character: 'character',
	'character-draft': 'character',
	'content-item': 'item',
	calendar: 'calendar',
	handout: 'item',
	scene: 'scene',
	map: 'map',
	session: 'session',
	combat: 'combat',
	encounter: 'combat',
	'session-audio': 'audio',
	'audio-asset': 'audio',
	'audio-source': 'audio',
	'audio-preset': 'audio',
	'audio-association': 'audio',
	'audio-automation-rule': 'audio',
	'permission-grant': 'access',
	'permission-actor': 'access',
	'player-group': 'access',
};

/** Writes that are bookkeeping rather than something a GM reviews (see `usePrepRecapDigest`). */
const NOT_REVIEWED = new Set(['content-history', 'command-center', 'presence', 'diagnostics']);

function reviewVerb(opType: string): ReviewChange['verb'] {
	const action = opType.slice(opType.indexOf('.') + 1);
	if (/^(create|quick-create|finalize|import|define)/.test(action)) return 'created';
	if (/^(delete|archive)/.test(action)) return 'deleted';
	if (/^(update|rename|set|edit|add|remove|reorder|move)/.test(action)) return 'edited';
	return 'changed';
}

/**
 * SES-009 — the prep/recap digest, with the recent changes a GM would actually review (RC-POL-1.4,
 * roadmap §1.7). The core counts every operation in the log, and on an empty vault the log holds
 * only the app's own setup: opening Session provisions the Session screen, the Command Center its
 * home screen and puts the first-session guide on it. A fresh vault read "2 recent changes to
 * review" for writes nobody made. The default screens' provisioning operations and the guide's
 * placement on them (not later edits), the home pointer, presence and diagnostics,
 * and the revision records a content edit writes beside itself (one edit, two operations) are left
 * out. The rest are named through the same actor-scoped reads the other panels use, so the list
 * never shows a name this viewer could not open elsewhere.
 */
export function usePrepRecapDigest() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const { session, content, maps, characters, permissions, sync, scenes, commandCenter } =
		runtime.state;
	return useMemo(() => {
		const digest = getPrepRecapDigest(
			session,
			content,
			maps,
			characters,
			permissions,
			sync,
			actorId,
			session.workflow === 'recap' ? 'recap' : 'prep',
			// Read past the bound: the setup writes filtered out below must not eat into it.
			{ recentChangeLimit: REVIEW_LIMIT * 5 },
		);
		const setup = new Set([
			commandCenter.homeSceneId,
			findHomeScreen(scenes)?.id,
			findSessionScreen(scenes)?.id,
		]);
		const provisioning = (change: (typeof digest.recentChanges)[number]) =>
			change.entityType === 'scene' &&
			setup.has(change.entityId) &&
			(change.opType === 'scene.create' || change.opType === 'command-center.bind-default-map');
		// RC-UX-6.3 puts the first-session guide (`getting-started`, the core's
		// FIRST_SESSION_GUIDE_WIDGET_TYPE) on a fresh home just after provisioning it. The digest's rows
		// carry no payload, so the guide's write is the home's first after its creation, while the
		// guide is still on it.
		const home = findHomeScreen(scenes);
		const homeRows = digest.recentChanges.filter((c) => c.entityId === home?.id).reverse();
		const created = homeRows.findIndex((c) => c.opType === 'scene.create');
		const placed =
			created < 0 ? undefined : homeRows.slice(created + 1).find((c) => !provisioning(c));
		const guidePlacement =
			placed?.opType === 'scene.add-widget' &&
			home?.widgets.some((widget) => widget.type === 'getting-started')
				? placed.operationId
				: null;
		const names = new Map<string, string>();
		for (const c of listCharactersForActor(characters, permissions, actorId))
			names.set(c.id, c.name);
		for (const i of getContentItemsForActor(content, permissions, actorId))
			names.set(i.id, i.title);
		for (const s of listScenesForActor(scenes, permissions, actorId)) names.set(s.id, s.name);
		for (const m of listMapsForActor(maps, permissions, actorId)) names.set(m.id, m.name);
		// The campaign calendar is the GM's own (the Campaign date panel reads it the same way).
		for (const calendar of Object.values(content.calendars)) names.set(calendar.id, calendar.name);
		// One row per changed thing, at its newest write: three widgets added to one scene are one
		// scene to look at again, not three.
		const seen = new Set<string>();
		const recentChanges = digest.recentChanges
			.filter((change) => {
				if (NOT_REVIEWED.has(change.entityType)) return false;
				if (change.operationId === guidePlacement || provisioning(change)) return false;
				const key = `${change.entityType}:${change.entityId}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.slice(0, REVIEW_LIMIT);
		const reviewChanges: ReviewChange[] = recentChanges.map((change) => ({
			id: change.operationId,
			kind: REVIEW_KIND[change.entityType] ?? 'other',
			name: names.get(change.entityId) ?? null,
			verb: reviewVerb(change.opType),
			at: change.at,
		}));
		return { ...digest, recentChanges, reviewChanges };
	}, [session, content, maps, characters, permissions, sync, scenes, commandCenter, actorId]);
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
