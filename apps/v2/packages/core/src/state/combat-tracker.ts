import type { ActorId } from './ids';
import type { ActorRole } from './permission-state';
import {
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
	type ConcentrationState,
	type DeathSaveState,
} from './character-resources';

/**
 * SES-002 — the DURABLE COMBAT TRACKER model + the PURE deterministic turn/round state machine.
 *
 * This is the FIRST SES slice, so it establishes the cohesive, extensible session combat-tracker
 * model later SES epics build on. It models EXACTLY what running combat needs — initiative order,
 * rounds, turns, per-combatant HP / conditions / concentration / death saves, stat-block previews,
 * and a durable encounter log — not speculative fields.
 *
 * Reuse, not reinvention:
 *
 *   - A combatant's combat-resource block reuses the CHAR-007 resource SHAPES
 *     ({@link DeathSaveState}, {@link ConcentrationState}, the HP/temp-HP/conditions surface of
 *     `CharacterCombatState`). A combatant that IS a character carries `characterId`; the
 *     CHAR-007 combat-resource commands remain the authority for editing a character's canonical
 *     resources, and the tracker projects them. An NPC/monster combatant uses the SAME resource
 *     shape inline, so the GUI and log treat every combatant uniformly.
 *   - The state machine (initiative ordering with a deterministic tie-break, advance-turn that wraps
 *     to the next round) is PURE: deterministic functions over plain data with no GUI, storage, or
 *     ambient clock/entropy. The command layer composes these and appends a durable op; the GUI
 *     dispatches intents and renders the computed model (Architecture Contract 1).
 *
 * Everything here is pure data + pure reducers. No GUI, no storage, no clock — ids/clock are
 * supplied by the command env.
 */

export const COMBAT_TRACKER_SCHEMA_VERSION = 1 as const;

/** The entity type session combat is addressed by in ops/events. */
export const COMBAT_ENTITY_TYPE = 'combat' as const;

/** A combatant's source kind — a player/DM character entity, or an inline NPC/monster stat block. */
export type CombatantKind = 'character' | 'npc' | 'monster';

export const COMBATANT_KINDS: readonly CombatantKind[] = ['character', 'npc', 'monster'] as const;

/**
 * The per-combatant combat-resource block. The SAME shape for a character and an NPC/monster, so the
 * tracker and the encounter log treat every combatant uniformly. For a character combatant the
 * canonical authority is still the CHAR-007 character resources; this block is the combat-local
 * mirror the DM (and authorized combat participants) edit DURING combat.
 */
export interface CombatantResources {
	hp: number;
	maxHp: number;
	tempHp: number;
	conditions: string[];
	deathSaves: DeathSaveState;
	concentration: ConcentrationState;
}

export const EMPTY_COMBATANT_RESOURCES: CombatantResources = Object.freeze({
	hp: 0,
	maxHp: 0,
	tempHp: 0,
	conditions: [],
	deathSaves: { ...EMPTY_DEATH_SAVES },
	concentration: { ...EMPTY_CONCENTRATION },
});

/**
 * A read-only STAT-BLOCK PREVIEW projection of a combatant (SES-002). It is the static, non-resource
 * facts a viewer may see ABOUT a combatant: name, AC, initiative, ability scores, and free-form
 * notes. A HIDDEN combatant's identity + stat data are OMITTED/replaced by a DM-approved placeholder
 * at the query layer — this is the unredacted source the query filters.
 */
export interface CombatantStatBlock {
	ac: number;
	/** The combatant's initiative roll/score. Drives ordering. */
	initiative: number;
	/** Optional ability scores for the preview; absent for a minimal NPC. */
	abilityScores?: Record<string, number>;
	/** Free-form stat-block detail text (attacks, traits) for the preview. */
	notes: string;
}

