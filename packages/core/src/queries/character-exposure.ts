import { hasDmAuthority } from '../state/permission-state';
import type { Character } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import {
	availableClassResource,
	availableSlots,
	resourcesOf,
	type CharacterResources,
} from '../state/character-resources';
import type { Actor } from '../state/permission-state';
import type { WidgetBinding } from '../state/scene-state';
import {
	entityBindingKey,
	resolveWidgetBinding,
	type ResolveBindingOptions,
	type WidgetBindingResolution,
	type WidgetDataEnvironment,
} from './binding';

/**
 * CHAR-006 — the STABLE, STRUCTURED character DATA-EXPOSURE API a widget binds to.
 *
 * This is the documented contract a Scene widget targets instead of reaching into raw character
 * internals (Contract 4 Widget Data Contract; Contract 1 GUI knowledge limits). It EXTENDS — it does
 * NOT replace — the existing character→widget binding (`character-bindings.ts`) and the existing
 * resolver (`queries/binding.ts`): a widget still binds to `character:<id>` with a selector, and the
 * SAME {@link resolveWidgetBinding} resolver decides the actor-scoped value and the explicit
 * `hidden`/`conflicted`/`missing` fail-closed states. What this module adds is breadth + a contract:
 *
 *   1. A COMPREHENSIVE bindable value covering every CHAR-006 field group — HP, resources, conditions,
 *      spell slots, abilities, skills, equipment, and visible notes — derived from the canonical
 *      character model (`combat`, `resources`, `abilityScores`, `data`). No field group is left to a
 *      widget reaching into raw state.
 *   2. An ENUMERABLE, typed map of the supported binding selectors per field group
 *      ({@link CHARACTER_EXPOSURE_PATHS}). A widget binds to a path in this published surface; an
 *      UNKNOWN/unsupported selector FAILS CLOSED (resolves to `missing`, indistinguishable from a
 *      deleted target) rather than silently leaking an arbitrary character internal.
 *
 * Pure Processing-Core policy (Contract 1): a deterministic data transform over plain character data
 * plus a thin wrapper over the existing resolver. No GUI, no storage. Actor filtering and the
 * fail-closed states are ALWAYS the resolver's — never re-derived by a caller.
 */

/** The CHAR-006 field groups the exposure API covers. Stable, enumerable surface. */
export type CharacterExposureFieldGroup =
	| 'identity'
	| 'hp'
	| 'resources'
	| 'conditions'
	| 'spell-slots'
	| 'abilities'
	| 'skills'
	| 'equipment'
	| 'notes';

/** A single supported binding path in the exposure contract, with the group it belongs to. */
export interface CharacterExposurePath {
	/** The binding selector a widget targets (e.g. `combat.hp`, `resources.spellSlots`). */
	selector: string;
	/** The CHAR-006 field group this path belongs to. */
	group: CharacterExposureFieldGroup;
}

/**
 * The `data`-block keys the exposure API surfaces as the SKILLS / EQUIPMENT / NOTES field groups.
 * These follow the existing `Character.data` storage convention (open structured sheet fields keyed by
 * name; see `character-collaboration.ts` `validateFieldEdit` and `character-advancement.ts`). Kept as
 * named constants so the exposure contract is the single place these data keys are blessed for binding.
 */
export const SKILLS_DATA_KEY = 'skills' as const;
export const EQUIPMENT_DATA_KEY = 'equipment' as const;
/** Player-visible notes. The DM-notes field (`dmNotes`) is intentionally NOT in the contract. */
export const VISIBLE_NOTES_DATA_KEY = 'notes' as const;
export const BACKSTORY_DATA_KEY = 'backstory' as const;

/**
 * THE published, enumerable exposure contract: every supported binding selector grouped by field
 * group. A widget binds to one of these selectors; anything else fails closed. The list is the
 * documented surface so widgets bind to a contract rather than to raw character internals.
 *
 * Selectors are namespaced by group (`combat.*`, `resources.*`, `abilities.*`, `data.*`) so the value
 * map and the contract share one addressing scheme. Frozen so it cannot be mutated at runtime.
 */
