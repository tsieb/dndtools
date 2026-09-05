import type { ActorId } from './ids';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { DEFAULT_VISIBILITY, normalizeVisibilityLevel } from '../permissions/visibility-filter';
import type { CharacterCollaboration } from './character-collaboration';
import type { CharacterResources } from './character-resources';
import type { CharacterInventory } from './character-inventory';
import type { CharacterJournalState } from './character-journal';
import { EMPTY_CHARACTER_JOURNAL_STATE, ensureCharacterJournalState } from './character-journal';

/**
 * CHAR-001 / CHAR-002 / CHAR-013 — the FOUNDATIONAL character state model.
 *
 * This is the first CHAR slice, so it defines the durable character document the later CHAR epics
 * (sheets, leveling, inventory, conditions, sharing) build on. It models EXACTLY what the three
 * requirements need, cleanly and extensibly — not speculative fields.
 *
 * Two entity kinds live in this slice, both pre/post the finalize boundary:
 *
 *   - {@link Character} — a finalized character. A DM-authored NPC/monster/sidekick (CHAR-001) is
 *     created already-finalized with SIMPLIFIED stat + combat fields and a fail-closed visibility
 *     default (`dm-only`). A player PC (CHAR-002) becomes a finalized character when its draft passes
 *     validation. Its combat-relevant fields are addressable by the existing widget binding model
 *     (see `character-bindings.ts`), so a Scene widget can bind to e.g. the character's HP.
 *   - {@link CharacterDraft} — a pre-finalization character entity in the guided PC-creation flow
 *     (CHAR-002). It carries the draft's resumable step progress and EXACTLY ONE draft owner at a
 *     time (CHAR-013). A draft is a real character entity with draft state — never an unrelated
 *     permission-grant entity (CHAR-002 AC4).
 *
 * Pure data + pure reducers. No GUI, no storage. The command handlers compose these; durable writes
 * go through the storage adapter + lifecycle, never from the GUI (Contract 1).
 */

export const CHARACTER_STATE_SCHEMA_VERSION = 1 as const;

/** The simplified character archetypes the DM can quick-create (CHAR-001). */
export type CharacterKind = 'npc' | 'monster' | 'sidekick' | 'pc';

/** The six ability scores. Optional on a quick-create — a stat-block NPC may omit them. */
export interface AbilityScores {
	str?: number;
	dex?: number;
	con?: number;
	int?: number;
	wis?: number;
	cha?: number;
}

/** A simplified attack line on a quick-created stat block (CHAR-001). */
export interface CharacterAttack {
	id: string;
	name: string;
	/** Free-form to-hit/damage text, e.g. "+5 to hit, 1d8+3 slashing". Kept as text for the prototype. */
	detail: string;
}

/**
 * The combat-relevant state a Scene widget can bind to (CHAR-001 "widget-bindable data"). Modeled as
 * its own object so the binding bridge can address `combat.hp` etc. without reaching into the whole
 * character. HP is the canonical bound field; temp HP, AC, and conditions round out a minimal combat
 * surface that the later CHAR combat epic extends rather than reshapes.
 */
export interface CharacterCombatState {
	/** Current hit points. The canonical widget-bound combat field (CHAR-001 AC1). */
	hp: number;
	/** Maximum hit points. */
	maxHp: number;
	/** Temporary hit points; absent ⇒ 0. */
	tempHp: number;
	/** Armor class. */
	ac: number;
	/** Active condition names (e.g. "prone"). The later conditions epic gives these structure. */
	conditions: string[];
}

export const EMPTY_COMBAT_STATE: CharacterCombatState = Object.freeze({
	hp: 0,
	maxHp: 0,
	tempHp: 0,
	ac: 10,
	conditions: [],
});

/** How proficient a character is with one skill. `expertise` doubles the proficiency bonus. */
export type SkillProficiencyLevel = 'none' | 'proficient' | 'expertise';

export const SKILL_PROFICIENCY_LEVELS: readonly SkillProficiencyLevel[] = Object.freeze([
	'none',
	'proficient',
	'expertise',
]);

