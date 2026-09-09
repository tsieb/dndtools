import { useMemo } from 'react';
import {
	deliveredMapIdsForActor,
	getCombatTrackerForActor,
	getMapViewForActor,
	type CombatantView,
	type MapCombatTokenView,
} from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';

/**
 * RC-MAP-2.1 — the editor's read of the RUNNING combat, as the token layer and the Inspector need it.
 *
 * Two actor-scoped core reads, joined on the combatant id, and nothing else:
 *   - `getMapViewForActor(..., { combat })` decides WHICH tokens this actor may see on THIS map and
 *     where they stand. Visibility is never re-decided here: a combatant the core withholds is simply
 *     absent from `combatTokens`, so a hidden foe cannot be drawn (RC-MAP-1.1's no-leak rule).
 *   - `getCombatTrackerForActor` supplies what the map view deliberately does not carry — hit points,
 *     conditions, defeated/bloodied state — for the combatants it has already cleared.
 *
 * The join is one-directional and fails closed: a roster row with no matching token is simply not on
 * this map, and a token whose row is missing (which the core's shared visibility rule makes
 * impossible) contributes no resources rather than blank ones.
 *
 * `now` is omitted from both reads, matching every existing app call site
 * (`widgets/builtin/InitiativeTracker.tsx`, `widgets/dataEnvironment.ts`): the app has no clock seam,
 * and minting `new Date()` per render would re-run both queries on every frame.
 */
export interface CombatTokenModel {
	combatantId: string;
	name: string;
	kind: MapCombatTokenView['kind'];
	position: { x: number; y: number };
	/** Footprint in grid cells (1 = Medium). */
	size: number;
	facing: number | null;
	/** True when it is this combatant's turn — the active-turn ring. */
	isActive: boolean;
	/** Whether THIS actor may move the token (the core's answer, not the interface's guess). */
	canMove: boolean;
	/** Null when the viewer may not see this combatant's resources. */
	hp: number | null;
	maxHp: number | null;
	tempHp: number | null;
	conditions: readonly string[];
	isBloodied: boolean;
	isDefeated: boolean;
	isConcentrating: boolean;
}

/** One row of the initiative order as the map editor shows it. */
export interface CombatRosterEntry {
	combatantId: string;
	name: string;
	isActive: boolean;
	redacted: boolean;
	hp: number | null;
	maxHp: number | null;
	conditions: readonly string[];
	isDefeated: boolean;
	/** True when this combatant has a token standing on the map being edited. */
	onThisMap: boolean;
}

export interface EditorCombat {
	/** True only while a combat is actually running. */
	running: boolean;
	round: number;
	turn: number;
	activeCombatantId: string | null;
	/** The tokens standing on THIS map, already filtered for the actor. */
	tokens: readonly CombatTokenModel[];
	/** The whole visible initiative order, in turn order. */
	roster: readonly CombatRosterEntry[];
}

const EMPTY: EditorCombat = Object.freeze({
	running: false,
	round: 0,
	turn: 0,
	activeCombatantId: null,
	tokens: Object.freeze([]),
	roster: Object.freeze([]),
});

export function useCombatTokens(mapId: string, actorId: string): EditorCombat {
	const runtime = useRuntime();
	const { maps, permissions, session } = runtime.state;
	const combat = session.combat;

	const tracker = useMemo(
		() => getCombatTrackerForActor(combat, permissions, actorId),
		[combat, permissions, actorId],
	);

	const combatTokens = useMemo(() => {
		if (tracker.status !== 'running') return [] as MapCombatTokenView[];
		const view = getMapViewForActor(maps, permissions, actorId, mapId, {
			deliveredMapIds: deliveredMapIdsForActor(session, actorId),
			combat,
		});
		return view.kind === 'available' ? view.combatTokens : [];
	}, [tracker.status, maps, permissions, actorId, mapId, session, combat]);

	return useMemo(() => {
		if (tracker.status !== 'running') return EMPTY;
		const rows = new Map<string, CombatantView>(tracker.combatants.map((c) => [c.id, c]));
		const placed = new Set(combatTokens.map((token) => token.combatantId));
		const tokens = combatTokens.map((token): CombatTokenModel => {
			const row = rows.get(token.combatantId);
			const res = row?.resources ?? null;
			return {
				combatantId: token.combatantId,
				name: token.name,
				kind: token.kind,
				position: token.position,
				size: token.size,
				facing: token.facing,
				isActive: token.isActive,
				canMove: token.canMove,
				hp: res ? res.hp : null,
				maxHp: res ? res.maxHp : null,
				tempHp: res ? res.tempHp : null,
				conditions: res ? res.conditions : [],
				isBloodied: row?.isBloodied ?? false,
				isDefeated: row?.isDefeated ?? false,
				isConcentrating: row?.isConcentrating ?? false,
			};
		});
		const roster = tracker.combatants.map((row): CombatRosterEntry => {
			const res = row.resources;
			return {
				combatantId: row.id,
				name: row.name,
				isActive: row.isActive,
				redacted: row.redacted,
				hp: res ? res.hp : null,
				maxHp: res ? res.maxHp : null,
				conditions: res ? res.conditions : [],
				isDefeated: row.isDefeated,
				onThisMap: placed.has(row.id),
			};
		});
		return {
			running: true,
			round: tracker.round,
			turn: tracker.turn,
			activeCombatantId: tracker.activeCombatantId,
			tokens,
			roster,
		};
	}, [tracker, combatTokens]);
}
