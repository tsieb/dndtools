import type { ActorId } from './ids';
import type { ActorRole } from './permission-state';
import {
	EMPTY_CONCENTRATION,
	EMPTY_DEATH_SAVES,
	type ConcentrationState,
	type DeathSaveState,
} from './character-resources';
import type { AreaTemplate, TemplateKind } from '../geometry/template';
import { isAreaTemplate } from '../geometry/template';
import type {
	SystemCondition,
	SystemConditionDuration,
	SystemConditionSeverity,
	SystemPackage,
	SystemTurnModel,
} from './system-package';

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
	/**
	 * UX-SES-005/007 — the DM explicitly chose "No — keep at 0" when this combatant's HP reached 0
	 * (dying / concentrating-on-last-breath, NOT defeated). While true and HP ≤ 0 the combatant is
	 * NOT treated as defeated and the death-save track is the active surface. Cleared whenever the
	 * combatant is healed above 0 or the DM confirms "Yes — defeated". Optional so previously
	 * persisted combat states hydrate unchanged (absent ⇒ false ⇒ the pre-existing hp≤0 semantics).
	 */
	notDefeated?: boolean;
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
		// UX-SES-006 — the DM returned to the previous combatant ("Prev" is the undo for an
		// accidental advance). Recorded distinctly so the encounter log shows the revert.
		| 'turn-reverted'
		| 'round-advanced'
		| 'hp-changed'
		| 'temp-hp-set'
		| 'condition-changed'
		| 'death-save'
		| 'concentration'
		| 'combatant-added'
		| 'combatant-removed'
		// UX-SES-008 — the DM moved a combatant within the initiative order (explicit reorder).
		| 'combatant-reordered'
		// UX-SES-008 — the DM toggled a combatant hidden/visible mid-combat.
		| 'combatant-visibility'
		// UX-SES-005 — the DM resolved the at-0-HP confirmation ("Yes — defeated" / "No — keep at 0").
		| 'defeated-set'
		// RC-MAP-1.1 — a combatant's token was placed on / taken off the active map. A token MOVE is
		// deliberately NOT logged: dragging happens many times a turn and would bury the encounter log.
		// Every move still writes a durable sync op with before/after, so the move stays replayable.
		| 'token-placed'
		| 'token-removed'
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

// ── RC-MAP-1.1 — where a combatant STANDS while combat runs ──────────────────────────────────────

/**
 * RC-MAP-1.1 — a combatant's TOKEN: where that combatant is standing on a map while combat runs.
 *
 * The position is a NORMALIZED point (0..1 on each axis), the same vector model every other map
 * annotation uses (`MapToken.position`, ADR-014/024) — no pixels, so a token means the same thing at
 * any zoom, on any display, and after any re-export of the map image. `size` is the footprint in GRID
 * CELLS (1 = Medium), matching `MapToken.size`, so one grid model serves both annotation tokens and
 * combat tokens.
 *
 * A token belongs to the COMBAT, not to the map: it lives in the session's combat slice keyed by
 * combatant id, so it inherits the combatant's visibility for free and disappears with the combat
 * rather than leaving orphaned markers on a map a player may later be shown.
 */
export interface CombatToken {
	/** The map this combatant is standing on. */
	mapId: string;
	/** Normalized x (0..1). */
	x: number;
	/** Normalized y (0..1). */
	y: number;
	/** Footprint in grid cells (1 = Medium). Positive, bounded by {@link MAX_COMBAT_TOKEN_SIZE}. */
	size: number;
	/**
	 * Optional facing in DEGREES clockwise from north (0 ≤ facing < 360). Absent when the combatant
	 * has no meaningful facing — most creatures do not, so it stays optional rather than defaulting to
	 * a fake "north".
	 */
	facing?: number;
}

/** The default footprint for an auto-placed token (1 grid cell = Medium). */
export const DEFAULT_COMBAT_TOKEN_SIZE = 1;

/** The largest footprint a token may declare, in grid cells (Gargantuan and then some). */
export const MAX_COMBAT_TOKEN_SIZE = 20;

/** Deep-clone a combat token (so callers never mutate shared frozen state). Pure. */
export function cloneCombatToken(token: CombatToken): CombatToken {
	return {
		mapId: token.mapId,
		x: token.x,
		y: token.y,
		size: token.size,
		...(token.facing === undefined ? {} : { facing: token.facing }),
	};
}

