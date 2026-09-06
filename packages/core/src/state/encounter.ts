import type { ActorId } from './ids';
import type { CombatantKind } from './combat-tracker';
import type { SystemPackage } from './system-package';
import { DND5E_SYSTEM_PACKAGE } from '../systems/dnd5e';

/**
 * SES-006 — the DURABLE ENCOUNTER model + the PURE deterministic CHALLENGE GUIDANCE calculator.
 *
 * The DM builds an encounter from COMBATANT SELECTION + party context and gets deterministic CR /
 * difficulty guidance, plus terrain notes, legendary/lair actions, loot, and GENERATED SESSION LOG
 * LINKS. The encounter is DURABLE and modeled CONSISTENT with the declared `encounter` Vault Object
 * subtype (`state/vault-object-schema.ts`): its `title`/`difficulty`/`participantIds` map onto that
 * subtype's frontmatter contract, so an encounter can be projected as a note-backed object without a
 * second model. It LINKS to notes / the session log BY REFERENCE (ids only) — never a clone
 * (Architecture Contract 4: a link/embed owns only the reference; the target owns its data).
 *
 * The CHALLENGE GUIDANCE is a PURE deterministic function of (selected combatants + party): the same
 * inputs always yield the same difficulty band. NO ambient randomness, clock, or storage — this is
 * Processing-Core policy (Contract 1). The command layer composes these reducers and appends a
 * durable op; the GUI dispatches intents and renders the computed guidance.
 */

export const ENCOUNTER_SCHEMA_VERSION = 1 as const;

/** The entity type encounters are addressed by in grants/visibility/ops. Mirrors the Vault Object subtype. */
export const ENCOUNTER_ENTITY_TYPE = 'encounter' as const;

/** The five difficulty bands the challenge calculator resolves to (matches the encounter subtype). */
export type EncounterDifficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

export const ENCOUNTER_DIFFICULTIES: readonly EncounterDifficulty[] = [
	'trivial',
	'easy',
	'medium',
	'hard',
	'deadly',
] as const;

/**
 * One selected combatant in the encounter build (SES-006 combatant selection). It is the encounter's
 * blueprint for a tracker combatant: a name, kind, optional character-entity reference, and the
 * challenge inputs (CR + quantity). When the encounter starts, each selection becomes a tracker
 * {@link import('./combat-tracker').Combatant}.
 */
export interface EncounterCombatantSelection {
	id: string;
	kind: CombatantKind;
	name: string;
	/** When this selection IS a character entity, its id (a reference, never a clone); else null. */
	characterId: string | null;
	/** The combatant's Challenge Rating (for monsters/NPCs). 0 for a CR-0 creature. */
	challengeRating: number;
	/** How many of this combatant the encounter includes (≥1). */
	quantity: number;
	/** Stat-block hit points used to seed the tracker combatant when combat starts. */
	maxHp: number;
	/** Armor class used to seed the tracker stat-block preview. */
	ac: number;
	/** Initiative modifier / score used to seed the tracker stat-block preview. */
	initiative: number;
	/** Whether this combatant starts HIDDEN from players when combat begins (e.g. an ambush). */
	hidden: boolean;
}

/** A LEGENDARY or LAIR action declared on the encounter (SES-006). Free-form text for the prototype. */
export interface EncounterSpecialAction {
	id: string;
	kind: 'legendary' | 'lair';
	name: string;
	detail: string;
}

/** One loot item the encounter awards (SES-006). */
export interface EncounterLootItem {
	id: string;
	name: string;
	detail: string;
}

/**
 * A GENERATED SESSION LOG LINK (SES-006): a reference from the encounter to a note / session-log entry
 * BY ID. The encounter stores ONLY the reference (kind + target id + label) — never the target's
 * content (Contract 4). Resolving the link is the reader's job through the actor-filtered query.
 */
export interface SessionLogLink {
	id: string;
	/** What the link points at. `note` → a content item; `encounter-log` → this encounter's combat log. */
	kind: 'note' | 'encounter-log' | 'session-log';
	/** The target id (a content-item id, or this encounter's id for its own combat log). */
	targetId: string;
	/** A human label for the link (never the target's content). */
	label: string;
}

/** The party context the challenge calculator weighs the encounter against (SES-006). */
export interface PartyContext {
	/** Number of player characters in the party (≥1). */
	size: number;
	/** Average party level (1–20). */
	averageLevel: number;
}

/** The deterministic challenge-guidance result (SES-006). Pure output of (combatants + party). */
export interface EncounterChallenge {
	difficulty: EncounterDifficulty;
	/** Total adjusted encounter "challenge points" (a deterministic CR-derived total). */
	encounterPoints: number;
	/** The party's deterministic budget threshold for a `deadly` encounter. */
	partyDeadlyThreshold: number;
	/** Total head-count of monster/NPC combatants (party PCs are not counted as a threat). */
	threatCount: number;
}

