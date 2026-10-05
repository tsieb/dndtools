import {
	VAULT_OBJECT_SUBTYPE_KEY,
	getContentItemsForActor,
	isDefaultScreen,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	type Actor,
	type CoreStateSlice,
} from '@dndtools/core';
import { translate, type MessageKey, type MessageValues } from '../../i18n';
import { LIBRARY } from '../nav';
import type { WidgetDataRow } from './dataEnvironment';

/**
 * RC-CAN-7.6 — the three query sources the Command Center's parts read. Like every other source
 * they are mappings over actor-scoped core reads (`listScenesForActor`, `listCharactersForActor`,
 * `listMapsForActor`, `getContentItemsForActor`), so a viewer is only ever told about what they may
 * already list, and the counts are the counts of what they can see.
 *
 * They are the hub's own reads, moved out of `CommandCenter.tsx` unchanged, so the parts say what the
 * page said: the same resolution of the scene to resume, the same "table scenes" (no templates, no
 * default screens), the same per-section counts. Their text is rendered through `translate` — the
 * viewer's catalog when the host passes one, English otherwise — because these rows are prose the
 * page used to translate, not data a GM typed.
 */

export type HomeSource = 'resume' | 'table-scenes' | 'library-sections';

export type HomeTranslate = (key: MessageKey, values?: MessageValues) => string;

export const englishTranslate: HomeTranslate = (key, values) => translate('en', key, values);

interface HomeSourceResult {
	rows: WidgetDataRow[];
	header: string | null;
	emptyLabel: string;
}

/** The intent the hero's primary follows for each resume outcome (`WidgetDataRow.meta`). */
export type ResumeIntentId = 'enter-gm-screen' | 'enter-scene' | 'open-scene' | 'open-library';

function tableScenes(state: CoreStateSlice, actorId: string) {
	return listScenesForActor(state.scenes, state.permissions, actorId).filter(
		(scene) => !scene.isTemplate && !isDefaultScreen(state, scene.id),
	);
}

export function resolveHomeSource(
	state: CoreStateSlice,
	actor: Actor,
	source: HomeSource,
	t: HomeTranslate,
): HomeSourceResult {
	const actorId = actor.id;
	// Liveness is the workflow, never `activeSceneId`: `session.recover` restores a scene id into
	// recap, and the hub must not pulse "Session live" over a read-only archive review (CC-01).
	const live = state.session.workflow === 'active';
	switch (source) {
		case 'resume': {
			const all = listScenesForActor(state.scenes, state.permissions, actorId);
			// Resolved against the UNFILTERED list on purpose: "Go live" falls back to the GM screen's
			// own scene, which is not a table scene, and the hero must still name and open it (CC-06).
			const target =
				all.find((scene) => scene.id === state.session.activeSceneId) ??
				tableScenes(state, actorId)[0] ??
				null;
			const isGmScreen = target !== null && target.id === state.commandCenter.homeSceneId;
			const party = listCharactersForActor(state.characters, state.permissions, actorId).filter(
				(character) => character.kind === 'pc',
			).length;
			const subtitle = t(live ? 'home.liveSubtitle' : 'home.idleSubtitle');
			const meta: ResumeIntentId = !target
				? 'open-library'
				: isGmScreen
					? 'enter-gm-screen'
					: live
						? 'enter-scene'
						: 'open-scene';
			return {
				header: null,
				emptyLabel: t('home.noScenes'),
				rows: [
					{
						id: target?.id ?? 'none',
						// With no session running the heading never names a scene: a GM reads a scene name
						// there as "the current scene". Nor does it name one that is not the live scene (a
						// viewer who cannot see the live scene gets the fallback, not another scene).
						primary:
							(live && target?.id === state.session.activeSceneId ? target.name : null) ??
							t('home.yourCampaign'),
						secondary: party ? `${subtitle} · ${t('home.partyCount', { count: party })}` : subtitle,
						meta,
						active: live,
					},
				],
			};
		}
		case 'table-scenes': {
			const activeId = live ? state.session.activeSceneId : null;
			return {
				header: null,
				emptyLabel: t('home.noScenes'),
				rows: tableScenes(state, actorId).map((scene) => ({
					id: scene.id,
					primary: scene.name,
					secondary: `${scene.tags[0] ?? t('home.scene.tag')} · ${t('home.scene.widgets', {
						count: state.scenes.scenes[scene.id]?.widgets.length ?? 0,
					})}`,
					// A scene is live only while the session is (CC-09).
					active: scene.id === activeId,
					visibility: scene.visibility,
					thumbnail: state.scenes.scenes[scene.id]?.visualSettings.background,
				})),
			};
		}
		case 'library-sections': {
			const characters = listCharactersForActor(state.characters, state.permissions, actorId);
			const pcs = characters.filter((character) => character.kind === 'pc').length;
			const items = getContentItemsForActor(state.content, state.permissions, actorId);
			// Quest and faction counts come from vault objects by subtype, not from notes (CC-13).
			const objects = (subtype: string) =>
				items.filter(
					(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === subtype,
				).length;
			const counts: Record<string, string> = {
				characters: t('home.count.characters', { pcs, npcs: characters.length - pcs }),
				atlas: t('home.count.maps', {
					count: listMapsForActor(state.maps, state.permissions, actorId).length,
				}),
				campaign: t('home.count.campaign', {
					threads: objects('quest'),
					factions: objects('faction'),
				}),
				knowledge: t('home.count.notes', {
					count: items.filter((item) => item.kind === 'note').length,
				}),
			};
			return {
				header: null,
				emptyLabel: '',
				rows: LIBRARY.map((section) => ({
					id: section.id,
					primary: t(section.labelKey),
					secondary: counts[section.id] ?? (section.subKey ? t(section.subKey) : ''),
					icon: section.icon,
				})),
			};
		}
	}
}
