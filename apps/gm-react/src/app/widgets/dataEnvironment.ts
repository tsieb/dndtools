import {
	getCombatTrackerForActor,
	getContentItemsForActor,
	getPartyOverviewForActor,
	hasDmAuthority,
	listMapsForActor,
	listScenesForActor,
	type CoreStateSlice,
	type WidgetComputedFieldDefinition,
	type WidgetDataQueryDefinition,
	type WidgetDefinition,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { BoardWidget } from '../board-helpers';

/**
 * dataEnvironment — what a TEMPLATE widget is allowed to see (RC-WID-1.2).
 *
 * A `template` widget declares `dataQueries` (one of eight named sources) and `computedFields`
 * instead of shipping code. This module is the ONLY place those declarations turn into values, and
 * it does so by calling the actor-filtered core reads (`*ForActor`) and rendering whatever they
 * return. It never reads a raw state slice and filters it itself: the core decides what a player
 * sees, so a template can no more leak a hidden character than the party screen can (Contract 3 /
 * CANVAS-009).
 *
 * On top of that filtering it enforces the declaration's OWN two gates, which the core queries know
 * nothing about:
 *
 * - `audience: 'dm'` — a query the package author marked as DM material yields no rows at all to a
 *   non-DM viewer, even when the underlying read would have returned some. Fail closed.
 * - `requiredCapability: 'manager'` — the same, for a query that declares it needs the campaign
 *   manager. `operator`/`viewer` are open to any known actor.
 *
 * A withheld query is not silently empty: it comes back with `withheld` set, so the template can say
 * "not shown here" rather than "nothing yet" — a false "nothing yet" is the dishonest failure this
 * repo forbids.
 *
 * It is a pure function of (state, actorId, definition, widget) so a fixture package can be resolved
 * in a unit test with no runtime, no DOM and no storage; `useWidgetTemplateData` is the thin hook
 * the render slot uses in the app.
 */

/** One normalized row. Every template reads this shape, whatever source produced it. */
export interface WidgetDataRow {
	id: string;
	/** The row's name — the only field a template is guaranteed to have. */
	primary: string;
	/** A supporting detail line (HP, timestamp, workflow phase…). */
	secondary?: string;
	/** A short trailing tag: visibility, kind, status. */
	meta?: string;
	/** A numeric measure, when the source has one (HP, counts). Drives Chart/Tracker. */
	value?: number;
	/** The measure's ceiling, when there is one (max HP). */
	max?: number;
	/** The current/active row — the combatant whose turn it is, the active scene. */
	active?: boolean;
}

/** Why a query returned nothing on purpose. `null` means the query really ran. */
export type WidgetQueryWithheldReason = 'audience' | 'capability';

export interface WidgetQueryResult {
	/** The declaration's id, so a computed field can name its inputs. */
	id: string;
	label: string;
	source: WidgetDataQueryDefinition['source'];
	rows: WidgetDataRow[];
	/** A summary line the source knows and the rows do not (e.g. "Round 2 · turn 1 of 4"). */
	header: string | null;
	/** What to say when there are no rows and nothing was withheld. Sentence case. */
	emptyLabel: string;
	withheld: WidgetQueryWithheldReason | null;
}

export interface WidgetComputedValue {
	id: string;
	label: string;
	valueType: WidgetComputedFieldDefinition['valueType'];
	value: string | number | boolean | unknown[] | Record<string, unknown>;
	/** The value formatted for display, so every template prints a computed field the same way. */
	display: string;
}

export interface WidgetTemplateData {
	queries: WidgetQueryResult[];
	computed: WidgetComputedValue[];
	/**
	 * The query a single-source template draws: the first declared one. Null when the definition
	 * declares no queries at all (a template widget that is pure configuration, e.g. a message card).
	 */
	primary: WidgetQueryResult | null;
	/** Whether the viewing actor holds DM authority. Templates use it for wording, never for filtering. */
	isDm: boolean;
}

/** Copy for a query this viewer is not the audience for. Honest, and not an error. */
export const WITHHELD_COPY: Record<WidgetQueryWithheldReason, string> = {
	audience: 'DM only — not shown for this viewer.',
	capability: 'Needs campaign manager access.',
};

const EMPTY_DATA: WidgetTemplateData = { queries: [], computed: [], primary: null, isDm: false };

function row(
	id: string,
	primary: string,
	rest: Omit<WidgetDataRow, 'id' | 'primary'> = {},
): WidgetDataRow {
	return { id, primary, ...rest };
}

/**
 * Resolve ONE declared query against the actor-filtered core reads.
 *
 * Every branch calls a `*ForActor` query and maps its result; none of them touches a raw record.
 * `binding` is the one source that is per-INSTANCE rather than per-campaign: it describes the entity
 * the DM bound this widget to, and it reports the binding STATUS the board already derived rather
 * than re-deriving (and possibly disagreeing with) it.
 */
function resolveSource(
	state: CoreStateSlice,
	actorId: string,
	query: WidgetDataQueryDefinition,
	widget: BoardWidget,
): { rows: WidgetDataRow[]; header: string | null; emptyLabel: string } {
	switch (query.source) {
		case 'current-combatants': {
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const header =
				tracker.status === 'running'
					? `Round ${tracker.round} · turn ${tracker.turn + 1} of ${tracker.combatants.length}`
					: 'No combat running';
			return {
				header,
				emptyLabel: 'No combatants in the tracker.',
				rows: tracker.combatants.map((combatant) => {
					// `resources` is null for a combatant whose vitals are withheld from this viewer, so
					// the HP detail simply disappears rather than being reconstructed here.
					const detail: string[] = [];
					if (combatant.statBlock?.initiative != null) {
						detail.push(`Initiative ${combatant.statBlock.initiative}`);
					}
					if (combatant.resources) {
						detail.push(`HP ${combatant.resources.hp} of ${combatant.resources.maxHp}`);
					}
					return row(combatant.id, combatant.name, {
						secondary: detail.length > 0 ? detail.join(' · ') : undefined,
						meta: combatant.redacted ? 'Hidden' : undefined,
						value: combatant.resources?.hp,
						max: combatant.resources?.maxHp,
						active: combatant.isActive,
					});
				}),
			};
		}
		case 'visible-characters': {
			const party = getPartyOverviewForActor(state.characters, state.permissions, actorId);
			return {
				header: null,
				emptyLabel: 'No characters visible yet.',
				rows: party.members.map((member) =>
					row(member.characterId, member.name, {
						secondary: `HP ${member.hp} of ${member.maxHp} · AC ${member.ac}`,
						meta: member.visibility,
						value: member.hp,
						max: member.maxHp,
					}),
				),
			};
		}
		case 'selected-scene': {
			const scenes = listScenesForActor(state.scenes, state.permissions, actorId).filter(
				(scene) => !scene.isTemplate,
			);
			const activeId = state.session.activeSceneId;
			return {
				header: null,
				emptyLabel: 'No scenes yet.',
				rows: scenes.map((scene) =>
					row(scene.id, scene.name, {
						secondary: scene.tags.join(', ') || undefined,
						meta: scene.visibility,
						active: scene.id === activeId,
					}),
				),
			};
		}
		case 'session-state': {
			// Composed from reads that are already actor-safe: the workflow phase is campaign-wide, the
			// active scene is named ONLY when this actor may see it, and combat comes from the filtered
			// tracker. Nothing here can name a scene the viewer cannot open.
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const activeId = state.session.activeSceneId;
			const activeScene = activeId
				? (listScenesForActor(state.scenes, state.permissions, actorId).find(
						(scene) => scene.id === activeId,
					) ?? null)
				: null;
			return {
				header: null,
				emptyLabel: 'No session details yet.',
				rows: [
					row('workflow', 'Session', { secondary: state.session.workflow }),
					row('scene', 'Active scene', { secondary: activeScene?.name ?? 'None' }),
					row('combat', 'Combat', {
						secondary: tracker.status === 'running' ? `Round ${tracker.round}` : tracker.status,
						value: tracker.combatants.length,
					}),
				],
			};
		}
		case 'notes':
		case 'content-objects': {
			// The vault holds two content kinds; the declaration names which one it wants, so `notes`
			// and `content-objects` are the two halves rather than two names for the same list.
			const kind = query.source === 'notes' ? 'note' : 'object';
			const wanted = getContentItemsForActor(state.content, state.permissions, actorId).filter(
				(item) => item.kind === kind,
			);
			return {
				header: null,
				emptyLabel: query.source === 'notes' ? 'No notes yet.' : 'No vault objects yet.',
				rows: wanted
					.slice()
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
					.map((item) => row(item.id, item.title, { secondary: item.updatedAt, meta: item.kind })),
			};
		}
		case 'maps': {
			const maps = listMapsForActor(state.maps, state.permissions, actorId);
			return {
				header: null,
				emptyLabel: 'No maps yet.',
				rows: maps.map((map) =>
					row(map.id, map.name, { secondary: map.description || undefined, meta: map.visibility }),
				),
			};
		}
		case 'binding': {
			const ref = widget.bindingRef;
			if (!ref) return { rows: [], header: null, emptyLabel: 'No data source bound.' };
			// The binding's availability is the board's, verbatim: `status`/`statusNote` come from the
			// actor-scoped scene summary, so a bound-but-hidden entity reads as hidden here too instead
			// of the template inventing a second opinion about the same binding.
			return {
				header: widget.statusNote,
				emptyLabel: 'No data source bound.',
				rows: [row(ref.entityId, ref.entityId, { secondary: ref.entityType, meta: widget.status })],
			};
		}
	}
}

/** Format a computed value for display, so every template prints one the same way. */
function displayOf(value: WidgetComputedValue['value']): string {
	if (Array.isArray(value)) return String(value.length);
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'object' && value !== null) {
		return Object.entries(value)
			.map(([key, entry]) => `${key} ${String(entry)}`)
			.join(' · ');
	}
	return String(value);
}