export const CHARACTER_EXPOSURE_PATHS: readonly CharacterExposurePath[] = Object.freeze([
	// Identity (always part of any bound character).
	{ selector: 'name', group: 'identity' },
	{ selector: 'kind', group: 'identity' },
	// HP (the canonical combat-bound surface, CHAR-006 AC1).
	{ selector: 'combat.hp', group: 'hp' },
	{ selector: 'combat.maxHp', group: 'hp' },
	{ selector: 'combat.tempHp', group: 'hp' },
	{ selector: 'combat.ac', group: 'hp' },
	// Conditions.
	{ selector: 'combat.conditions', group: 'conditions' },
	// Spell slots.
	{ selector: 'resources.spellSlots', group: 'spell-slots' },
	{ selector: 'resources.spells', group: 'spell-slots' },
	// Resources (death saves, concentration, class resources, expenditure history).
	{ selector: 'resources.deathSaves', group: 'resources' },
	{ selector: 'resources.concentration', group: 'resources' },
	{ selector: 'resources.classResources', group: 'resources' },
	{ selector: 'resources.ledger', group: 'resources' },
	// Abilities.
	{ selector: 'abilities', group: 'abilities' },
	// Skills / equipment / visible notes (open `data` sheet fields).
	{ selector: `data.${SKILLS_DATA_KEY}`, group: 'skills' },
	{ selector: `data.${EQUIPMENT_DATA_KEY}`, group: 'equipment' },
	{ selector: `data.${VISIBLE_NOTES_DATA_KEY}`, group: 'notes' },
	{ selector: `data.${BACKSTORY_DATA_KEY}`, group: 'notes' },
]);

/** The set of supported selectors, for O(1) fail-closed membership checks. */
export const SUPPORTED_EXPOSURE_SELECTORS: ReadonlySet<string> = new Set(
	CHARACTER_EXPOSURE_PATHS.map((path) => path.selector),
);

/** Is `selector` a path in the published exposure contract? Unknown selectors fail closed. */
export function isSupportedExposureSelector(selector: string | undefined): boolean {
	return selector !== undefined && SUPPORTED_EXPOSURE_SELECTORS.has(selector);
}

/** The supported selectors for one field group (enumerable per-group surface). */
export function exposurePathsForGroup(group: CharacterExposureFieldGroup): CharacterExposurePath[] {
	return CHARACTER_EXPOSURE_PATHS.filter((path) => path.group === group);
}

/**
 * A spell-slot snapshot exposed to a widget: max/expended plus DERIVED `available` (never stored, so
 * it cannot drift). Per spell level.
 */
export interface ExposedSpellSlotLevel {
	level: number;
	max: number;
	expended: number;
	available: number;
}

/** A class-resource snapshot exposed to a widget, with DERIVED `available`. */
export interface ExposedClassResource {
	id: string;
	name: string;
	max: number;
	expended: number;
	available: number;
	recharge: CharacterResources['classResources'][string]['recharge'];
}

/** Project the resources block into the exposed spell-slot view, deriving `available` per level. */
function exposedSpellSlots(resources: CharacterResources): ExposedSpellSlotLevel[] {
	return Object.values(resources.spellSlots)
		.map((slot) => ({
			level: slot.level,
			max: slot.max,
			expended: slot.expended,
			available: availableSlots(slot),
		}))
		.sort((a, b) => a.level - b.level);
}