/**
 * Whether a token placement is well-formed: a non-empty map id, a normalized position, a positive
 * bounded footprint, and — when present — a facing inside one full turn. Pure; the command layer
 * turns a `false` into a rejection rather than silently clamping a bad placement into range.
 */
export function isCombatTokenPlacement(token: CombatToken): boolean {
	if (token.mapId.trim() === '') return false;
	if (!Number.isFinite(token.x) || token.x < 0 || token.x > 1) return false;
	if (!Number.isFinite(token.y) || token.y < 0 || token.y > 1) return false;
	if (!Number.isFinite(token.size) || token.size <= 0 || token.size > MAX_COMBAT_TOKEN_SIZE) {
		return false;
	}
	if (token.facing !== undefined) {
		if (!Number.isFinite(token.facing) || token.facing < 0 || token.facing >= 360) return false;
	}
	return true;
}

/**
 * The fraction of each axis the auto-placement grid spans, centred on the map. Tokens land in the
 * middle band rather than the extreme edges so the DM sees the whole starting formation at once and
 * has room to drag combatants outward.
 */
const AUTO_PLACE_SPAN = 0.6;

/**
 * RC-MAP-1.1 — lay the combatants out on `mapId` in a deterministic starting formation, in initiative
 * order. The layout is a square-ish row-major grid centred on the map: with `n` combatants there are
 * `ceil(sqrt(n))` columns, and cell centres are spread across the middle {@link AUTO_PLACE_SPAN} of
 * each axis. One combatant lands dead centre. No two combatants share a cell, every position is
 * in-bounds, and the result is a pure function of the id list — so a replay on another device
 * reproduces the identical formation without shipping coordinates for every combatant.
 */
export function autoPlaceCombatTokens(
	combatantIds: readonly string[],
	mapId: string,
): Record<string, CombatToken> {
	const tokens: Record<string, CombatToken> = {};
	const count = combatantIds.length;
	if (count === 0) return tokens;
	const columns = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / columns);
	const origin = (1 - AUTO_PLACE_SPAN) / 2;
	for (let index = 0; index < count; index += 1) {
		const id = combatantIds[index];
		if (id === undefined) continue;
		const column = index % columns;
		const row = Math.floor(index / columns);
		tokens[id] = {
			mapId,
			x: origin + (AUTO_PLACE_SPAN * (column + 0.5)) / columns,
			y: origin + (AUTO_PLACE_SPAN * (row + 0.5)) / rows,
			size: DEFAULT_COMBAT_TOKEN_SIZE,
		};
	}
	return tokens;
}

// ── RC-MAP-1.2 — AoE TEMPLATES: the shapes on the board while combat runs ───────────────────────

/**
 * RC-MAP-1.2 — a placed AREA-OF-EFFECT template: the fireball sphere, the dragon's cone, the
 * lightning line, the wall's cube, sitting on the map so the table can see who is caught.
 *
 * A template is EPHEMERAL SESSION STATE. It lives in the combat slice, not on the map document, for
 * the same reason a combat token does: it belongs to this fight, and when the fight ends it goes away
 * (`combat.end` clears every template) instead of leaving a mystery circle on a map a player is shown
 * three sessions later. Nothing about a template edits the map, so nothing has to be undone.
 *
 * The geometry is {@link AreaTemplate}: a normalized origin (0..1, the vector model from ADR-014/024
 * — never pixels), a rotation in degrees clockwise from north, and a size in TABLE UNITS (feet), so a
 * 20-foot radius stays 20 feet at any zoom and on any map. Which CELLS that covers is not stored —
 * it is derived by `templateCells` from the map's own grid, so changing a map's grid never leaves a
 * template holding a stale cell list.
 */
export interface CombatTemplate extends AreaTemplate {
	id: string;
	/** The map the template is drawn on. */
	mapId: string;
	/** A short label for the effect ("Fireball", "Breath weapon"). Never blank. */
	label: string;
	/** The combatant the effect came from, when it came from one. */
	sourceCombatantId: string | null;
	/** Who placed it, and when — provenance for the DM, not a permission check. */
	placedBy: ActorId;
	placedAt: string;
}

/** The most templates one combat may hold at once. Past this the board is noise, not information. */
export const MAX_COMBAT_TEMPLATES = 32;