/**
 * Evaluate one computed field over its input queries.
 *
 * The definition schema carries NO expression language — a computed field is `inputQueryIds` plus a
 * `valueType`, and nothing else. So the only faithful evaluation is a declared reduction per type:
 * a number sums the rows' measures (falling back to the row count when no row carries one), a string
 * lists the row names, a boolean asks whether there is anything at all, an array is the rows and an
 * object is the per-query row count. A package that wants arithmetic ships `custom-html-js`
 * (RC-WID-1.3); a template does not get a hidden formula engine here.
 *
 * A withheld input contributes nothing, so a player's computed total can never be derived from rows
 * the player was not allowed to receive.
 */
function evaluateComputedField(
	field: WidgetComputedFieldDefinition,
	byId: Map<string, WidgetQueryResult>,
): WidgetComputedValue {
	const inputs = field.inputQueryIds
		.map((id) => byId.get(id))
		.filter(
			(result): result is WidgetQueryResult => result !== undefined && result.withheld === null,
		);
	const rows = inputs.flatMap((result) => result.rows);

	let value: WidgetComputedValue['value'];
	switch (field.valueType) {
		case 'number': {
			const measured = rows.filter((r) => typeof r.value === 'number');
			value =
				measured.length > 0 ? measured.reduce((sum, r) => sum + (r.value ?? 0), 0) : rows.length;
			break;
		}
		case 'boolean':
			value = rows.length > 0;
			break;
		case 'array':
			value = rows;
			break;
		case 'object':
			value = Object.fromEntries(inputs.map((result) => [result.id, result.rows.length]));
			break;
		case 'string':
		default:
			value = rows.map((r) => r.primary).join(', ');
			break;
	}
	return {
		id: field.id,
		label: field.label,
		valueType: field.valueType,
		value,
		display: displayOf(value),
	};
}