/** One combatant in the initiative order. */
export interface Combatant {
	id: string;
	kind: CombatantKind;
	/** The display name. Hidden from non-authorized viewers unless a placeholder is approved. */
	name: string;
	/** When this combatant is a character entity, its id; null for an inline NPC/monster. */
	characterId: string | null;
	/** The stat-block preview source (AC, initiative, abilities, notes). */
	statBlock: CombatantStatBlock;
	/** The combat-local resource block (HP/temp-HP/conditions/death-saves/concentration). */
	resources: CombatantResources;
	/**
	 * Whether this combatant is HIDDEN from players/observers (e.g. an ambush). When hidden, the query
	 * layer omits its identity + stat data, or substitutes the DM-approved {@link placeholder}.
	 */
	hidden: boolean;
	/**
	 * The DM-approved placeholder NAME shown to players for a hidden combatant (e.g. "Unknown figure").
	 * `null` ⇒ the hidden combatant is omitted entirely from non-DM views. Never leaks the real name.
	 */
	placeholder: string | null;
	/**
	 * The deterministic tie-break key recorded when combat is ordered. Lower sorts first within a tie;
	 * stored so the ordering is stable and auditable (SES-002 AC3). Assigned by {@link orderInitiative}.
	 */
	tieBreak: number;
}

/** One durable entry in the ENCOUNTER LOG (SES-002): a record of a combat event, in order. */
export interface CombatLogEntry {
	id: string;
	/** Which round the event occurred in (0 before combat starts). */
	round: number;
	/** Which turn index within the round (0-based; -1 for non-turn events like start/end). */
	turn: number;
	kind:
		| 'combat-started'
		| 'turn-advanced'
		| 'round-advanced'
		| 'hp-changed'
		| 'temp-hp-set'
		| 'condition-changed'
		| 'death-save'
		| 'concentration'
		| 'combatant-added'
		| 'combatant-removed'
		| 'combat-ended'
		/**
		 * SES-002 AC5 — a dice roll made DURING active combat, visibility-carrying so the read layer
		 * can filter DM-only and shared rolls appropriately (mirrors {@link SessionDiceRoll} visibility
		 * semantics without creating a circular import). Fails closed to `dm-only` when absent.
		 */
		| 'roll';
	/** A short human label for the event (e.g. "Goblin takes 5 damage"). */
	label: string;
	/** The combatant this event concerns, when applicable. */
	combatantId: string | null;
	/** Signed numeric delta where meaningful (e.g. -5 HP), else null. */
	delta: number | null;
	/** The actor that caused the event. */
	actorActorId: ActorId;
	actorRole: ActorRole;
	at: string;
	/** The op id this log entry corresponds to, for traceability against the sync log. */
	operationId: string;
	/**
	 * Present when {@link kind} === `'roll'`: the id of the corresponding {@link SessionDiceRoll}
	 * in `session.diceHistory`, for cross-referencing without duplicating roll data.
	 */
	rollId?: string;
	/**
	 * Present when {@link kind} === `'roll'`: the visibility the roll was recorded with. Mirrors
	 * `DiceRollVisibility` as a literal union to avoid a circular `session-state` import.
	 * The query layer fails closed to `dm-only` when this field is absent.
	 */
	rollVisibility?: 'session-visible' | 'dm-only' | 'shared';
	/**
	 * Present when {@link kind} === `'roll'` and {@link rollVisibility} === `'shared'`:
	 * the actor ids the roll is shared with (including the rolling actor).
	 */
	rollSharedWith?: string[];
}

/** The combat lifecycle status. `idle` before initiative is rolled; `ended` once combat is over. */
export type CombatStatus = 'idle' | 'running' | 'ended';

/**
 * The durable session COMBAT state (SES-002). Replaces the earlier minimal combat placeholder: it now
 * carries the full combatant list, the initiative ORDER (combatant ids in turn order), the round/turn
 * cursor, the status, and the durable encounter log. `encounterId` links the running combat to the
 * SES-006 encounter it was started from (by reference; never a clone).
 */
export interface SessionCombatState {
	status: CombatStatus;
	/** The encounter this combat was started from (SES-006 link by reference), or null for ad-hoc combat. */
	encounterId: string | null;
	/** The current round (1-based once combat starts; 0 while idle). */
	round: number;
	/** The current turn index into {@link order} (0-based; 0 while idle). */
	turn: number;
	/** The combatants keyed by id. */
	combatants: Record<string, Combatant>;
	/** The initiative ORDER — combatant ids in turn order. Stable; recomputed only by reorder. */
	order: string[];
	/** The durable ENCOUNTER LOG, oldest first. */
	log: CombatLogEntry[];
	revision: number;
	schemaVersion: typeof COMBAT_TRACKER_SCHEMA_VERSION;
}

export const EMPTY_SESSION_COMBAT_STATE: SessionCombatState = Object.freeze({
	status: 'idle',
	encounterId: null,
	round: 0,
	turn: 0,
	combatants: {},
	order: [],
	log: [],
	revision: 0,
	schemaVersion: COMBAT_TRACKER_SCHEMA_VERSION,
});

