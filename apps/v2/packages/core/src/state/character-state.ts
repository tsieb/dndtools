import type { ActorId } from './ids';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { DEFAULT_VISIBILITY, normalizeVisibilityLevel } from '../permissions/visibility-filter';
import type { CharacterCollaboration } from './character-collaboration';
import type { CharacterResources } from './character-resources';

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
	schemaVersion: typeof CHARACTER_STATE_SCHEMA_VERSION;
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

export interface CharacterState {
	characters: Record<string, Character>;
	drafts: Record<string, CharacterDraft>;
	schemaVersion: typeof CHARACTER_STATE_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_STATE: CharacterState = Object.freeze({
	characters: {},
	drafts: {},
	schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-undefined/partial persisted character slice (safe defaults). */
export function ensureCharacterState(state: CharacterState | undefined): CharacterState {
	return {
		characters: state?.characters ?? {},
		drafts: state?.drafts ?? {},
		schemaVersion: CHARACTER_STATE_SCHEMA_VERSION,
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
	return {
		id: meta.id,
		kind: input.kind,
		name: input.name,
		// Fail closed: no explicit visibility ⇒ dm-only (CHAR-001 AC2).
		visibility: normalizeVisibilityLevel(input.visibility ?? DEFAULT_VISIBILITY),
		sharedWith: [],
		abilityScores: { ...(input.abilityScores ?? {}) },
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