/**
 * Structured PROFICIENCY state: per-skill proficiency levels, proficient saving throws, an optional
 * explicit proficiency bonus (null ⇒ derived from level by the standard 5e progression — see
 * `queries/character-query.ts`), and hit dice. Optional on {@link Character} so a character persisted
 * before this slice hydrates safely (absent ⇒ empty proficiencies via
 * {@link ensureCharacterProficiencies}).
 */
export interface CharacterProficiencies {
	/** Per-skill proficiency level keyed by skill name (e.g. `perception`). Absent skill ⇒ `none`. */
	skills: Record<string, SkillProficiencyLevel>;
	/** The ability ids (`str`…`cha`) the character is proficient in for saving throws. */
	saves: string[];
	/** Explicit proficiency bonus override, or null to derive it from the character level. */
	proficiencyBonus: number | null;
	/** Hit dice: the die (e.g. `d8`), total dice, and how many are spent. */
	hitDice: { die: string; total: number; spent: number };
}

export const EMPTY_CHARACTER_PROFICIENCIES: CharacterProficiencies = Object.freeze({
	skills: {},
	saves: [],
	proficiencyBonus: null,
	hitDice: Object.freeze({ die: 'd8', total: 0, spent: 0 }),
});

/** Tolerantly hydrate a possibly-absent/partial persisted proficiencies block (safe defaults). Pure. */
export function ensureCharacterProficiencies(
	proficiencies: CharacterProficiencies | undefined,
): CharacterProficiencies {
	return {
		skills: { ...(proficiencies?.skills ?? {}) },
		saves: [...(proficiencies?.saves ?? [])],
		proficiencyBonus:
			typeof proficiencies?.proficiencyBonus === 'number' &&
			Number.isFinite(proficiencies.proficiencyBonus)
				? proficiencies.proficiencyBonus
				: null,
		hitDice: {
			die: proficiencies?.hitDice?.die ?? EMPTY_CHARACTER_PROFICIENCIES.hitDice.die,
			total: proficiencies?.hitDice?.total ?? 0,
			spent: proficiencies?.hitDice?.spent ?? 0,
		},
	};
}

/**
 * A finalized character. The `data` block holds the player-/DM-authored sheet fields; visibility is
 * an entity-level default plus optional field-level overrides (e.g. `dmNotes` stays `dm-only` even on
 * a player-visible NPC). The combat block is the widget-bindable surface.
 */
