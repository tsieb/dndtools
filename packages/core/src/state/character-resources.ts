import type { ActorId } from './ids';
import type { ActorRole } from './permission-state';
import type { Character } from './character-state';

/**
 * CHAR-007 / CHAR-008 — the STRUCTURED combat-resource and spell/resource state, plus the pure
 * deterministic policy that mutates it (HP/temp-HP/conditions/death-saves/concentration, spell-slot
 * and class-resource expenditure, and short/long REST RECOVERY).
 *
 * This EXTENDS the existing character model rather than introducing a parallel one: the durable
 * {@link Character} gains an optional {@link CharacterResources} block (see `character-state.ts`),
 * carried alongside the existing `combat`/`data` values it complements. A character persisted before
 * this slice hydrates safely (absent ⇒ empty resources via {@link ensureCharacterResources}).
 *
 * Everything here is PURE Processing-Core policy (Contract 1): resource math, rest recovery, and the
 * expenditure-history append are deterministic functions over plain data, with no GUI, storage, or
 * ambient clock/entropy — ids/clock are supplied by the command env. The command handlers
 * (`commands/character-resources.ts`) compose these and append a durable op; the GUI dispatches
 * command intents and renders the computed model.
 */

export const CHARACTER_RESOURCES_SCHEMA_VERSION = 1 as const;

/** Death-save success/failure tally during a session (3 each is the rule bound). */
export interface DeathSaveState {
	successes: number;
	failures: number;
	/** True once the creature is stable (3 successes) or revived; cleared on recovery. */
	stable: boolean;
}

export const EMPTY_DEATH_SAVES: DeathSaveState = Object.freeze({
	successes: 0,
	failures: 0,
	stable: false,
});

/** The rule bound for death saves: 3 successes ⇒ stable, 3 failures ⇒ dead. */
export const DEATH_SAVE_MAX = 3 as const;

/** Concentration on a single effect (e.g. a spell) the creature is maintaining. */
export interface ConcentrationState {
	/** The concentrated-on effect name, or null when not concentrating. */
	effect: string | null;
	/** When concentration began (op clock); null when not concentrating. */
	since: string | null;
}

export const EMPTY_CONCENTRATION: ConcentrationState = Object.freeze({
	effect: null,
	since: null,
});

/**
 * Spell slots for ONE spell level. `max` is the level's capacity; `expended` is how many are spent.
 * `available` is derived (`max - expended`); it is never stored, so the two values cannot drift.
 */
export interface SpellSlotLevel {
	level: number;
	max: number;
	expended: number;
}

/**
 * A class/short-rest resource (e.g. ki points, superiority dice, channel divinity). `recharge`
 * declares which REST restores it, so rest recovery is deterministic and data-driven.
 */
export interface ClassResource {
	id: string;
	name: string;
	max: number;
	expended: number;
	/** Which rest restores this resource to full. `none` ⇒ never auto-recovers on rest. */
	recharge: RestKind | 'none';
}

/** A prepared/known spell entry. `prepared` distinguishes prepared casters from known casters. */
export interface PreparedSpell {
	id: string;
	name: string;
	level: number;
	prepared: boolean;
}

/** The kinds of rest that can recover resources (CHAR-008 rest recovery). */
export type RestKind = 'short' | 'long';

/**
 * One recorded resource expenditure/recovery event for the EXPENDITURE HISTORY (CHAR-008). It is the
 * in-character mirror of the durable op-log entry: every accepted resource command appends one of
 * these so the owner can see what was spent/recovered and when, and it is recorded on the op log too.
 */
export interface ResourceLedgerEntry {
	id: string;
	/** What changed: a spell slot, a named class resource, HP/temp-HP, death save, etc. */
	kind:
		| 'spell-slot'
		| 'class-resource'
		| 'hp'
		| 'temp-hp'
		| 'condition'
		| 'death-save'
		| 'concentration'
		| 'rest';
	/** A short human label (e.g. "Cast level 1 slot", "Short rest"). */
	label: string;
	/** Signed delta where meaningful (e.g. -1 slot, +4 HP), or null for non-numeric events. */
	delta: number | null;
	actorActorId: ActorId;
	actorRole: ActorRole;
	at: string;
	/** The op id this ledger entry corresponds to, for traceability against the sync log. */
	operationId: string;
}

/**
 * The structured combat-resource + spell/resource state carried on a {@link Character}. Kept as its
 * own optional block so a character created before this slice hydrates safely, and so it is
 * structurally distinct from the simplified `combat` quick-create surface it complements.
 */