/** The longest a template's defining size may be, in table units. A mile-wide cone is a typo. */
export const MAX_TEMPLATE_SIZE_UNITS = 1000;

/** Deep-clone a template (so callers never mutate shared frozen state). Pure. */
export function cloneCombatTemplate(template: CombatTemplate): CombatTemplate {
	return {
		...template,
		origin: { x: template.origin.x, y: template.origin.y },
		...(template.width === undefined ? {} : { width: template.width }),
	};
}

/**
 * Whether a stored template is well-formed: a real id, map and label on top of a well-formed
 * {@link AreaTemplate} geometry, with the size inside {@link MAX_TEMPLATE_SIZE_UNITS}. Pure; the
 * command layer turns a `false` into a rejection rather than silently repairing a bad shape.
 */
export function isCombatTemplate(template: CombatTemplate): boolean {
	if (template.id.trim() === '') return false;
	if (template.mapId.trim() === '') return false;
	if (template.label.trim() === '') return false;
	if (template.size > MAX_TEMPLATE_SIZE_UNITS) return false;
	if (template.width !== undefined && template.width > MAX_TEMPLATE_SIZE_UNITS) return false;
	return isAreaTemplate(template);
}

/** The templates placed on one map, in placement order. Pure. */
export function templatesOnMap(
	state: SessionCombatState,
	mapId: string,
): readonly CombatTemplate[] {
	return state.templates.filter((template) => template.mapId === mapId);
}

/** Re-exported so a caller reading combat state does not need a second import for the shape union. */
export type { TemplateKind };

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
	/**
	 * SES-006 AC2 — TERRAIN NOTES flowed from the linked encounter when combat started. Empty for
	 * ad-hoc combat (no encounter link). The notes are copied at start time so the combat record is
	 * self-contained even if the encounter is later edited.
	 */
	terrainNotes: string;
	/** The current round (1-based once combat starts; 0 while idle). */
	round: number;
	/** The current turn index into {@link order} (0-based; 0 while idle). */
	turn: number;
	/** The combatants keyed by id. */
	combatants: Record<string, Combatant>;
	/** The initiative ORDER — combatant ids in turn order. Stable; recomputed only by reorder. */
	order: string[];
	/**
	 * RC-MAP-1.1 — where each combatant is standing, keyed by COMBATANT id. Additive: a combat
	 * persisted before tokens existed hydrates to `{}`, so no schema bump is needed. A combatant with
	 * no entry here is simply not on a map — the tracker still runs it. Combat tokens are only joined
	 * into the map read while `status` is `running`.
	 */
	tokens: Record<string, CombatToken>;
	/**
	 * RC-MAP-1.2 — the AoE templates currently on the board, in placement order. Additive: a combat
	 * persisted before templates existed hydrates to `[]`, so no schema bump is needed. Ephemeral —
	 * `combat.end` clears the list, because an area of effect belongs to the fight it was cast in.
	 */
	templates: CombatTemplate[];
	/** The durable ENCOUNTER LOG, oldest first. */
	log: CombatLogEntry[];
	revision: number;
	schemaVersion: typeof COMBAT_TRACKER_SCHEMA_VERSION;
}

export const EMPTY_SESSION_COMBAT_STATE: SessionCombatState = Object.freeze({
	status: 'idle',
	encounterId: null,
	terrainNotes: '',
	round: 0,
	turn: 0,
	combatants: {},
	order: [],
	tokens: {},
	templates: [],
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
		// UX-SES-005 — preserve the explicit "keep at 0, not defeated" choice across clones.
		notDefeated: resources.notDefeated ?? false,
	};
}

/**
 * UX-SES-008 — find the initiative-order insertion index for a new combatant: AFTER the last existing
 * combatant whose initiative is ≥ the new one (initiative sorts descending; a newcomer never jumps
 * ahead of an equal-initiative combatant already in the order). Pure and deterministic.
 */
export function initiativeInsertionIndex(
	order: readonly string[],
	combatants: Record<string, Combatant>,
	initiative: number,
): number {
	let index = 0;
	for (let i = 0; i < order.length; i += 1) {
		const id = order[i];
		const existing = id === undefined ? undefined : combatants[id];
		if (existing && existing.statBlock.initiative >= initiative) index = i + 1;
	}
	return index;
}