/**
 * Resolve every declared query and computed field for one placed widget. Pure: pass a state slice
 * and an actor id and get the same answer a template would draw.
 */
export function resolveWidgetTemplateData(
	state: CoreStateSlice,
	actorId: string,
	definition: WidgetDefinition | null | undefined,
	widget: BoardWidget,
): WidgetTemplateData {
	const actor = state.permissions.actors[actorId];
	// An unknown actor gets nothing rather than the DM's view — the same fail-closed default every
	// core query takes for an actor it cannot find.
	if (!actor) return EMPTY_DATA;
	const isDm = hasDmAuthority(actor.role);

	const queries: WidgetQueryResult[] = (definition?.dataQueries ?? []).map((query) => {
		const withheld: WidgetQueryWithheldReason | null =
			query.audience === 'dm' && !isDm
				? 'audience'
				: query.requiredCapability === 'manager' && !isDm
					? 'capability'
					: null;
		if (withheld) {
			return {
				id: query.id,
				label: query.label,
				source: query.source,
				rows: [],
				header: null,
				emptyLabel: WITHHELD_COPY[withheld],
				withheld,
			};
		}
		const resolved = resolveSource(state, actorId, query, widget);
		return {
			id: query.id,
			label: query.label,
			source: query.source,
			rows: resolved.rows,
			header: resolved.header,
			emptyLabel: resolved.emptyLabel,
			withheld: null,
		};
	});

	const byId = new Map(queries.map((result) => [result.id, result]));
	const computed = (definition?.computedFields ?? []).map((field) =>
		evaluateComputedField(field, byId),
	);

	return { queries, computed, primary: queries[0] ?? null, isDm };
}

/** The app-side hook: the same resolution against the live, actor-projected runtime state. */
export function useWidgetTemplateData(
	widget: BoardWidget,
	definition: WidgetDefinition | null | undefined,
): WidgetTemplateData {
	const runtime = useRuntime();
	return resolveWidgetTemplateData(runtime.state, runtime.activeActorId, definition, widget);
}