export interface Character {
	id: string;
	kind: CharacterKind;
	name: string;
	/** Entity-level visibility (Contract 3 Axis 1). Fails closed to `dm-only` for DM-authored NPCs. */
	visibility: VisibilityLevel;
	/**
	 * Actor ids a `shared` character is explicitly delivered to (Contract 3 Axis 1). A finalized PC is
	 * `shared` with its creating player so the owner sees their own character without it being visible
	 * to the whole party; broader party visibility/grants are later CHAR epics.
	 */
	sharedWith: ActorId[];
	abilityScores: AbilityScores;
	/**
	 * RC-SYS-2.1 — scores keyed by the ACTIVE SYSTEM PACKAGE's attribute keys, for the attributes the
	 * six fixed `abilityScores` fields cannot hold (a package that renamed them, added a seventh, or
	 * dropped them entirely). Optional and absent on every 5e character — a key that aliases one of
	 * the six fixed fields is written there instead, so existing documents round-trip byte-identically
	 * and this slice needs no schema bump. Read both through {@link characterAttributes}.
	 */
	attributes?: Record<string, number>;
	attacks: CharacterAttack[];
	combat: CharacterCombatState;
	/** Open structured sheet data the later CHAR epics extend (backstory, resources, …). */
	data: Record<string, unknown>;
	/**
	 * Field paths within `data`/`combat` that stay `dm-only` even when the entity itself is visible
	 * (Contract 3 field-level visibility). Used so e.g. `dmNotes` is omitted from player queries.
	 */
	dmOnlyFields: string[];
	/** The actor that authored the character. The DM for NPCs; the finalizing player for a PC. */
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	/** Optimistic-concurrency revision, bumped on every accepted mutation. */
	revision: number;
	/** When a PC, the draft id it was finalized from; null for a DM quick-create. */
	finalizedFromDraftId: string | null;
	/**
	 * CHAR-004 / CHAR-005 / CHAR-014 — collaborative-edit sidecar: per-field authorship, append-only
	 * attributed edit history, and unresolved/resolved same-path conflicts. Optional so a character
	 * persisted before this slice hydrates safely (absent ⇒ no collaboration metadata). It annotates
	 * the SINGLE canonical `data`/`combat`/`name` values; it is NOT a second value layer.
	 */
	collaboration?: CharacterCollaboration;
	/**
	 * CHAR-007 / CHAR-008 — structured combat-resource + spell/resource state (death saves,
	 * concentration, spell slots, prepared spells, class resources, and expenditure history). Optional
	 * so a character persisted before this slice hydrates safely (absent ⇒ empty resources). It EXTENDS
	 * the model alongside the simplified `combat` quick-create surface; there is no parallel model.
	 */
	resources?: CharacterResources;
	/**
	 * Structured proficiency state (skills / saves / proficiency bonus / hit dice). Optional so a
	 * character persisted before this slice hydrates safely (absent ⇒ empty proficiencies via
	 * {@link ensureCharacterProficiencies}).
	 */
	proficiencies?: CharacterProficiencies;
	/**
	 * I10 S10.1.3 — structured EQUIPMENT / CURRENCY state (the coin purse + the equipment list whose
	 * weights drive the derived encumbrance). Optional so a character persisted before this slice
	 * hydrates safely (absent ⇒ empty inventory via `ensureCharacterInventory`). Like `resources`, it
	 * EXTENDS the model; carried weight / encumbrance / computed AC are DERIVED on read, never stored.
	 */
	inventory?: CharacterInventory;
	schemaVersion: typeof CHARACTER_STATE_SCHEMA_VERSION;
}

/** Read the proficiencies block off a character, hydrating safe defaults. Pure. */
export function proficienciesOf(character: Character): CharacterProficiencies {
	return ensureCharacterProficiencies(character.proficiencies);
}

// --- Package-keyed attributes (RC-SYS-2.1) --------------------------------------------------------

/**
 * RC-SYS-2.1 — a character's scores are no longer six hard-coded 5e abilities: they are whatever the
 * active `SystemPackage` declares in `attributes[]`, keyed by the package's attribute key.
 *
 * The durable document keeps BOTH shapes on purpose:
 *
 *   - {@link Character.abilityScores} stays exactly as it was written, so every vault ever saved
 *     round-trips byte-identically and `characters` needs NO schema bump (this is the same additive
 *     rule `proficiencies` / `inventory` followed).
 *   - {@link Character.attributes} is the OPEN map a non-5e package writes into. It is absent on
 *     every existing document and on every 5e character, which is what keeps the round-trip stable.
 *
 * {@link characterAttributes} is the HYDRATOR that turns the pair into one map, and
 * {@link abilityScoreKeyFor} is the alias that lets a package attribute key (`strength`, or a short
 * `str`) find the fixed field it was historically stored in.
 */

/** The six fixed {@link AbilityScores} fields, in canonical 5e order. */
export const ABILITY_SCORE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityScoreKey = (typeof ABILITY_SCORE_KEYS)[number];

/**
 * Package attribute key ⇒ the fixed {@link AbilityScores} field it hydrates from. Both the long 5e
 * key the built-in package uses (`strength`) and the short legacy key (`str`) resolve, so a
 * DM-authored package may spell its attributes either way and still read a character written before
 * packages existed.
 */
const ABILITY_SCORE_ALIASES: Readonly<Record<string, AbilityScoreKey>> = Object.freeze({
	str: 'str',
	strength: 'str',
	dex: 'dex',
	dexterity: 'dex',
	con: 'con',
	constitution: 'con',
	int: 'int',
	intelligence: 'int',
	wis: 'wis',
	wisdom: 'wis',
	cha: 'cha',
	charisma: 'cha',
});