/** Deep-clone a combatant (so callers never mutate shared frozen state). Pure. */
export function cloneCombatant(combatant: Combatant): Combatant {
	return {
		...combatant,
		statBlock: {
			...combatant.statBlock,
			...(combatant.statBlock.abilityScores
				? { abilityScores: { ...combatant.statBlock.abilityScores } }
				: {}),
		},
		resources: cloneResources(combatant.resources),
	};
}

/** Deep-clone a combatant resource block. Pure. */
export function cloneResources(resources: CombatantResources): CombatantResources {
	return {
		hp: resources.hp,
		maxHp: resources.maxHp,
		tempHp: resources.tempHp,
		conditions: [...resources.conditions],
		deathSaves: { ...resources.deathSaves },
		concentration: { ...resources.concentration },
	};
}

/** Tolerantly hydrate a possibly-undefined/partial persisted combat slice (safe empty default). */
export function ensureSessionCombatState(
	state: Partial<SessionCombatState> | undefined,
): SessionCombatState {
	const combatants: Record<string, Combatant> = {};
	for (const [id, combatant] of Object.entries(state?.combatants ?? {})) {
		combatants[id] = cloneCombatant(combatant);
	}
	return {
		status: state?.status ?? 'idle',
		encounterId: state?.encounterId ?? null,
		round: state?.round ?? 0,
		turn: state?.turn ?? 0,
		combatants,
		order: state?.order ? [...state.order] : [],
		log: state?.log ? state.log.map((entry) => ({ ...entry })) : [],
		revision: state?.revision ?? 0,
		schemaVersion: COMBAT_TRACKER_SCHEMA_VERSION,
	};
}

// --- Deterministic initiative ordering (SES-002 AC3) ---------------------------------------------

/**
 * Build the INITIATIVE ORDER deterministically (SES-002 AC1/AC3). Combatants sort by initiative
 * DESCENDING (higher acts first). TIES break DETERMINISTICALLY and STABLY by the explicit `tieBreak`
 * key recorded on each combatant (assigned in input order when combat is ordered), so two combatants
 * with the same initiative always resolve the same way and the resolution is recorded in state. The
 * tie-break is a pure function of the input order — no ambient randomness.
 *
 * Returns the combatants with their `tieBreak` keys stamped (in input order) and the ordered id list.
 */
export function orderInitiative(combatants: Combatant[]): {
	combatants: Combatant[];
	order: string[];
} {
	// Stamp the tie-break key by input position so the resolution is explicit and reproducible.
	const stamped = combatants.map((combatant, index) => ({
		...cloneCombatant(combatant),
		tieBreak: index,
	}));
	const order = [...stamped].sort((a, b) => {
		if (b.statBlock.initiative !== a.statBlock.initiative) {
			return b.statBlock.initiative - a.statBlock.initiative;
		}
		// Deterministic, stable tie-break: lower recorded key acts first.
		return a.tieBreak - b.tieBreak;
	});
	return { combatants: stamped, order: order.map((c) => c.id) };
}

// --- The pure turn/round state machine (SES-002 AC1) ---------------------------------------------

export type CombatAdvance = {
	round: number;
	turn: number;
	/** True when advancing wrapped past the last combatant into a new round. */
	wrappedRound: boolean;
};

/**
 * Advance to the NEXT turn (SES-002 AC1). Advancing past the last combatant in the order WRAPS to the
 * first combatant and increments the round. Pure and deterministic: a function of (round, turn, count)
 * only. `count` is the number of combatants in the order; advancing an empty order is a no-op.
 */
export function advanceTurn(round: number, turn: number, count: number): CombatAdvance {
	if (count <= 0) return { round, turn, wrappedRound: false };
	const nextTurn = turn + 1;
	if (nextTurn >= count) {
		return { round: round + 1, turn: 0, wrappedRound: true };
	}
	return { round, turn: nextTurn, wrappedRound: false };
}

/** The combatant whose turn it currently is, or null when combat is idle/empty. Pure. */
export function activeCombatant(state: SessionCombatState): Combatant | null {
	if (state.status !== 'running' || state.order.length === 0) return null;
	const id = state.order[state.turn];
	if (id === undefined) return null;
	return state.combatants[id] ?? null;
}
