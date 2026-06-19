/**
 * Widget template data resolver. Maps a widget's declared `dataQueries` onto the existing
 * actor-FILTERED Processing-Core read models, returning normalized rows the generic templates
 * (data-table / status-list) render. The GUI never decides visibility here — every source is a
 * core query that has already redacted hidden entities for the viewing actor (no-leak boundary).
 */
import {
	getCombatTrackerForActor,
	getContentItemsForActor,
	getPartyOverviewForActor,
	listMapsForActor,
	listScenesForActor,
	type WidgetDataQueryDefinition,
} from '@dndtools/core';
import type { WidgetBinding } from '@dndtools/core';
import type { SceneRuntime } from '$lib/canvas-runtime';

export interface WidgetDataRow {
	id: string;
	primary: string;
	secondary?: string;
	meta?: string;
	href?: string;
	/** Marks the active/current row (e.g. the combatant whose turn it is). */
	active?: boolean;
}

export interface WidgetDataResult {
	rows: WidgetDataRow[];
	emptyLabel: string;
	/** Optional summary line shown above the rows (e.g. "Round 2 · turn 1 of 4"). */
	header?: string;
}

const EMPTY: WidgetDataResult = { rows: [], emptyLabel: 'Nothing here yet.' };

export function resolveWidgetData(
	runtime: SceneRuntime,
	actorId: string,
	query: WidgetDataQueryDefinition,
	binding?: WidgetBinding | null,
	config?: Record<string, unknown> | null,
): WidgetDataResult {
	const { state } = runtime;
	switch (query.source) {
		case 'selected-scene': {
			const scenes = listScenesForActor(state.scenes, state.permissions, actorId).filter(
				(scene) => !scene.isTemplate,
			);
			return {
				emptyLabel: 'No scenes yet.',
				rows: scenes.map((scene) => ({
					id: scene.id,
					primary: scene.name,
					secondary: scene.updatedAt,
					meta: scene.visibility,
					href: `/scene/${scene.id}/`,
				})),
			};
		}
		case 'visible-characters': {
			const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
			return {
				emptyLabel: 'No party members yet.',
				rows: party.members.map((member) => ({
					id: member.characterId,
					primary: member.name,
					secondary: `HP ${member.hp}/${member.maxHp} · AC ${member.ac}`,
					meta: member.visibility,
					href: '/characters/',
				})),
			};
		}
		case 'maps': {
			const maps = listMapsForActor(state.maps, state.permissions, actorId);
			return {
				emptyLabel: 'No maps yet.',
				rows: maps.map((map) => ({ id: map.id, primary: map.name, href: '/atlas/' })),
			};
		}
		case 'notes':
		case 'content-objects': {
			const items = getContentItemsForActor(state.content, state.permissions, actorId)
				.slice()
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			return {
				emptyLabel: 'No notes yet.',
				rows: items.map((item) => ({
					id: item.id,
					primary: item.title,
					secondary: item.updatedAt,
					meta: item.kind,
					href: '/knowledge/',
				})),
			};
		}
		case 'current-combatants': {
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const header =
				tracker.status === 'running'
					? `Round ${tracker.round} · turn ${tracker.turn + 1} of ${tracker.combatants.length}`
					: 'No combat running';
			// The initiative tracker's `showHp` toggle (default on) appends HP to each row. HP is read
			// from the actor-FILTERED tracker view, so a combatant whose resources are withheld for this
			// viewer (`resources: null`) simply shows no HP — the toggle can never leak hidden vitals.
			const showHp = config?.showHp !== false;
			return {
				emptyLabel: 'No combatants in the tracker.',
				header,
				rows: tracker.combatants.map((combatant) => {
					const parts: string[] = [];
					if (combatant.statBlock?.initiative != null) {
						parts.push(`init ${combatant.statBlock.initiative}`);
					}
					if (showHp && combatant.resources) {
						parts.push(`HP ${combatant.resources.hp}/${combatant.resources.maxHp}`);
					}
					return {
						id: combatant.id,
						primary: combatant.name,
						secondary: parts.length > 0 ? parts.join(' · ') : undefined,
						active: combatant.isActive,
					};
				}),
			};
		}
		case 'binding': {
			if (!binding) return { rows: [], emptyLabel: 'No data source bound.' };
			return {
				emptyLabel: 'No data source bound.',
				rows: [
					{
						id: binding.source.entityId,
						primary: binding.source.entityId,
						meta: binding.source.entityType,
					},
				],
			};
		}
		case 'session-state':
			return {
				emptyLabel: '',
				rows: [
					{ id: 'workflow', primary: 'Workflow', secondary: state.session.workflow },
				],
			};
		default:
			return EMPTY;
	}
}