/** The fixed ability field a package attribute key maps onto, or `null` when it maps onto none. Pure. */
export function abilityScoreKeyFor(attributeKey: string): AbilityScoreKey | null {
	return ABILITY_SCORE_ALIASES[attributeKey.trim().toLowerCase()] ?? null;
}

/**
 * The character's attribute scores as ONE map (RC-SYS-2.1 hydrator). The six fixed fields appear
 * under their short keys; an explicit `attributes` entry wins over the fixed field it aliases, so a
 * package that renamed an attribute is authoritative. Absent/non-finite values are omitted rather
 * than defaulted — "no score" and "score 0" are different facts. Pure; never mutates.
 */
export function characterAttributes(character: Character): Record<string, number> {
	const out: Record<string, number> = {};
	for (const key of ABILITY_SCORE_KEYS) {
		const score = character.abilityScores[key];
		if (typeof score === 'number' && Number.isFinite(score)) out[key] = score;
	}
	for (const [key, score] of Object.entries(character.attributes ?? {})) {
		if (typeof score === 'number' && Number.isFinite(score)) out[key] = score;
	}
	return out;
}

/**
 * One attribute score for a package attribute key, or `undefined` when the character has none.
 * Explicit `attributes` first, then the aliased fixed field. Pure.
 */
export function characterAttributeScore(
	character: Character,
	attributeKey: string,
): number | undefined {
	const explicit = character.attributes?.[attributeKey];
	if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
	const alias = abilityScoreKeyFor(attributeKey);
	if (alias === null) return undefined;
	const score = character.abilityScores[alias];
	return typeof score === 'number' && Number.isFinite(score) ? score : undefined;
}

/**
 * Set one attribute score, keeping the two shapes consistent (RC-SYS-2.1). A key that aliases one of
 * the six fixed fields writes THERE and nowhere else, so a 5e character's document stays exactly the
 * shape it has always had; any other key writes into the open `attributes` map. Pure: returns a new
 * character, and never adds an empty `attributes` object to a document that had none.
 */
export function setCharacterAttribute(
	character: Character,
	attributeKey: string,
	score: number,
): Character {
	const alias = abilityScoreKeyFor(attributeKey);
	if (alias !== null && character.attributes?.[attributeKey] === undefined) {
		return { ...character, abilityScores: { ...character.abilityScores, [alias]: score } };
	}
	return { ...character, attributes: { ...(character.attributes ?? {}), [attributeKey]: score } };
}