/** Project the class resources into the exposed view, deriving `available` per resource. */
function exposedClassResources(resources: CharacterResources): ExposedClassResource[] {
	return Object.values(resources.classResources)
		.map((resource) => ({
			id: resource.id,
			name: resource.name,
			max: resource.max,
			expended: resource.expended,
			available: availableClassResource(resource),
			recharge: resource.recharge,
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Build the COMPREHENSIVE, actor-INDEPENDENT bindable value for one character, addressed by the
 * exposure contract's selectors. This is the single value the existing resolver redacts per actor
 * (it strips the character's `dmOnlyFields`) — never a pre-filtered value, so visibility stays the
 * resolver's job (fail-closed, one choke-point).
 *
 * Every CHAR-006 field group is represented: HP, conditions (combat), spell slots + resources
 * (resources block, with derived availability), abilities (ability scores), and skills / equipment /
 * visible notes (open `data` sheet fields). Combat fields keep their existing flat aliases (`hp`, …)
 * so a widget that binds to the legacy flat selector keeps working; the namespaced selectors are the
 * documented contract going forward.
 */
export function characterExposureValue(character: Character): Record<string, unknown> {
	const resources = resourcesOf(character);
	return {
		// Identity.
		name: character.name,
		kind: character.kind,
		// HP / combat — flat aliases (back-compat) + namespaced contract selectors.
		hp: character.combat.hp,
		maxHp: character.combat.maxHp,
		tempHp: character.combat.tempHp,
		ac: character.combat.ac,
		conditions: [...character.combat.conditions],
		'combat.hp': character.combat.hp,
		'combat.maxHp': character.combat.maxHp,
		'combat.tempHp': character.combat.tempHp,
		'combat.ac': character.combat.ac,
		'combat.conditions': [...character.combat.conditions],
		// Resources — spell slots / spells / class resources / death saves / concentration / ledger.
		'resources.spellSlots': exposedSpellSlots(resources),
		'resources.spells': resources.spells.map((spell) => ({ ...spell })),
		'resources.classResources': exposedClassResources(resources),
		'resources.deathSaves': { ...resources.deathSaves },
		'resources.concentration': { ...resources.concentration },
		'resources.ledger': resources.ledger.map((entry) => ({ ...entry })),
		// Abilities.
		abilities: { ...character.abilityScores },
		// Open sheet data (skills / equipment / notes / backstory). Surfaced both under their `data.*`
		// contract selector AND their bare key (some widgets/legacy bindings use the flat key), so the
		// redactor below can strip BOTH forms when a key is declared DM-only.
		...flattenedDataExposure(character),
	};
}

/**
 * Surface the contract's `data`-backed selectors. Each blessed `data` key is exposed under BOTH its
 * `data.<key>` contract selector and its bare `<key>` alias, so a `dmOnlyFields` entry of `data.<key>`
 * (or a bare `<key>`) reliably redacts the value in BOTH forms. Only contract-blessed keys are
 * surfaced — an arbitrary `data` key is NOT exposed, so the contract does not leak un-vetted internals.
 */
function flattenedDataExposure(character: Character): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of [
		SKILLS_DATA_KEY,
		EQUIPMENT_DATA_KEY,
		VISIBLE_NOTES_DATA_KEY,
		BACKSTORY_DATA_KEY,
	]) {
		const value = character.data[key];
		if (value === undefined) continue;
		out[`data.${key}`] = value;
		out[key] = value;
	}
	return out;
}

/**
 * The full set of hidden selectors for a character, expanded so the resolver redacts a DM-only field
 * in EVERY addressable form. `Character.dmOnlyFields` may be declared as `data.<key>` / `combat.<key>`
 * (the field-edit path convention) or as a bare data key; the value map exposes both the namespaced
 * and flat forms, so each declared field expands to both so neither form leaks for a non-DM actor.
 */
export function characterHiddenSelectors(character: Character): string[] {
	const hidden = new Set<string>();
	for (const field of character.dmOnlyFields) {
		hidden.add(field);
		if (field.startsWith('data.')) hidden.add(field.slice('data.'.length));
		else if (field.startsWith('combat.')) hidden.add(field.slice('combat.'.length));
		else {
			// A bare key (e.g. `dmNotes`) also covers its `data.<key>` namespaced form.
			hidden.add(`data.${field}`);
		}
	}
	return [...hidden];
}

/**
 * Resolve a binding against the character data-exposure contract for one actor. This is the sanctioned
 * read path for the structured exposure API: it validates the selector against the published contract
 * FIRST — an unknown/unsupported selector on an existing character FAILS CLOSED (`missing`) so a widget
 * cannot probe arbitrary character internals — then delegates to the existing {@link resolveWidgetBinding}
 * resolver, which performs visibility filtering, field redaction, conflict, and missing detection.
 *
 * A `null` binding and a binding to a non-character entity are handled by the resolver unchanged.
 */
export function resolveCharacterExposure(
	binding: WidgetBinding | null,
	actor: Actor,
	env: WidgetDataEnvironment,
	options: ResolveBindingOptions = {},
): WidgetBindingResolution {
	if (binding && binding.source.entityType === CHARACTER_ENTITY_TYPE) {
		const { selector, entityId } = binding.source;
		// A selector outside the published contract fails closed BEFORE the value is consulted — only
		// when the target character actually exists (so a player still gets `hidden`, not a leak of
		// existence, for a dm-only character). For a hidden character the resolver already returns
		// `hidden` first below, so we gate the unknown-selector check on a record the resolver can see.
		const key = entityBindingKey(CHARACTER_ENTITY_TYPE, entityId);
		const record = env.entities[key];
		if (record && hasDmAuthority(actor.role) && !isSupportedExposureSelector(selector)) {
			// For the DM (who can see everything) an unsupported selector is simply not in the contract.
			return { state: 'missing' };
		}
		if (record && !isSupportedExposureSelector(selector)) {
			// For a non-DM, first let the resolver decide visibility (a hidden character must resolve to
			// `hidden`, never reveal that the selector is merely unsupported).
			const resolution = resolveWidgetBinding(binding, actor, env, options);
			if (resolution.state === 'hidden' || resolution.state === 'conflicted') return resolution;
			return { state: 'missing' };
		}
	}
	return resolveWidgetBinding(binding, actor, env, options);
}
