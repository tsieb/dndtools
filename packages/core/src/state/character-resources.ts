import type { ActorId } from './ids';
import type { ActorRole } from './permission-state';
import type { Character } from './character-state';
import type { FormulaScope, SystemPackage, SystemRecovery, SystemResource } from './system-package';
import { evaluateFormula } from './system-package';

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
	/** Optional spell DETAIL fields (SRD-style). All optional so records persisted before hydrate safely. */
	castingTime?: string;
	range?: string;
	components?: string;
	duration?: string;
	school?: string;
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
		| 'rest'
		| 'scene';
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
		deathSaves: resources?.deathSaves ? { ...resources.deathSaves } : { ...EMPTY_DEATH_SAVES },
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
		return {
			ok: false,
			error: 'invalid-amount',
			message: 'Temporary HP must be a non-negative whole number.',
		};
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
):
	| { ok: true; resources: CharacterResources; entry: ResourceLedgerEntry }
	| { ok: false; error: ResourceUpdateError; message: string } {
	const current = resources.deathSaves;
	if (outcome === 'reset') {
		const entry = ledgerEntry(meta, 'death-save', 'Reset death saves', null);
		return {
			ok: true,
			resources: appendLedger({ ...resources, deathSaves: { ...EMPTY_DEATH_SAVES } }, entry),
			entry,
		};
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
	return {
		ok: true,
		resources: appendLedger({ ...resources, deathSaves: nextSaves }, entry),
		entry,
	};
}

/** Set or clear concentration (CHAR-007). Setting a new effect replaces the previous one. */
export function setConcentration(
	resources: CharacterResources,
	effect: string | null,
	meta: ResourceUpdateMeta,
):
	| { ok: true; resources: CharacterResources; entry: ResourceLedgerEntry }
	| { ok: false; error: ResourceUpdateError; message: string } {
	if (effect !== null && effect.trim() === '') {
		return {
			ok: false,
			error: 'invalid-amount',
			message: 'A concentration effect name is required.',
		};
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
		return {
			ok: false,
			error: 'invalid-amount',
			message: 'Amount must be a positive whole number.',
		};
	}
	const resource = resources.classResources[resourceId];
	if (!resource) {
		return {
			ok: false,
			error: 'no-such-class-resource',
			message: `No class resource "${resourceId}".`,
		};
	}
	if (availableClassResource(resource) < amount) {
		return {
			ok: false,
			error: 'insufficient-resource',
			message: `Not enough ${resource.name} remaining.`,
		};
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

// --- RC-SYS-2.2 — resources as instances of the package's `resources[]` ------------------------

/**
 * RC-SYS-2.2 — a character's spell slots and class resources are INSTANCES of the resources the
 * active {@link SystemPackage} declares, not a hard-coded 5e list.
 *
 * The storage stays exactly where it was, so nothing on disk changes shape: a package resource of
 * kind `slots` named `spellSlot<level>` is carried in {@link CharacterResources.spellSlots}, and
 * every other package resource is carried in {@link CharacterResources.classResources} under its
 * package key (the same mapping `queries/system-switch-query.ts` already reports on). What moves to
 * the package is the RULE: the maximum comes from the resource's `maxFormula`, and recovery comes
 * from its `recovery`, not from a value copied onto the character at authoring time.
 *
 * A character carrying a resource the active package does not declare keeps working: the stored
 * `recharge` is the fallback, so a homebrew or legacy resource still recovers on the rest it says.
 */

/** The package key convention for a spell-slot level: `spellSlot3` is the level-3 slot resource. */
export function spellSlotResourceKey(level: number): string {
	return `spellSlot${level}`;
}

/** The package resource with this key on the package, or undefined when it declares none. */
export function systemResourceFor(
	pkg: SystemPackage | undefined,
	key: string,
): SystemResource | undefined {
	return pkg?.resources.find((resource) => resource.key === key);
}

/**
 * The recovery that actually governs a stored resource: the active package's when it declares the
 * key, otherwise the resource's own `recharge` (`none` ⇒ `never`). Pure.
 */
export function effectiveRecovery(
	pkg: SystemPackage | undefined,
	key: string,
	fallback: RestKind | 'none',
): SystemRecovery {
	const declared = systemResourceFor(pkg, key);
	if (declared) return declared.recovery;
	return fallback === 'none' ? 'never' : fallback;
}

/**
 * Whether a recovery band comes back on this rest. `short` resources return on a short OR a long
 * rest (a long rest includes a short one); `long` only on a long rest; `scene` and `never` never do
 * — a scene resource clears when the scene ends ({@link applySceneRecovery}), and `never` only on an
 * explicit award. Pure.
 */
export function recoversOnRest(recovery: SystemRecovery, rest: RestKind): boolean {
	if (recovery === 'short') return true;
	if (recovery === 'long') return rest === 'long';
	return false;
}

/**
 * The maximum a package resource declares at a given scope (usually `{ level }`), or null when the
 * package leaves the maximum to the character (`maxFormula: null`) or the formula cannot be read in
 * this scope — a formula naming an input we cannot supply degrades to "the character's own value"
 * rather than silently zeroing a resource. Pure.
 */
export function resourceMaxFromPackage(
	resource: SystemResource,
	scope: FormulaScope,
): number | null {
	if (resource.maxFormula === null) return null;
	const result = evaluateFormula(resource.maxFormula, scope);
	if (!result.ok) return null;
	return Math.max(0, Math.trunc(result.value));
}

/** One package resource as it stands on a character: the package's rule plus the stored counters. */
export interface ResourceInstance {
	key: string;
	label: string;
	kind: SystemResource['kind'];
	recovery: SystemRecovery;
	diceNotation: string | null;
	max: number;
	expended: number;
	available: number;
	/** True when the character carries this resource; false when the package declares it unused. */
	present: boolean;
}

/**
 * Every resource the active package declares, as it stands on this character (RC-SYS-2.2). A
 * resource the character does not carry comes back `present: false` with zeroed counters rather
 * than being dropped, so a sheet can offer to add it; resources the character carries that the
 * package does not declare are appended after, so nothing a DM authored disappears. Pure.
 */
export function resourceInstances(
	character: Character,
	pkg: SystemPackage | undefined,
	resources: CharacterResources = resourcesOf(character),
): ResourceInstance[] {
	const scope: FormulaScope = { level: characterLevelFor(character) };
	const instances: ResourceInstance[] = [];
	const seen = new Set<string>();

	for (const declared of pkg?.resources ?? []) {
		seen.add(declared.key);
		const stored = storedResourceFor(resources, declared.key);
		const declaredMax = resourceMaxFromPackage(declared, scope);
		const max = declaredMax ?? stored?.max ?? 0;
		const expended = Math.min(stored?.expended ?? 0, max);
		instances.push({
			key: declared.key,
			label: declared.label,
			kind: declared.kind,
			recovery: declared.recovery,
			diceNotation: declared.diceNotation,
			max,
			expended,
			available: Math.max(0, max - expended),
			present: stored !== null,
		});
	}

	for (const resource of Object.values(resources.classResources)) {
		if (seen.has(resource.id)) continue;
		instances.push({
			key: resource.id,
			label: resource.name,
			kind: 'pool',
			recovery: effectiveRecovery(pkg, resource.id, resource.recharge),
			diceNotation: null,
			max: resource.max,
			expended: resource.expended,
			available: availableClassResource(resource),
			present: true,
		});
	}

	return instances;
}

/** The stored counters behind a package key, or null when the character does not carry it. Pure. */
function storedResourceFor(
	resources: CharacterResources,
	key: string,
): { max: number; expended: number } | null {
	const level = spellSlotLevelOf(key);
	if (level !== null) {
		const slot = resources.spellSlots[String(level)];
		return slot ? { max: slot.max, expended: slot.expended } : null;
	}
	const resource = resources.classResources[key];
	return resource ? { max: resource.max, expended: resource.expended } : null;
}

/** The spell-slot level a package key names (`spellSlot3` ⇒ 3), or null when it names something else. */
export function spellSlotLevelOf(key: string): number | null {
	const match = /^spellSlot(\d+)$/.exec(key);
	if (!match) return null;
	const level = Number(match[1]);
	return Number.isInteger(level) ? level : null;
}

/** The character's level as the formula scope reads it (absent/unreadable ⇒ 1). Pure. */
function characterLevelFor(character: Character): number {
	const raw = character.data['level'];
	const level = typeof raw === 'number' ? raw : Number(raw);
	return Number.isFinite(level) && level >= 1 ? Math.trunc(level) : 1;
}

/**
 * Recompute the maxima of every stored resource the package declares a `maxFormula` for, at the
 * given scope (RC-SYS-2.2). Used on level-up: a monk's ki follows the package's `level` formula
 * rather than a number copied onto the sheet once. A resource whose formula cannot be read in this
 * scope keeps its authored maximum — fail closed, never clobber the owner's value. `expended` is
 * clamped into the new maximum so the counters cannot drift. Pure.
 */
export function recomputeResourceMaxima(
	resources: CharacterResources,
	pkg: SystemPackage | undefined,
	scope: FormulaScope,
): CharacterResources {
	if (!pkg) return resources;
	let changed = false;
	const classResources: Record<string, ClassResource> = { ...resources.classResources };
	const spellSlots: Record<string, SpellSlotLevel> = { ...resources.spellSlots };

	for (const declared of pkg.resources) {
		const max = resourceMaxFromPackage(declared, scope);
		if (max === null) continue;
		const level = spellSlotLevelOf(declared.key);
		if (level !== null) {
			const slot = spellSlots[String(level)];
			if (!slot || slot.max === max) continue;
			spellSlots[String(level)] = { ...slot, max, expended: Math.min(slot.expended, max) };
			changed = true;
			continue;
		}
		const resource = classResources[declared.key];
		if (!resource || resource.max === max) continue;
		classResources[declared.key] = {
			...resource,
			max,
			expended: Math.min(resource.expended, max),
		};
		changed = true;
	}

	return changed ? { ...resources, classResources, spellSlots } : resources;
}

// --- Deterministic REST RECOVERY (CHAR-008, package-driven since RC-SYS-2.2) --------------------

/**
 * Apply a SHORT or LONG rest deterministically (CHAR-008 AC2). Since RC-SYS-2.2 the recovery rules
 * come from the ACTIVE PACKAGE rather than from 5e literals: each stored resource recovers when the
 * package resource with its key says it comes back on this rest ({@link effectiveRecovery},
 * {@link recoversOnRest}). A resource the package does not declare falls back to its own stored
 * `recharge`, so a homebrew or pre-package character behaves exactly as it did.
 *
 * Under the 5e package this is byte-identical to the previous hard-coded behaviour: `ki` and the
 * other short-rest resources recover on either rest, `rage` and the spell slots only on a long rest,
 * and `hitPoints` (recovery `long`) restores HP to maximum. Temporary HP, death saves and
 * concentration clear on a long rest as before.
 *
 * One ledger entry records the rest. Pure: no ambient clock/entropy.
 */
export function applyRest(
	character: Character,
	resources: CharacterResources,
	rest: RestKind,
	meta: ResourceUpdateMeta,
	pkg?: SystemPackage,
): ResourceUpdateResult {
	const classResources: Record<string, ClassResource> = {};
	for (const [id, resource] of Object.entries(resources.classResources)) {
		const recovery = effectiveRecovery(pkg, id, resource.recharge);
		classResources[id] = recoversOnRest(recovery, rest)
			? { ...resource, expended: 0 }
			: { ...resource };
	}

	const spellSlots: Record<string, SpellSlotLevel> = {};
	for (const [key, slot] of Object.entries(resources.spellSlots)) {
		// Slots default to a long rest when the package says nothing, matching the 5e rule they came from.
		const recovery = effectiveRecovery(pkg, spellSlotResourceKey(slot.level), 'long');
		spellSlots[key] = recoversOnRest(recovery, rest) ? { ...slot, expended: 0 } : { ...slot };
	}

	const hpRecovers = recoversOnRest(hitPointRecovery(pkg), rest);
	const nextCombat = hpRecovers
		? { ...character.combat, hp: character.combat.maxHp, tempHp: 0 }
		: character.combat;
	// Death saves and concentration end with a long rest regardless of the hit-point band.
	const deathSaves = rest === 'long' ? { ...EMPTY_DEATH_SAVES } : resources.deathSaves;
	const concentration = rest === 'long' ? { ...EMPTY_CONCENTRATION } : resources.concentration;

	const nextResources: CharacterResources = appendLedger(
		{ ...resources, classResources, spellSlots, deathSaves, concentration },
		ledgerEntry(meta, 'rest', rest === 'long' ? 'Long rest' : 'Short rest', null),
	);
	const nextCharacter: Character = {
		...character,
		combat: nextCombat,
		resources: nextResources,
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	return {
		ok: true,
		character: nextCharacter,
		resources: nextResources,
		entry: nextResources.ledger[nextResources.ledger.length - 1]!,
	};
}

/** The recovery band the package puts hit points in; `long` when it declares no hit-point pool. */
function hitPointRecovery(pkg: SystemPackage | undefined): SystemRecovery {
	const declared = systemResourceFor(pkg, 'hitPoints') ?? systemResourceFor(pkg, 'hp');
	return declared?.recovery ?? 'long';
}

/**
 * Clear every resource the active package recovers on `scene` (RC-SYS-2.2). A stress clock, a
 * momentum pool or any other between-scenes track resets when the scene ends; rest-recovered
 * resources are untouched, so ending a scene never hands back a long-rest resource.
 *
 * Always succeeds and always records one ledger entry, even when nothing recovers — the scene did
 * end, and a silent no-op would leave the owner unsure whether it registered. Pure.
 */
export function applySceneRecovery(
	character: Character,
	resources: CharacterResources,
	pkg: SystemPackage | undefined,
	meta: ResourceUpdateMeta,
): ResourceUpdateResult {
	let recovered = 0;
	const classResources: Record<string, ClassResource> = {};
	for (const [id, resource] of Object.entries(resources.classResources)) {
		if (effectiveRecovery(pkg, id, resource.recharge) === 'scene' && resource.expended > 0) {
			classResources[id] = { ...resource, expended: 0 };
			recovered += 1;
		} else {
			classResources[id] = { ...resource };
		}
	}

	const spellSlots: Record<string, SpellSlotLevel> = {};
	for (const [key, slot] of Object.entries(resources.spellSlots)) {
		if (
			effectiveRecovery(pkg, spellSlotResourceKey(slot.level), 'long') === 'scene' &&
			slot.expended > 0
		) {
			spellSlots[key] = { ...slot, expended: 0 };
			recovered += 1;
		} else {
			spellSlots[key] = { ...slot };
		}
	}

	const nextResources: CharacterResources = appendLedger(
		{ ...resources, classResources, spellSlots },
		ledgerEntry(meta, 'scene', 'Scene end', recovered === 0 ? null : recovered),
	);
	const nextCharacter: Character = {
		...character,
		resources: nextResources,
		updatedAt: meta.now,
		revision: character.revision + 1,
	};
	return {
		ok: true,
		character: nextCharacter,
		resources: nextResources,
		entry: nextResources.ledger[nextResources.ledger.length - 1]!,
	};
}

/**
 * Instantiate a resource the active package declares onto a character (RC-SYS-2.2). The maximum
 * comes from the package's `maxFormula` at the character's level; a package that leaves the maximum
 * to the character starts it at zero for the owner to set. A `slots` resource lands in
 * `spellSlots`, everything else in `classResources`. Fail closed: a key the package does not
 * declare is rejected rather than invented. Pure.
 */
export function addSystemResource(
	character: Character,
	resources: CharacterResources,
	pkg: SystemPackage | undefined,
	key: string,
):
	| { ok: true; resources: CharacterResources; resource: SystemResource }
	| { ok: false; error: ResourceUpdateError; message: string } {
	const declared = systemResourceFor(pkg, key);
	if (!declared) {
		return {
			ok: false,
			error: 'no-such-class-resource',
			message: `The active system does not define a resource named "${key}".`,
		};
	}
	const max = resourceMaxFromPackage(declared, { level: characterLevelFor(character) }) ?? 0;
	const level = spellSlotLevelOf(declared.key);
	if (level !== null || declared.kind === 'slots') {
		if (level === null) {
			return {
				ok: false,
				error: 'no-such-slot-level',
				message: `"${declared.label}" does not name a spell-slot level.`,
			};
		}
		const existing = resources.spellSlots[String(level)];
		const slot: SpellSlotLevel = {
			level,
			max,
			expended: Math.min(existing?.expended ?? 0, max),
		};
		return {
			ok: true,
			resources: { ...resources, spellSlots: { ...resources.spellSlots, [String(level)]: slot } },
			resource: declared,
		};
	}
	const existing = resources.classResources[declared.key];
	// `recharge` is only the fallback for a package that stops declaring this key; the package wins.
	const recharge: RestKind | 'none' =
		declared.recovery === 'short' || declared.recovery === 'long' ? declared.recovery : 'none';
	const resource: ClassResource = {
		id: declared.key,
		name: declared.label,
		max,
		expended: Math.min(existing?.expended ?? 0, max),
		recharge,
	};
	return {
		ok: true,
		resources: {
			...resources,
			classResources: { ...resources.classResources, [declared.key]: resource },
		},
		resource: declared,
	};
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
):
	| { ok: true; resources: CharacterResources }
	| { ok: false; error: ResourceUpdateError; message: string } {
	if (!Number.isInteger(input.level) || input.level < 0 || input.level > 9) {
		return { ok: false, error: 'invalid-amount', message: 'Spell level must be an integer 0–9.' };
	}
	if (!Number.isInteger(input.max) || input.max < 0) {
		return {
			ok: false,
			error: 'invalid-amount',
			message: 'Max slots must be a non-negative whole number.',
		};
	}
	const existing = resources.spellSlots[String(input.level)];
	const expended = clamp(input.expended ?? existing?.expended ?? 0, 0, input.max);
	const slot: SpellSlotLevel = { level: input.level, max: input.max, expended };
	return {
		ok: true,
		resources: {
			...resources,
			spellSlots: { ...resources.spellSlots, [String(input.level)]: slot },
		},
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
):
	| { ok: true; resources: CharacterResources }
	| { ok: false; error: ResourceUpdateError; message: string } {
	if (input.id.trim() === '' || input.name.trim() === '') {
		return { ok: false, error: 'invalid-amount', message: 'Resource id and name are required.' };
	}
	if (!Number.isInteger(input.max) || input.max < 0) {
		return {
			ok: false,
			error: 'invalid-amount',
			message: 'Max must be a non-negative whole number.',
		};
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
		resources: {
			...resources,
			classResources: { ...resources.classResources, [input.id]: resource },
		},
	};
}

export interface SetSpellInput {
	id: string;
	name: string;
	level: number;
	prepared: boolean;
	/** Optional detail fields. Omitted ⇒ an existing spell's recorded detail is preserved. */
	castingTime?: string;
	range?: string;
	components?: string;
	duration?: string;
	school?: string;
}

/** Add/update a known spell and its prepared flag (CHAR-008 "manage prepared spells"). Pure. */
export function setSpell(
	resources: CharacterResources,
	input: SetSpellInput,
):
	| { ok: true; resources: CharacterResources }
	| { ok: false; error: ResourceUpdateError; message: string } {
	if (input.id.trim() === '' || input.name.trim() === '') {
		return { ok: false, error: 'invalid-amount', message: 'Spell id and name are required.' };
	}
	if (!Number.isInteger(input.level) || input.level < 0 || input.level > 9) {
		return { ok: false, error: 'invalid-amount', message: 'Spell level must be an integer 0–9.' };
	}
	const existing = resources.spells.find((s) => s.id === input.id);
	const next: PreparedSpell = {
		id: input.id,
		name: input.name,
		level: input.level,
		prepared: input.prepared,
	};
	// Optional detail fields: a supplied value wins; an omitted one preserves the recorded detail so a
	// prepared-flag toggle never erases previously-imported SRD detail.
	const castingTime = input.castingTime ?? existing?.castingTime;
	if (castingTime !== undefined) next.castingTime = castingTime;
	const range = input.range ?? existing?.range;
	if (range !== undefined) next.range = range;
	const components = input.components ?? existing?.components;
	if (components !== undefined) next.components = components;
	const duration = input.duration ?? existing?.duration;
	if (duration !== undefined) next.duration = duration;
	const school = input.school ?? existing?.school;
	if (school !== undefined) next.school = school;
	const existingIndex = resources.spells.findIndex((s) => s.id === input.id);
	const spells =
		existingIndex === -1
			? [...resources.spells, next]
			: resources.spells.map((s, i) => (i === existingIndex ? next : s));
	return { ok: true, resources: { ...resources, spells } };
}