export interface CharacterResources {
	deathSaves: DeathSaveState;
	concentration: ConcentrationState;
	/** Spell slots keyed by level (string key for JSON-safe records); each carries max + expended. */
	spellSlots: Record<string, SpellSlotLevel>;
	/** Known/prepared spells (CHAR-008). */
	spells: PreparedSpell[];
	/** Class/short-rest resources (CHAR-008), each declaring its recharge rest. */
	classResources: Record<string, ClassResource>;
	/** Append-only expenditure/recovery history, oldest first (CHAR-008). */
	ledger: ResourceLedgerEntry[];
	schemaVersion: typeof CHARACTER_RESOURCES_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_RESOURCES: CharacterResources = Object.freeze({
	deathSaves: { ...EMPTY_DEATH_SAVES },
	concentration: { ...EMPTY_CONCENTRATION },
	spellSlots: {},
	spells: [],
	classResources: {},
	ledger: [],
	schemaVersion: CHARACTER_RESOURCES_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-absent/partial resources block (safe empty default). */
export function ensureCharacterResources(
	resources: CharacterResources | undefined,
): CharacterResources {
	return {
		deathSaves: resources?.deathSaves
			? { ...resources.deathSaves }
			: { ...EMPTY_DEATH_SAVES },
		concentration: resources?.concentration
			? { ...resources.concentration }
			: { ...EMPTY_CONCENTRATION },
		spellSlots: resources?.spellSlots ? { ...resources.spellSlots } : {},
		spells: resources?.spells ? resources.spells.map((s) => ({ ...s })) : [],
		classResources: resources?.classResources ? { ...resources.classResources } : {},
		ledger: resources?.ledger ? resources.ledger.map((e) => ({ ...e })) : [],
		schemaVersion: CHARACTER_RESOURCES_SCHEMA_VERSION,
	};
}

/** Read the resources block off a character, hydrating safe defaults. Pure. */
export function resourcesOf(character: Character): CharacterResources {
	return ensureCharacterResources(character.resources);
}

/** Derived available slots for a level (never stored, so it cannot drift from max/expended). */
export function availableSlots(slot: SpellSlotLevel): number {
	return Math.max(0, slot.max - slot.expended);
}

/** Derived available units for a class resource. */
export function availableClassResource(resource: ClassResource): number {
	return Math.max(0, resource.max - resource.expended);
}

// --- Pure combat-resource reducers (CHAR-007) ---------------------------------------------------

/** Clamp a value into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export type ResourceUpdateError =
	| 'invalid-amount'
	| 'no-such-slot-level'
	| 'no-such-class-resource'
	| 'insufficient-slots'
	| 'insufficient-resource'
	| 'death-save-bound'
	| 'not-concentrating';

export interface ResourceUpdateMeta {
	ledgerId: string;
	now: string;
	actorActorId: ActorId;
	actorRole: ActorRole;
	operationId: string;
}

export type ResourceUpdateResult =
	| { ok: true; character: Character; resources: CharacterResources; entry: ResourceLedgerEntry }
	| { ok: false; error: ResourceUpdateError; message: string };

function withResources(
	character: Character,
	resources: CharacterResources,
	now: string,
): Character {
	return {
		...character,
		resources,
		updatedAt: now,
		revision: character.revision + 1,
	};
}

function appendLedger(
	resources: CharacterResources,
	entry: ResourceLedgerEntry,
): CharacterResources {
	return { ...resources, ledger: [...resources.ledger, entry] };
}

function ledgerEntry(
	meta: ResourceUpdateMeta,
	kind: ResourceLedgerEntry['kind'],
	label: string,
	delta: number | null,
): ResourceLedgerEntry {
	return {
		id: meta.ledgerId,
		kind,
		label,
		delta,
		actorActorId: meta.actorActorId,
		actorRole: meta.actorRole,
		at: meta.now,
		operationId: meta.operationId,
	};
}

/**
 * Apply an HP delta (CHAR-007). HP is bounded to `[0, maxHp]`; an incoming hit first burns temporary
 * HP. The applied delta is recorded on the ledger. Pure.
 */
export function applyHpDelta(
	character: Character,
	resources: CharacterResources,
	delta: number,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
		return { ok: false, error: 'invalid-amount', message: 'HP delta must be a whole number.' };
	}
	let remaining = delta;
	let tempHp = character.combat.tempHp;
	// Damage consumes temp HP first.
	if (remaining < 0 && tempHp > 0) {
		const absorbed = Math.min(tempHp, -remaining);
		tempHp -= absorbed;
		remaining += absorbed;
	}
	const hp = clamp(character.combat.hp + remaining, 0, character.combat.maxHp);
	const nextCombat = { ...character.combat, hp, tempHp };
	const nextCharacter: Character = {
		...character,
		combat: nextCombat,
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	const entry = ledgerEntry(meta, 'hp', delta >= 0 ? `Heal ${delta}` : `Damage ${-delta}`, delta);
	return { ok: true, character: nextCharacter, resources: appendLedger(resources, entry), entry };
}

/** Set temporary HP (CHAR-007). Temp HP does not stack — the higher value wins, per the rule. */
export function setTempHp(
	character: Character,
	resources: CharacterResources,
	value: number,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
		return { ok: false, error: 'invalid-amount', message: 'Temporary HP must be a non-negative whole number.' };
	}
	const tempHp = Math.max(character.combat.tempHp, value);
	const nextCharacter: Character = {
		...character,
		combat: { ...character.combat, tempHp },
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	const entry = ledgerEntry(meta, 'temp-hp', `Temp HP ${tempHp}`, tempHp);
	return { ok: true, character: nextCharacter, resources: appendLedger(resources, entry), entry };
}

/** Add or remove a named condition (CHAR-007). Idempotent per condition. */
export function setCondition(
	character: Character,
	resources: CharacterResources,
	condition: string,
	present: boolean,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	const trimmed = condition.trim();
	if (trimmed === '') {
		return { ok: false, error: 'invalid-amount', message: 'A condition name is required.' };
	}
	const has = character.combat.conditions.includes(trimmed);
	const conditions = present
		? has
			? [...character.combat.conditions]
			: [...character.combat.conditions, trimmed]
		: character.combat.conditions.filter((c) => c !== trimmed);
	const nextCharacter: Character = {
		...character,
		combat: { ...character.combat, conditions },
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	const entry = ledgerEntry(
		meta,
		'condition',
		present ? `Add condition ${trimmed}` : `Remove condition ${trimmed}`,
		null,
	);
	return { ok: true, character: nextCharacter, resources: appendLedger(resources, entry), entry };
}

/**
 * Record a death-save success or failure (CHAR-007). Bounded to {@link DEATH_SAVE_MAX} each; three
 * successes set `stable`, and once stable/dead further saves are rejected fail-closed. A `reset`
 * clears the tally (e.g. when the creature regains HP).
 */
export function recordDeathSave(
	resources: CharacterResources,
	outcome: 'success' | 'failure' | 'reset',
	meta: ResourceUpdateMeta,
): { ok: true; resources: CharacterResources; entry: ResourceLedgerEntry } | { ok: false; error: ResourceUpdateError; message: string } {
	const current = resources.deathSaves;
	if (outcome === 'reset') {
		const entry = ledgerEntry(meta, 'death-save', 'Reset death saves', null);
		return { ok: true, resources: appendLedger({ ...resources, deathSaves: { ...EMPTY_DEATH_SAVES } }, entry), entry };
	}
	if (current.stable || current.failures >= DEATH_SAVE_MAX || current.successes >= DEATH_SAVE_MAX) {
		return {
			ok: false,
			error: 'death-save-bound',
			message: 'Death saves are already resolved (stable or dead).',
		};
	}
	const nextSaves: DeathSaveState =
		outcome === 'success'
			? {
					successes: current.successes + 1,
					failures: current.failures,
					stable: current.successes + 1 >= DEATH_SAVE_MAX,
				}
			: {
					successes: current.successes,
					failures: current.failures + 1,
					stable: false,
				};
	const entry = ledgerEntry(
		meta,
		'death-save',
		outcome === 'success' ? 'Death save success' : 'Death save failure',
		outcome === 'success' ? 1 : -1,
	);
	return { ok: true, resources: appendLedger({ ...resources, deathSaves: nextSaves }, entry), entry };
}

/** Set or clear concentration (CHAR-007). Setting a new effect replaces the previous one. */
export function setConcentration(
	resources: CharacterResources,
	effect: string | null,
	meta: ResourceUpdateMeta,
): { ok: true; resources: CharacterResources; entry: ResourceLedgerEntry } | { ok: false; error: ResourceUpdateError; message: string } {
	if (effect !== null && effect.trim() === '') {
		return { ok: false, error: 'invalid-amount', message: 'A concentration effect name is required.' };
	}
	const next: ConcentrationState =
		effect === null ? { ...EMPTY_CONCENTRATION } : { effect: effect.trim(), since: meta.now };
	const entry = ledgerEntry(
		meta,
		'concentration',
		effect === null ? 'Drop concentration' : `Concentrate on ${effect.trim()}`,
		null,
	);
	return { ok: true, resources: appendLedger({ ...resources, concentration: next }, entry), entry };
}

// --- Spell slots + class resources (CHAR-007 expend, CHAR-008 manage) ---------------------------

/** Expend ONE spell slot of a level (CHAR-008 "casts a spell"). Fail-closed when none remain. */
export function expendSpellSlot(
	character: Character,
	resources: CharacterResources,
	level: number,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	const slot = resources.spellSlots[String(level)];
	if (!slot) {
		return { ok: false, error: 'no-such-slot-level', message: `No spell slots at level ${level}.` };
	}
	if (availableSlots(slot) <= 0) {
		return { ok: false, error: 'insufficient-slots', message: `No level ${level} slots remain.` };
	}
	const nextSlot: SpellSlotLevel = { ...slot, expended: slot.expended + 1 };
	const nextResources = appendLedger(
		{ ...resources, spellSlots: { ...resources.spellSlots, [String(level)]: nextSlot } },
		ledgerEntry(meta, 'spell-slot', `Cast level ${level} slot`, -1),
	);
	return {
		ok: true,
		character: withResources(character, nextResources, meta.now),
		resources: nextResources,
		entry: nextResources.ledger[nextResources.ledger.length - 1]!,
	};
}

/** Expend N units of a named class resource (CHAR-007/008). Fail-closed when insufficient. */
export function expendClassResource(
	character: Character,
	resources: CharacterResources,
	resourceId: string,
	amount: number,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	if (!Number.isInteger(amount) || amount <= 0) {
		return { ok: false, error: 'invalid-amount', message: 'Amount must be a positive whole number.' };
	}
	const resource = resources.classResources[resourceId];
	if (!resource) {
		return { ok: false, error: 'no-such-class-resource', message: `No class resource "${resourceId}".` };
	}
	if (availableClassResource(resource) < amount) {
		return { ok: false, error: 'insufficient-resource', message: `Not enough ${resource.name} remaining.` };
	}
	const nextResource: ClassResource = { ...resource, expended: resource.expended + amount };
	const nextResources = appendLedger(
		{ ...resources, classResources: { ...resources.classResources, [resourceId]: nextResource } },
		ledgerEntry(meta, 'class-resource', `Spend ${amount} ${resource.name}`, -amount),
	);
	return {
		ok: true,
		character: withResources(character, nextResources, meta.now),
		resources: nextResources,
		entry: nextResources.ledger[nextResources.ledger.length - 1]!,
	};
}

// --- Deterministic REST RECOVERY (CHAR-008) -----------------------------------------------------

/**
 * Apply a SHORT or LONG rest deterministically (CHAR-008 AC2). The recovery rules are data-driven and
 * pure, so the same character + rest kind always restores the same resources:
 *
 *   - A class resource is restored to full ONLY when its `recharge` matches the rest kind (short-rest
 *     resources recover on a short OR long rest; long-rest resources recover only on a long rest).
 *   - On a LONG rest, all spell slots are restored to full, HP is restored to max, temporary HP is
 *     cleared, death saves are reset, and concentration is dropped. A SHORT rest does NOT restore
 *     spell slots or HP (matching 5e rules), only short-rest class resources.
 *
 * One ledger entry records the rest. Pure: no ambient clock/entropy.
 */
export function applyRest(
	character: Character,
	resources: CharacterResources,
	rest: RestKind,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	// Short-rest resources recover on both short and long rests; long-rest only on a long rest.
	function recharges(resource: ClassResource): boolean {
		if (resource.recharge === 'short') return true; // short-rest resources recover on any rest
		if (resource.recharge === 'long') return rest === 'long';
		return false;
	}

	const classResources: Record<string, ClassResource> = {};
	for (const [id, resource] of Object.entries(resources.classResources)) {
		classResources[id] = recharges(resource) ? { ...resource, expended: 0 } : { ...resource };
	}

	let spellSlots = resources.spellSlots;
	let nextCombat = character.combat;
	let deathSaves = resources.deathSaves;
	let concentration = resources.concentration;

	if (rest === 'long') {
		spellSlots = Object.fromEntries(
			Object.entries(resources.spellSlots).map(([key, slot]) => [key, { ...slot, expended: 0 }]),
		);
		nextCombat = { ...character.combat, hp: character.combat.maxHp, tempHp: 0 };
		deathSaves = { ...EMPTY_DEATH_SAVES };
		concentration = { ...EMPTY_CONCENTRATION };
	}

	const nextResources: CharacterResources = appendLedger(
		{
			...resources,
			classResources,
			spellSlots,
			deathSaves,
			concentration,
		},
		ledgerEntry(meta, 'rest', rest === 'long' ? 'Long rest' : 'Short rest', null),
	);
	const nextCharacter: Character = {
		...character,
		combat: nextCombat,
		resources: nextResources,
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	return { ok: true, character: nextCharacter, resources: nextResources, entry: nextResources.ledger[nextResources.ledger.length - 1]! };
}

// --- Spell / slot / class-resource management (CHAR-008, owner-managed structure) ---------------

export interface SetSpellSlotsInput {
	level: number;
	max: number;
	/** Optional explicit expended count; defaults to clamping the existing expended into the new max. */
	expended?: number;
}

/** Set (declare) the max slots for a level (CHAR-008 "manage slots"). Pure; bounded fail-closed. */
export function setSpellSlots(
	resources: CharacterResources,
	input: SetSpellSlotsInput,
): { ok: true; resources: CharacterResources } | { ok: false; error: ResourceUpdateError; message: string } {
	if (!Number.isInteger(input.level) || input.level < 0 || input.level > 9) {
		return { ok: false, error: 'invalid-amount', message: 'Spell level must be an integer 0–9.' };
	}
	if (!Number.isInteger(input.max) || input.max < 0) {
		return { ok: false, error: 'invalid-amount', message: 'Max slots must be a non-negative whole number.' };
	}
	const existing = resources.spellSlots[String(input.level)];
	const expended = clamp(input.expended ?? existing?.expended ?? 0, 0, input.max);
	const slot: SpellSlotLevel = { level: input.level, max: input.max, expended };
	return {
		ok: true,
		resources: { ...resources, spellSlots: { ...resources.spellSlots, [String(input.level)]: slot } },
	};
}

export interface SetClassResourceInput {
	id: string;
	name: string;
	max: number;
	recharge: RestKind | 'none';
	expended?: number;
}

/** Declare/update a class resource (CHAR-008 "manage class resources"). Pure; bounded fail-closed. */
export function setClassResource(
	resources: CharacterResources,
	input: SetClassResourceInput,
): { ok: true; resources: CharacterResources } | { ok: false; error: ResourceUpdateError; message: string } {
	if (input.id.trim() === '' || input.name.trim() === '') {
		return { ok: false, error: 'invalid-amount', message: 'Resource id and name are required.' };
	}
	if (!Number.isInteger(input.max) || input.max < 0) {
		return { ok: false, error: 'invalid-amount', message: 'Max must be a non-negative whole number.' };
	}
	const existing = resources.classResources[input.id];
	const expended = clamp(input.expended ?? existing?.expended ?? 0, 0, input.max);
	const resource: ClassResource = {
		id: input.id,
		name: input.name,
		max: input.max,
		recharge: input.recharge,
		expended,
	};
	return {
		ok: true,
		resources: { ...resources, classResources: { ...resources.classResources, [input.id]: resource } },
	};
}

export interface SetSpellInput {
	id: string;
	name: string;
	level: number;
	prepared: boolean;
}

/** Add/update a known spell and its prepared flag (CHAR-008 "manage prepared spells"). Pure. */
export function setSpell(
	resources: CharacterResources,
	input: SetSpellInput,
): { ok: true; resources: CharacterResources } | { ok: false; error: ResourceUpdateError; message: string } {
	if (input.id.trim() === '' || input.name.trim() === '') {
		return { ok: false, error: 'invalid-amount', message: 'Spell id and name are required.' };
	}
	if (!Number.isInteger(input.level) || input.level < 0 || input.level > 9) {
		return { ok: false, error: 'invalid-amount', message: 'Spell level must be an integer 0–9.' };
	}
	const next: PreparedSpell = {
		id: input.id,
		name: input.name,
		level: input.level,
		prepared: input.prepared,
	};
	const existingIndex = resources.spells.findIndex((s) => s.id === input.id);
	const spells =
		existingIndex === -1
			? [...resources.spells, next]
			: resources.spells.map((s, i) => (i === existingIndex ? next : s));
	return { ok: true, resources: { ...resources, spells } };
}