/** A durable encounter (SES-006). Consistent with the `encounter` Vault Object subtype. */
export interface Encounter {
	id: string;
	title: string;
	/** Combatant selection — the encounter's roster (SES-006). */
	combatants: EncounterCombatantSelection[];
	/** The party context the guidance was computed against. */
	party: PartyContext;
	/** TERRAIN NOTES — free-form battlefield description (SES-006). */
	terrainNotes: string;
	/** LEGENDARY / LAIR actions (SES-006). */
	specialActions: EncounterSpecialAction[];
	/** LOOT awarded (SES-006). */
	loot: EncounterLootItem[];
	/** GENERATED SESSION LOG LINKS — references to notes / the session log, never clones (SES-006). */
	sessionLogLinks: SessionLogLink[];
	/** The actor that authored the encounter (the DM). */
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
	schemaVersion: typeof ENCOUNTER_SCHEMA_VERSION;
}

/** The durable encounter slice: encounters keyed by id. */
export interface EncounterState {
	encounters: Record<string, Encounter>;
	schemaVersion: typeof ENCOUNTER_SCHEMA_VERSION;
}

export const EMPTY_ENCOUNTER_STATE: EncounterState = Object.freeze({
	encounters: {},
	schemaVersion: ENCOUNTER_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-undefined/partial persisted encounter slice (safe defaults). */
export function ensureEncounterState(state: EncounterState | undefined): EncounterState {
	const encounters: Record<string, Encounter> = {};
	for (const [id, encounter] of Object.entries(state?.encounters ?? {})) {
		encounters[id] = cloneEncounter(encounter);
	}
	return { encounters, schemaVersion: ENCOUNTER_SCHEMA_VERSION };
}

/** Deep-clone an encounter so callers never mutate shared state. Pure. */
export function cloneEncounter(encounter: Encounter): Encounter {
	return {
		...encounter,
		combatants: encounter.combatants.map((c) => ({ ...c })),
		party: { ...encounter.party },
		specialActions: encounter.specialActions.map((a) => ({ ...a })),
		loot: encounter.loot.map((l) => ({ ...l })),
		sessionLogLinks: encounter.sessionLogLinks.map((link) => ({ ...link })),
	};
}

/** The encounter with this id, or `undefined`. Pure. */
export function encounterById(state: EncounterState, encounterId: string): Encounter | undefined {
	return state.encounters[encounterId];
}

// --- Deterministic CR / difficulty CHALLENGE GUIDANCE (SES-006) ----------------------------------

/**
 * RC-SYS-2.5 — the creature-schema field key a package declares to say "my creatures have a
 * challenge rating". A package that does not declare it has no CR to sum.
 */
export const SYSTEM_CHALLENGE_FIELD_KEY = 'challengeRating' as const;

/**
 * RC-SYS-2.5 — does the ACTIVE system package declare a challenge/XP budget at all?
 *
 * The budget is two halves and a package needs BOTH for the answer to mean anything:
 *   - the THREAT half: its `creatureSchema` declares a `challengeRating` field, so a creature in
 *     this system carries a rating that can be summed;
 *   - the PARTY half: its `advancement` is an `xp-table` with thresholds, so "a party of N at level
 *     L" is a quantity the system actually defines.
 *
 * D&D 5e declares both. The built-in Generic package declares neither: its creatures have a name, a
 * concept and health, and it advances by milestone. Under Generic there is no honest number to show,
 * so {@link computeEncounterChallenge} returns `null` and the meter goes away rather than showing a
 * budget the system never promised. Pure.
 */
export function systemDeclaresChallenge(pkg: SystemPackage): boolean {
	const hasCr = pkg.creatureSchema.some((field) => field.key === SYSTEM_CHALLENGE_FIELD_KEY);
	const hasLevels = pkg.advancement.model === 'xp-table' && pkg.advancement.xpThresholds.length > 0;
	return hasCr && hasLevels;
}

/**
 * Convert a single Challenge Rating to deterministic "challenge points" — a monotone, integer-stable
 * mapping derived from the 5e CR→XP table, scaled down to small integers so the math stays exact and
 * reproducible (no floating-point drift). Fractional CRs (1/8, 1/4, 1/2) map to small points; higher
 * CRs grow roughly with the XP curve. Pure: a total function of CR with a safe clamp.
 */
export function challengePointsForCr(challengeRating: number): number {
	if (!Number.isFinite(challengeRating) || challengeRating < 0) return 0;
	// A compact, deterministic CR→points table for the common low/mid band, then a linear extension.
	const TABLE: Record<string, number> = {
		'0': 1,
		'0.125': 2,
		'0.25': 5,
		'0.5': 10,
		'1': 20,
		'2': 45,
		'3': 70,
		'4': 110,
		'5': 180,
		'6': 230,
		'7': 290,
		'8': 390,
		'9': 500,
		'10': 590,
	};
	const key = String(challengeRating);
	if (key in TABLE) return TABLE[key]!;
	// Above CR 10: extend linearly from the CR-10 anchor so very high CRs stay deterministic.
	if (challengeRating > 10) return 590 + Math.round((challengeRating - 10) * 120);
	// A non-tabulated fractional/odd CR rounds down to the nearest tabulated integer CR.
	const floored = Math.floor(challengeRating);
	return TABLE[String(floored)] ?? 1;
}

/**
 * The party's deterministic DEADLY threshold — the total challenge points at or above which an
 * encounter is `deadly`. Derived from party size × average level (a monotone integer function), so a
 * bigger / higher-level party tolerates more challenge before an encounter is deadly. Pure.
 */
export function partyDeadlyThreshold(party: PartyContext): number {
	const size = Math.max(1, Math.floor(party.size));
	const level = Math.min(20, Math.max(1, Math.floor(party.averageLevel)));
	// Per-character deadly budget grows with level; the party total is per-character × size.
	const perCharacter = 25 + level * 15;
	return perCharacter * size;
}

/**
 * The encounter-multiplier applied to the raw monster points based on how MANY monsters there are
 * (more monsters = more action economy = harder), following the 5e multiplier bands. Deterministic
 * integer-scaled (×100 then divided) so the result stays exact. Pure.
 */
function multiplierHundredths(threatCount: number): number {
	if (threatCount <= 1) return 100;
	if (threatCount === 2) return 150;
	if (threatCount <= 6) return 200;
	if (threatCount <= 10) return 250;
	if (threatCount <= 14) return 300;
	return 400;
}

/**
 * SES-006 — compute deterministic CHALLENGE GUIDANCE from the selected combatants + party context.
 *
 * Steps (all integer-exact, so the same inputs always yield the same band):
 *   1. Sum challenge points across every MONSTER/NPC selection (PCs are not threats), weighted by
 *      quantity.
 *   2. Multiply by the action-economy multiplier for the total threat head-count.
 *   3. Compare the adjusted total against the party's deterministic difficulty thresholds, derived
 *      from the deadly threshold, to resolve the band: trivial / easy / medium / hard / deadly.
 *
 * Returns `null` when the active package declares no challenge/XP budget
 * ({@link systemDeclaresChallenge}).
 *
 * Pure: no ambient randomness, clock, or storage.
 */
export function computeEncounterChallenge(
	combatants: EncounterCombatantSelection[],
	party: PartyContext,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): EncounterChallenge | null {
	// RC-SYS-2.5: no declaration, no number. Fail honest rather than quoting 5e math at a system
	// that has neither challenge ratings nor levels.
	if (!systemDeclaresChallenge(pkg)) return null;
	let rawPoints = 0;
	let threatCount = 0;
	for (const selection of combatants) {
		// A party PC standing in the initiative order is not a THREAT to the party.
		if (selection.kind === 'character') continue;
		const quantity = Math.max(0, Math.floor(selection.quantity));
		threatCount += quantity;
		rawPoints += challengePointsForCr(selection.challengeRating) * quantity;
	}
	const encounterPoints = Math.round((rawPoints * multiplierHundredths(threatCount)) / 100);
	const deadly = partyDeadlyThreshold(party);
	// Difficulty bands as deterministic fractions of the deadly threshold.
	const hard = Math.round(deadly * 0.75);
	const medium = Math.round(deadly * 0.5);
	const easy = Math.round(deadly * 0.25);

	let difficulty: EncounterDifficulty;
	if (encounterPoints >= deadly) difficulty = 'deadly';
	else if (encounterPoints >= hard) difficulty = 'hard';
	else if (encounterPoints >= medium) difficulty = 'medium';
	else if (encounterPoints >= easy) difficulty = 'easy';
	else difficulty = 'trivial';

	return {
		difficulty,
		encounterPoints,
		partyDeadlyThreshold: deadly,
		threatCount,
	};
}

// --- Pure encounter reducers (SES-006) -----------------------------------------------------------

export interface BuildEncounterInput {
	title: string;
	combatants?: Array<Partial<EncounterCombatantSelection> & { name: string; kind: CombatantKind }>;
	party?: Partial<PartyContext>;
	terrainNotes?: string;
	specialActions?: Array<
		Partial<EncounterSpecialAction> & { kind: 'legendary' | 'lair'; name: string }
	>;
	loot?: Array<Partial<EncounterLootItem> & { name: string }>;
	sessionLogLinks?: Array<
		Partial<SessionLogLink> & { kind: SessionLogLink['kind']; targetId: string }
	>;
}

export interface EncounterMeta {
	id: string;
	createdBy: ActorId;
	now: string;
	/** Supplies ids for nested records (combatants, actions, loot, links) that come without one. */
	childIds: () => string;
}

const DEFAULT_PARTY: PartyContext = { size: 4, averageLevel: 1 };

/** Build a durable encounter from build input (SES-006). Pure: takes its ids/clock from `meta`. */
export function buildEncounter(input: BuildEncounterInput, meta: EncounterMeta): Encounter {
	return {
		id: meta.id,
		title: input.title,
		combatants: (input.combatants ?? []).map((c) => normalizeSelection(c, meta.childIds)),
		party: {
			size: Math.max(1, Math.floor(input.party?.size ?? DEFAULT_PARTY.size)),
			averageLevel: Math.min(
				20,
				Math.max(1, Math.floor(input.party?.averageLevel ?? DEFAULT_PARTY.averageLevel)),
			),
		},
		terrainNotes: input.terrainNotes ?? '',
		specialActions: (input.specialActions ?? []).map((a) => ({
			id: a.id ?? meta.childIds(),
			kind: a.kind,
			name: a.name,
			detail: a.detail ?? '',
		})),
		loot: (input.loot ?? []).map((l) => ({
			id: l.id ?? meta.childIds(),
			name: l.name,
			detail: l.detail ?? '',
		})),
		sessionLogLinks: (input.sessionLogLinks ?? []).map((link) => ({
			id: link.id ?? meta.childIds(),
			kind: link.kind,
			targetId: link.targetId,
			label: link.label ?? '',
		})),
		createdBy: meta.createdBy,
		createdAt: meta.now,
		updatedAt: meta.now,
		revision: 1,
		schemaVersion: ENCOUNTER_SCHEMA_VERSION,
	};
}

/** Normalize a partial combatant selection to a full record with safe defaults. Pure. */
function normalizeSelection(
	input: Partial<EncounterCombatantSelection> & { name: string; kind: CombatantKind },
	childIds: () => string,
): EncounterCombatantSelection {
	return {
		id: input.id ?? childIds(),
		kind: input.kind,
		name: input.name,
		characterId: input.characterId ?? null,
		challengeRating: Math.max(0, input.challengeRating ?? 0),
		quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
		maxHp: Math.max(0, Math.floor(input.maxHp ?? 0)),
		ac: Math.max(0, Math.floor(input.ac ?? 10)),
		initiative: Math.floor(input.initiative ?? 0),
		hidden: input.hidden ?? false,
	};
}

/** Insert/replace an encounter in the slice. Pure: returns a new state. */
export function upsertEncounter(state: EncounterState, encounter: Encounter): EncounterState {
	return { ...state, encounters: { ...state.encounters, [encounter.id]: encounter } };
}

export interface UpdateEncounterPatch {
	title?: string;
	combatants?: EncounterCombatantSelection[];
	party?: PartyContext;
	terrainNotes?: string;
	specialActions?: EncounterSpecialAction[];
	loot?: EncounterLootItem[];
	sessionLogLinks?: SessionLogLink[];
}

/**
 * Apply a patch to an encounter, bumping its revision. Returns `null` when the encounter does not
 * exist (the caller rejects). Pure.
 */
export function updateEncounter(
	state: EncounterState,
	encounterId: string,
	patch: UpdateEncounterPatch,
	now: string,
): EncounterState | null {
	const existing = state.encounters[encounterId];
	if (!existing) return null;
	const next: Encounter = {
		...existing,
		title: patch.title ?? existing.title,
		combatants: patch.combatants ? patch.combatants.map((c) => ({ ...c })) : existing.combatants,
		party: patch.party ? { ...patch.party } : existing.party,
		terrainNotes: patch.terrainNotes ?? existing.terrainNotes,
		specialActions: patch.specialActions
			? patch.specialActions.map((a) => ({ ...a }))
			: existing.specialActions,
		loot: patch.loot ? patch.loot.map((l) => ({ ...l })) : existing.loot,
		sessionLogLinks: patch.sessionLogLinks
			? patch.sessionLogLinks.map((link) => ({ ...link }))
			: existing.sessionLogLinks,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return { ...state, encounters: { ...state.encounters, [encounterId]: next } };
}
