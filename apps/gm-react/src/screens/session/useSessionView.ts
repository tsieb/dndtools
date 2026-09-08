import { useMemo } from 'react';
import {
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
	listAudioAssetsForActor,
	listAudioSourceClassificationsForActor,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	resourcesOf,
	restKindOfLedgerEntry,
	type CalendarDefinition,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import { type CaptureCandidate } from './Capture';
import { type RestTimelineEntry } from './Lifecycle';
import { latestDrawsByTable, tablesFromContent } from './Tables';

/**
 * Everything the Session screen reads out of the core, derived in one actor-scoped pass.
 *
 * A pure move out of `index.tsx` (RC-ENG-2.2 — the screen had grown past the RC-STB-2.7 file-size
 * limit): this is the `useMemo` that lived inline, unchanged, with the same `[runtime.state,
 * actorId]` dependencies. Every read is actor-filtered, so previewing as a player projects that
 * player's view.
 */
export function useSessionView(runtime: ReturnType<typeof useRuntime>, actorId: string) {
	return useMemo(() => {
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
		// RC-SES-4.1 — what the end-of-session capture can mark as CHANGED: the roster and the visible
		// vault items, as REFERENCES (type + id + the label captured), never copies. Both lists are
		// actor-filtered reads, so previewing as a player offers a player's view of the campaign.
		const contentItems = getContentItemsForActor(runtime.state.content, perms, actorId);
		const captureCandidates: CaptureCandidate[] = [
			...characters.map((c) => ({
				entityType: 'character',
				entityId: c.id,
				label: c.name,
			})),
			...contentItems.map((item) => ({
				entityType: 'content-item',
				entityId: item.id,
				label: item.title,
			})),
		];
		// RC-SES-2.3 — the drawable `dice-table` objects, their latest draw out of the roll history, and
		// the quick-reference pins that point at them. All three are the same actor-scoped reads the
		// rest of this screen uses, so previewing as a player projects that player's tables.
		const tables = tablesFromContent(contentItems);
		const tableDraws = latestDrawsByTable(dice);
		const quickPins = getQuickReferencePanelsForActor(
			session,
			runtime.state.content,
			runtime.state.characters,
			perms,
			actorId,
		);
		// RC-CHR-1.2 — the rests taken so far, read back from each character's durable expenditure
		// history. The records are pulled only for characters the ACTOR-SCOPED roster already returned,
		// so the panel can never surface a rest for a character this viewer may not see.
		const restLog: RestTimelineEntry[] = characters
			.flatMap((character) => {
				const record = runtime.state.characters.characters[character.id];
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
			.slice(0, 12);
		// The RAW campaign date (the formatted one is for display): dating the session-log note with it
		// is what puts the note on the Campaign timeline, which reads dated items in the same calendar.
		const campaignDateValue = session.calendarContinuity.currentDate ?? null;
		return {
			tracker,
			dice,
			characters,
			party: characters.filter((c) => c.kind === 'pc'),
			// RC-SES-1.3 — the start flow picks the scene explicitly, so it needs the (actor-scoped,
			// non-template) scenes by name rather than the single resolved active one.
			startableScenes: scenes.filter((s) => !s.isTemplate).map((s) => ({ id: s.id, name: s.name })),
			activeSceneName: scenes.find((s) => s.id === activeSceneId)?.name ?? null,
			activeSceneId,
			handouts: getHandoutsForActor(session, perms, actorId),
			handoutStatus: getHandoutStatusForDm(session, perms, actorId),
			audio: audioView,
			audioLabel,
			maps: listMapsForActor(runtime.state.maps, perms, actorId),
			activeMapId: session.activeMap?.mapId ?? null,
			// RC-SES-3.5 — the encounter builder seeds ambush initiative from the marching order.
			marchingOrder: getPartyOverviewForActor(runtime.state.characters, perms, actorId)
				.marchingOrder,
			players: Object.values(perms.actors).filter((a) => a.role === 'player'),
			calendar,
			campaignDate,
			digest,
			archives,
			recapArchiveId: session.recapArchiveId,
			captureCandidates,
			campaignDateValue,
			restLog,
			tables,
			tableDraws,
			quickPins,
		};
	}, [runtime.state, actorId]);
}