/** Drop empty attribute maps so a character with no package-keyed scores stores no `attributes`. Pure. */
export function normalizeCharacterAttributes(
	attributes: Record<string, number> | undefined,
): Record<string, number> | undefined {
	if (!attributes) return undefined;
	const entries = Object.entries(attributes).filter(
		([, score]) => typeof score === 'number' && Number.isFinite(score),
	);
	return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** One step in the guided PC-creation flow, recorded on the draft as the player progresses. */
export interface CharacterDraftStepProgress {
	/** The step id (see `character-draft-flow.ts` STEP order). */
	stepId: string;
	/** The player's choices for this step, validated by the pure flow validator. */
	values: Record<string, unknown>;
	/** Whether this step has been visited/saved (drives resume, distinct from validity). */
	completed: boolean;
}

/**
 * A pre-finalization character entity (CHAR-002 / CHAR-013). It is a CHARACTER entity in draft state,
 * not a permission-grant entity (CHAR-002 AC4): inspecting it by id yields draft fields.
 *
 * `ownerActorId` is the SINGULAR draft owner. Because it is one field, the draft structurally has
 * EXACTLY ONE owner — never zero (a draft always names its owner) and never two (a scalar cannot hold
 * two). Transfer reassigns this field atomically (see `transferDraftOwnership`), the SAME singular
 * ownership invariant as the PERM-013 character-ownership transfer, applied to the draft.
 */
export interface CharacterDraft {
	id: string;
	kind: 'pc';
	/** The working name; may be empty until the identity step is completed. */
	name: string;
	/** EXACTLY ONE draft owner at a time (CHAR-013). Only this actor may edit the draft (fail closed). */
	ownerActorId: ActorId;
	/** The DM who created/assigned the draft (retains administrative authority). */
	createdBy: ActorId;
	/** Per-step resumable progress (CHAR-002 AC2). Keyed by step id, ordered by the flow. */
	steps: CharacterDraftStepProgress[];
	/** Draft visibility. A draft defaults `dm-only`; the owner reads their own draft via ownership. */
	visibility: VisibilityLevel;
	createdAt: string;
	updatedAt: string;
	/** Optimistic-concurrency revision, bumped on every accepted draft mutation. */
	revision: number;
	/** True once finalized into a {@link Character}; a finalized draft is read-only/archived. */
	finalized: boolean;
	schemaVersion: typeof CHARACTER_STATE_SCHEMA_VERSION;
}

/**
 * CHAR-011 — durable PARTY-RECORD state: the party's marching order (an ordered list of character
 * ids) and party inventory (shared items, each with its OWN canonical visibility). It is party-scoped
 * (not per-character), so it lives alongside `characters`/`drafts` on the slice. The actor-filtered
 * party-overview query (`queries/party-overview.ts`) is the only sanctioned read path; marching-order
 * positions reference only characters the viewer may see, and inventory items are visibility-filtered.
 */
export interface PartyInventoryItem {
	id: string;
	name: string;
	/** Free-form quantity/detail text for the prototype (e.g. "3 torches", "Bag of Holding"). */
	detail: string;
	/**
	 * I10 S10.4.2 — how many of the item are in the stash (whole number ≥ 0). Drives the stash's
	 * derived total weight for the party-encumbrance baseline. Defaults to 1.
	 */
	quantity: number;
	/**
	 * I10 S10.4.2 — per-UNIT weight in pounds (≥ 0). The stash's total weight (Σ quantity × weight) is
	 * compared against the strongest visible character's carry capacity for the stash encumbrance
	 * indicator. Defaults to 0 (weightless / unweighed loot).
	 */
	weight: number;
	/** Per-item canonical visibility (Contract 3 Axis 1). Fails closed to `dm-only`. */
	visibility: VisibilityLevel;
	/** Actor ids a `shared` item is explicitly delivered to. Ignored for other levels. */
	sharedWith: ActorId[];
	revision: number;
}

export interface PartyRecord {
	/** Ordered character ids defining the marching order. May include `dm-only` characters. */
	marchingOrder: string[];
	/** The shared party inventory, each item independently visibility-filtered. */
	inventory: PartyInventoryItem[];
	revision: number;
}

export const EMPTY_PARTY_RECORD: PartyRecord = Object.freeze({
	marchingOrder: [],
	inventory: [],
	revision: 0,
});

export interface CharacterState {
	characters: Record<string, Character>;
	drafts: Record<string, CharacterDraft>;
	/**
	 * CHAR-011 — party-scoped marching order + party inventory. Optional so a slice persisted before
	 * this CHAR epic hydrates safely (absent ⇒ empty party record).
	 */
	party?: PartyRecord;
	/**
	 * CHAR-012 / CHAR-016 — per-character journals keyed by character id. Optional so a slice persisted
	 * before this CHAR epic hydrates safely (absent ⇒ empty journals). The actor-filtered journal query
	 * is the only sanctioned read path; the data layer enforces per-entry visibility.
	 */
	journals?: CharacterJournalState;
	schemaVersion: typeof CHARACTER_STATE_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_STATE: CharacterState = Object.freeze({
	characters: {},
	drafts: {},
	party: { ...EMPTY_PARTY_RECORD },
	journals: { ...EMPTY_CHARACTER_JOURNAL_STATE },
	schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
});

/** Read the journals slice off the character state, hydrating a safe empty default. Pure. */
export function journalsOf(state: CharacterState): CharacterJournalState {
	return ensureCharacterJournalState(state.journals);
}

/** Read the party record off the slice, hydrating a safe empty default. Pure. */
export function partyRecordOf(state: CharacterState): PartyRecord {
	return state.party
		? {
				marchingOrder: [...state.party.marchingOrder],
				// Default weight/quantity for items persisted before S10.4.2 added those fields (hydrate safe).
				inventory: state.party.inventory.map((item) => ({
					...item,
					quantity: typeof item.quantity === 'number' && item.quantity >= 0 ? item.quantity : 1,
					weight: typeof item.weight === 'number' && item.weight >= 0 ? item.weight : 0,
					sharedWith: [...item.sharedWith],
				})),
				revision: state.party.revision,
			}
		: { ...EMPTY_PARTY_RECORD };
}

/** Tolerantly hydrate a possibly-undefined/partial persisted character slice (safe defaults). */
export function ensureCharacterState(state: CharacterState | undefined): CharacterState {
	return {
		characters: state?.characters ?? {},
		drafts: state?.drafts ?? {},
		party: state?.party ?? { ...EMPTY_PARTY_RECORD },
		journals: ensureCharacterJournalState(state?.journals),
		schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
	};
}

/** Set the party's marching order (an ordered list of character ids), bumping the revision. Pure. */
export function setMarchingOrder(state: CharacterState, order: string[]): CharacterState {
	const party = partyRecordOf(state);
	return {
		...state,
		party: { ...party, marchingOrder: [...order], revision: party.revision + 1 },
	};
}

export interface UpsertPartyInventoryInput {
	id?: string;
	name: string;
	detail?: string;
	quantity?: number;
	weight?: number;
	visibility?: VisibilityLevel;
	sharedWith?: ActorId[];
}

/**
 * Add or update a party-inventory item (CHAR-011). Visibility fails closed to `dm-only` when omitted.
 * Pure: returns a new state. `idFor` supplies a new id when the input has none (a new item).
 */
export function upsertPartyInventoryItem(
	state: CharacterState,
	input: UpsertPartyInventoryInput,
	idFor: () => string,
): CharacterState {
	const party = partyRecordOf(state);
	const id = input.id ?? idFor();
	const existing = party.inventory.find((item) => item.id === id);
	const nonNeg = (value: number | undefined, fallback: number): number =>
		typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
	const item: PartyInventoryItem = {
		id,
		name: input.name,
		detail: input.detail ?? existing?.detail ?? '',
		quantity: nonNeg(input.quantity, existing?.quantity ?? 1),
		weight: nonNeg(input.weight, existing?.weight ?? 0),
		visibility: normalizeVisibilityLevel(
			input.visibility ?? existing?.visibility ?? DEFAULT_VISIBILITY,
		),
		sharedWith: [...new Set(input.sharedWith ?? existing?.sharedWith ?? [])],
		revision: (existing?.revision ?? 0) + 1,
	};
	const inventory = existing
		? party.inventory.map((i) => (i.id === id ? item : i))
		: [...party.inventory, item];
	return { ...state, party: { ...party, inventory, revision: party.revision + 1 } };
}

/** Remove a party-inventory item. Pure: no-op when absent. */
export function removePartyInventoryItem(state: CharacterState, itemId: string): CharacterState {
	const party = partyRecordOf(state);
	if (!party.inventory.some((item) => item.id === itemId)) return state;
	return {
		...state,
		party: {
			...party,
			inventory: party.inventory.filter((item) => item.id !== itemId),
			revision: party.revision + 1,
		},
	};
}

/** The entity type strings these documents are addressed by in grants/visibility/bindings. */
export const CHARACTER_ENTITY_TYPE = 'character' as const;
export const CHARACTER_DRAFT_ENTITY_TYPE = 'character-draft' as const;

// --- Pure quick-create reducer (CHAR-001) ---------------------------------------------------------

export interface QuickCreateCharacterInput {
	kind: Exclude<CharacterKind, 'pc'>;
	name: string;
	visibility?: VisibilityLevel;
	abilityScores?: AbilityScores;
	/** RC-SYS-2.1 — package-keyed scores for attributes the six fixed fields cannot hold. */
	attributes?: Record<string, number>;
	attacks?: Array<{ id?: string; name: string; detail?: string }>;
	combat?: Partial<CharacterCombatState>;
	data?: Record<string, unknown>;
	dmOnlyFields?: string[];
}

/**
 * Build a finalized DM-authored character from quick-create input (CHAR-001).
 *
 * VISIBILITY FAILS CLOSED: when `visibility` is omitted the character defaults to `dm-only`, so a
 * DM-authored NPC is invisible to players/observers unless the DM explicitly shares it (CHAR-001 AC2).
 * The combat block is fully populated (with safe defaults) so it is immediately widget-bindable
 * (CHAR-001 AC1). Pure: takes its id/clock from `meta`, never from ambient entropy.
 */
export function buildQuickCreatedCharacter(
	input: QuickCreateCharacterInput,
	meta: { id: string; createdBy: ActorId; now: string; attackIds: () => string },
): Character {
	const combat: CharacterCombatState = {
		hp: input.combat?.hp ?? input.combat?.maxHp ?? EMPTY_COMBAT_STATE.hp,
		maxHp: input.combat?.maxHp ?? input.combat?.hp ?? EMPTY_COMBAT_STATE.maxHp,
		tempHp: input.combat?.tempHp ?? EMPTY_COMBAT_STATE.tempHp,
		ac: input.combat?.ac ?? EMPTY_COMBAT_STATE.ac,
		conditions: input.combat?.conditions ? [...input.combat.conditions] : [],
	};
	const attacks: CharacterAttack[] = (input.attacks ?? []).map((attack) => ({
		id: attack.id ?? meta.attackIds(),
		name: attack.name,
		detail: attack.detail ?? '',
	}));
	// RC-SYS-2.1 — package-keyed scores split the same way `setCharacterAttribute` splits them: a key
	// that aliases one of the six fixed fields lands there (an explicit `abilityScores` value still
	// wins, it is the more specific input), anything else lands in the open `attributes` map. A 5e
	// quick-create therefore produces exactly the document it always did, with no `attributes` key.
	const abilityScores: AbilityScores = { ...(input.abilityScores ?? {}) };
	const openAttributes: Record<string, number> = {};
	for (const [key, score] of Object.entries(input.attributes ?? {})) {
		if (typeof score !== 'number' || !Number.isFinite(score)) continue;
		const alias = abilityScoreKeyFor(key);
		if (alias !== null) {
			if (abilityScores[alias] === undefined) abilityScores[alias] = score;
		} else {
			openAttributes[key] = score;
		}
	}
	const attributes = normalizeCharacterAttributes(openAttributes);
	return {
		id: meta.id,
		kind: input.kind,
		name: input.name,
		// Fail closed: no explicit visibility ⇒ dm-only (CHAR-001 AC2).
		visibility: normalizeVisibilityLevel(input.visibility ?? DEFAULT_VISIBILITY),
		sharedWith: [],
		abilityScores,
		...(attributes ? { attributes } : {}),
		attacks,
		combat,
		data: { ...(input.data ?? {}) },
		dmOnlyFields: [...new Set(input.dmOnlyFields ?? [])],
		createdBy: meta.createdBy,
		createdAt: meta.now,
		updatedAt: meta.now,
		revision: 1,
		finalizedFromDraftId: null,
		schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
	};
}

/** Add/replace a character in the slice. Pure: returns a new state, never mutates the input. */
export function upsertCharacter(state: CharacterState, character: Character): CharacterState {
	return {
		...state,
		characters: { ...state.characters, [character.id]: character },
	};
}

// --- Pure draft reducers (CHAR-002 / CHAR-013) ----------------------------------------------------

export interface CreateDraftInput {
	ownerActorId: ActorId;
	name?: string;
	visibility?: VisibilityLevel;
}

/**
 * Create a PC draft assigned to exactly one owner (CHAR-013). The draft is empty/resumable: it starts
 * with no completed steps and the owner resumes/edits it through the flow. Fails closed on visibility
 * (defaults `dm-only`).
 */
export function buildCharacterDraft(
	input: CreateDraftInput,
	meta: { id: string; createdBy: ActorId; now: string },
): CharacterDraft {
	return {
		id: meta.id,
		kind: 'pc',
		name: input.name ?? '',
		ownerActorId: input.ownerActorId,
		createdBy: meta.createdBy,
		steps: [],
		visibility: normalizeVisibilityLevel(input.visibility ?? DEFAULT_VISIBILITY),
		createdAt: meta.now,
		updatedAt: meta.now,
		revision: 1,
		finalized: false,
		schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
	};
}

/** Add/replace a draft in the slice. Pure. */
export function upsertDraft(state: CharacterState, draft: CharacterDraft): CharacterState {
	return {
		...state,
		drafts: { ...state.drafts, [draft.id]: draft },
	};
}

/** Whether `actorId` is the SINGLE draft owner allowed to edit the draft (CHAR-002 / CHAR-013). */
export function isDraftOwner(draft: CharacterDraft, actorId: ActorId): boolean {
	return draft.ownerActorId === actorId;
}

/**
 * Apply a step's saved values to the draft, marking that step completed, and bump the revision
 * (CHAR-002 resumable progress). Pure: returns a NEW draft. The values are not validated here —
 * step validity is computed separately by the pure flow validator so a partial step still persists
 * and can be resumed (CHAR-002 AC2).
 */
export function applyDraftStep(
	draft: CharacterDraft,
	stepId: string,
	values: Record<string, unknown>,
	now: string,
): CharacterDraft {
	const existingIndex = draft.steps.findIndex((step) => step.stepId === stepId);
	const nextStep: CharacterDraftStepProgress = { stepId, values: { ...values }, completed: true };
	const steps =
		existingIndex === -1
			? [...draft.steps, nextStep]
			: draft.steps.map((step, index) => (index === existingIndex ? nextStep : step));
	return { ...draft, steps, updatedAt: now, revision: draft.revision + 1 };
}

/** The collected step values across the draft, keyed by step id (for validation/finalization). */
export function draftStepValues(draft: CharacterDraft): Record<string, Record<string, unknown>> {
	const out: Record<string, Record<string, unknown>> = {};
	for (const step of draft.steps) out[step.stepId] = step.values;
	return out;
}

/** A typed reason a draft-ownership transfer was rejected. Fail-closed and DM-authored only. */
export type DraftTransferError = 'draft-not-found' | 'draft-finalized' | 'same-owner';

export type DraftTransferResult =
	| { ok: true; draft: CharacterDraft; previousOwnerActorId: ActorId }
	| { ok: false; error: DraftTransferError; message: string };

/**
 * ATOMICALLY transfer draft ownership to a new owner (CHAR-013), the SAME singular-ownership invariant
 * as the PERM-013 character-ownership transfer. Because the owner is a single scalar field, reassigning
 * it revokes the prior owner and assigns the new owner in ONE pure step — there is never a window with
 * zero or two owners. After transfer the prior owner can no longer edit (fail closed via
 * {@link isDraftOwner}); the new owner can resume.
 *
 * Fails closed: a missing or finalized draft is rejected, and re-assigning the SAME owner is a no-op
 * rejection (`same-owner`) so the caller does not record an empty transfer.
 */
export function transferDraftOwnership(
	state: CharacterState,
	draftId: string,
	toOwnerActorId: ActorId,
	now: string,
): DraftTransferResult {
	const draft = state.drafts[draftId];
	if (!draft) {
		return { ok: false, error: 'draft-not-found', message: `Draft ${draftId} does not exist.` };
	}
	if (draft.finalized) {
		return {
			ok: false,
			error: 'draft-finalized',
			message: 'A finalized draft can no longer be transferred.',
		};
	}
	if (draft.ownerActorId === toOwnerActorId) {
		return {
			ok: false,
			error: 'same-owner',
			message: 'The draft is already owned by that player.',
		};
	}
	const previousOwnerActorId = draft.ownerActorId;
	// One atomic reassignment: prior owner replaced by the new owner in the same value.
	const next: CharacterDraft = {
		...draft,
		ownerActorId: toOwnerActorId,
		updatedAt: now,
		revision: draft.revision + 1,
	};
	return { ok: true, draft: next, previousOwnerActorId };
}

/** Remove a draft from the slice (revoke without reassigning). Pure. */
export function removeDraft(state: CharacterState, draftId: string): CharacterState {
	if (!state.drafts[draftId]) return state;
	const drafts = { ...state.drafts };
	delete drafts[draftId];
	return { ...state, drafts };
}