/** Tolerantly hydrate a possibly-undefined/partial persisted combat slice (safe empty default). */
export function ensureSessionCombatState(
	state: Partial<SessionCombatState> | undefined,
): SessionCombatState {
	const combatants: Record<string, Combatant> = {};
	for (const [id, combatant] of Object.entries(state?.combatants ?? {})) {
		combatants[id] = cloneCombatant(combatant);
	}
	// RC-MAP-1.1 — tokens are additive: a combat persisted before they existed hydrates to `{}`. Only
	// well-formed placements survive hydration, so a corrupted coordinate can never reach a renderer.
	const tokens: Record<string, CombatToken> = {};
	for (const [id, token] of Object.entries(state?.tokens ?? {})) {
		if (isCombatTokenPlacement(token)) tokens[id] = cloneCombatToken(token);
	}
	// RC-MAP-1.2 — templates are additive too, and only well-formed ones survive hydration, so a
	// corrupted shape can never reach a renderer or a coverage query.
	const templates: CombatTemplate[] = [];
	for (const template of state?.templates ?? []) {
		if (isCombatTemplate(template)) templates.push(cloneCombatTemplate(template));
	}
	return {
		status: state?.status ?? 'idle',
		encounterId: state?.encounterId ?? null,
		terrainNotes: state?.terrainNotes ?? '',
		round: state?.round ?? 0,
		turn: state?.turn ?? 0,
		combatants,
		order: state?.order ? [...state.order] : [],
		tokens,
		templates,
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

/**
 * Return to the PREVIOUS turn (UX-SES-006 — the undo for an accidental advance). Moving back from
 * the first combatant of a round WRAPS to the last combatant of the previous round and decrements
 * the round counter (`wrappedRound: true`). At the very first turn of round 1 there is nothing to
 * return to: the input is returned unchanged (a no-op, callers may treat it as such). Pure and
 * deterministic: a function of (round, turn, count) only.
 */
export function previousTurn(round: number, turn: number, count: number): CombatAdvance {
	if (count <= 0) return { round, turn, wrappedRound: false };
	if (turn > 0) return { round, turn: turn - 1, wrappedRound: false };
	if (round <= 1) return { round, turn, wrappedRound: false };
	return { round: round - 1, turn: count - 1, wrappedRound: true };
}

/** The combatant whose turn it currently is, or null when combat is idle/empty. Pure. */
export function activeCombatant(state: SessionCombatState): Combatant | null {
	if (state.status !== 'running' || state.order.length === 0) return null;
	const id = state.order[state.turn];
	if (id === undefined) return null;
	return state.combatants[id] ?? null;
}

// ── RC-SYS-2.3 — conditions come from the active system package ──────────────────────────────────

/**
 * RC-SYS-2.3 — a condition as the interface needs to draw it: the package's key, label, icon and
 * severity, resolved once so no screen has to carry its own 5e condition table.
 *
 * The tracker stores a condition as a bare KEY (`conditions: string[]`), which is what makes a
 * campaign's saved combat survive a system switch: the key is data, the meaning belongs to whatever
 * package is active. These helpers are the one place that turns a key back into something to render.
 */
export interface ResolvedCondition {
	key: string;
	label: string;
	/** Icon name from the semantic icon vocabulary (`docs/reference/ICON_VOCABULARY.md`). */
	icon: string;
	severity: SystemConditionSeverity;
	defaultDuration: SystemConditionDuration;
	maxStacks: number | null;
	/** False when the ACTIVE package does not declare this key (a leftover from another system). */
	known: boolean;
}

/** The conditions the package declares, in authored order. Pure. */
export function systemConditionCatalog(pkg: SystemPackage): readonly SystemCondition[] {
	return pkg.conditions;
}

/** Whether the package declares this condition key. Pure. */
export function isSystemCondition(pkg: SystemPackage, key: string): boolean {
	return pkg.conditions.some((c) => c.key === key);
}

/**
 * Resolve a stored condition key against the active package. A key the package does NOT declare
 * still resolves — to an honest UNKNOWN entry labelled with the raw key and a neutral icon, so a
 * combat saved under 5e and reopened under another package shows what is actually on the combatant
 * instead of silently dropping it. Pure.
 */
export function resolveCondition(pkg: SystemPackage, key: string): ResolvedCondition {
	const found = pkg.conditions.find((c) => c.key === key);
	if (!found) {
		return {
			key,
			label: key,
			icon: 'info',
			severity: 'minor',
			defaultDuration: 'until-removed',
			maxStacks: null,
			known: false,
		};
	}
	return {
		key: found.key,
		label: found.label,
		icon: found.icon,
		severity: found.severity,
		defaultDuration: found.defaultDuration,
		maxStacks: found.maxStacks,
		known: true,
	};
}

/** Every condition on this combatant, resolved against the active package, in stored order. Pure. */
export function resolveCombatantConditions(
	pkg: SystemPackage,
	resources: CombatantResources,
): readonly ResolvedCondition[] {
	return resources.conditions.map((key) => resolveCondition(pkg, key));
}

// ── RC-SYS-2.4 — the TURN MODEL comes from the active system package ─────────────────────────────

/**
 * RC-SYS-2.4 — the turn model as the tracker needs it: is there an ORDER at all, does the cursor
 * mean "whose turn" or "who is in the spotlight", and does a combatant have an action budget.
 *
 * The tracker's state does not change shape. `order` stays the list the tracker walks and `turn`
 * stays the index into it — under an unordered model that index is the SPOTLIGHT rather than a turn
 * cursor. Reusing the existing cursor is deliberate: it means a campaign that switches system keeps
 * its running combat, `combat.next-turn` keeps working (it moves the spotlight along the roster),
 * and no persisted shape needs a migration for a rules change.
 */
export interface ResolvedTurnModel {
	kind: SystemTurnModel['kind'];
	/** True when the tracker runs a TURN ORDER; false when it is an unordered roster. */
	ordered: boolean;
	/** True when the cursor marks a SPOTLIGHT rather than whose turn it is. */
	spotlight: boolean;
	/** True when the model counts rounds. An unordered roster has no rounds to count. */
	rounds: boolean;
	/** Actions each combatant gets per turn, or null when the model declares no budget. */
	actionsPerTurn: number | null;
	/** The formula rolled for initiative, or null when the model does not roll one. */
	initiativeFormula: string | null;
}

/** Resolve the active package's turn model into what the tracker has to decide. Pure. */
export function resolveTurnModel(pkg: SystemPackage): ResolvedTurnModel {
	const model = pkg.turnModel;
	switch (model.kind) {
		case 'initiative':
			return {
				kind: 'initiative',
				ordered: true,
				spotlight: false,
				rounds: true,
				actionsPerTurn: null,
				initiativeFormula: model.initiativeFormula,
			};
		case 'actions-per-turn':
			return {
				kind: 'actions-per-turn',
				ordered: true,
				spotlight: false,
				rounds: true,
				actionsPerTurn: model.actionsPerTurn,
				initiativeFormula: null,
			};
		case 'popcorn':
			// The next actor is CHOSEN by the table, not computed, so there is no order to sort into —
			// but the fight still runs in rounds, and the cursor still says whose turn it is.
			return {
				kind: 'popcorn',
				ordered: false,
				spotlight: false,
				rounds: true,
				actionsPerTurn: null,
				initiativeFormula: null,
			};
		case 'none':
		default:
			return {
				kind: 'none',
				ordered: false,
				spotlight: true,
				rounds: false,
				actionsPerTurn: null,
				initiativeFormula: null,
			};
	}
}

/**
 * Build the list the tracker walks, under the active package's turn model (RC-SYS-2.4). Pure and
 * deterministic.
 *
 * An ORDERED model sorts by initiative exactly as {@link orderInitiative} always has — 5e's
 * behaviour is byte-identical. An UNORDERED model keeps the combatants in the order they were added,
 * because that is the only order the table actually authored: sorting a roster by an initiative
 * number the system never rolls would be inventing a ranking. Tie-break keys are still stamped by
 * input position in both cases, so the result is stable and auditable either way.
 */
export function orderForTurnModel(
	pkg: SystemPackage,
	combatants: Combatant[],
): { combatants: Combatant[]; order: string[] } {
	if (resolveTurnModel(pkg).ordered) return orderInitiative(combatants);
	const stamped = combatants.map((combatant, index) => ({
		...cloneCombatant(combatant),
		tieBreak: index,
	}));
	return { combatants: stamped, order: stamped.map((c) => c.id) };
}
