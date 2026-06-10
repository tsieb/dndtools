import type { ActorId } from './ids';
import type { Character } from './character-state';

/**
 * CHAR-009 — level-up / ADVANCEMENT, with VALIDATION before the character revision is FINALIZED.
 *
 * Advancement reuses the STAGED-THEN-COMMIT pattern proven by the PC draft flow
 * (`character-draft-flow.ts`): the owner opens an advancement DRAFT on the character, fills in the
 * required choices step by step, and the pure validator computes completeness from the draft. The
 * character revision is only mutated on COMMIT, and a commit is rejected fail-closed unless the draft
 * passes validation — so an invalid or incomplete advancement NEVER partially mutates the character
 * (CHAR-009 AC1, no-partial-commit). The staged draft is carried on the character so it persists and
 * restores across an app restart with its validation state intact (CHAR-009 AC3).
 *
 * Two modes (CHAR-009): XP advancement gates eligibility on the XP threshold for the next level;
 * MILESTONE advancement is DM/owner-declared and skips the XP gate. Both require the same level-up
 * choices to be valid before commit.
 *
 * Pure Processing-Core policy (Contract 1): the XP table, the level bound, and the required-choice
 * rules are deterministic data/functions; no GUI, storage, or ambient clock/entropy.
 */

export const CHARACTER_ADVANCEMENT_SCHEMA_VERSION = 1 as const;

/** The two advancement modes (CHAR-009). */
export type AdvancementMode = 'xp' | 'milestone';

/** The maximum level the prototype rule system supports. */
export const MAX_CHARACTER_LEVEL = 20 as const;

/**
 * The cumulative XP required to REACH each level (5e-style), indexed by level. Level 1 requires 0 XP.
 * Kept as data so eligibility is auditable and deterministic. Levels beyond the table are unreachable.
 */
export const XP_THRESHOLDS: readonly number[] = Object.freeze([
	0, // (unused index 0)
	0, // level 1
	300, // level 2
	900, // level 3
	2700, // level 4
	6500, // level 5
	14000, // level 6
	23000, // level 7
	34000, // level 8
	48000, // level 9
	64000, // level 10
	85000, // level 11
	100000, // level 12
	120000, // level 13
	140000, // level 14
	165000, // level 15
	195000, // level 16
	225000, // level 17
	265000, // level 18
	305000, // level 19
	355000, // level 20
]);

/** The cumulative XP needed to reach `level`, or null when `level` is out of the supported range. */
export function xpForLevel(level: number): number | null {
	if (!Number.isInteger(level) || level < 1 || level > MAX_CHARACTER_LEVEL) return null;
	return XP_THRESHOLDS[level] ?? null;
}

/** The staged choices the owner makes during a level-up (CHAR-009 "selects class options"). */
export interface AdvancementChoices {
	/** The class gaining the level (required). */
	className?: string;
	/** Hit points gained this level (required, must be a positive whole number). */
	hitPointsGained?: number;
	/** A subclass selection, required only when the target level is the subclass level. */
	subclass?: string;
	/** An ability-score-improvement or feat selection, required only at ASI levels. */
	abilityOrFeat?: string;
}

/**
 * The staged advancement draft carried on a character while a level-up is in progress (CHAR-009).
 * Because it lives on the durable character, it persists and restores across restarts with its
 * validation state intact (AC3). It is REMOVED on commit (the character moves to the new level) or
 * on cancel.
 */
export interface AdvancementDraft {
	mode: AdvancementMode;
	/** The level the character is advancing FROM (its current level). */
	fromLevel: number;
	/** The level the character is advancing TO (`fromLevel + 1`). */
	toLevel: number;
	choices: AdvancementChoices;
	/** The actor that opened the advancement (the owner). */
	openedBy: ActorId;
	openedAt: string;
	updatedAt: string;
	schemaVersion: typeof CHARACTER_ADVANCEMENT_SCHEMA_VERSION;
}

/** The character's current advancement standing: level, XP, and any in-progress draft. */
export interface AdvancementState {
	level: number;
	xp: number;
	draft: AdvancementDraft | null;
}

/** The level/XP fields are stored on `Character.data` under these keys (string-typed read/write). */
const LEVEL_KEY = 'level';
const XP_KEY = 'xp';
const ADVANCEMENT_DRAFT_KEY = 'advancementDraft';

function readNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

/** Read the character's current level (defaults to 1 when unset). */
export function characterLevel(character: Character): number {
	return Math.max(1, Math.trunc(readNumber(character.data[LEVEL_KEY], 1)));
}

/** Read the character's current XP (defaults to 0 when unset). */
export function characterXp(character: Character): number {
	return Math.max(0, Math.trunc(readNumber(character.data[XP_KEY], 0)));
}

/** Read the in-progress advancement draft off a character, or null. */
export function advancementDraftOf(character: Character): AdvancementDraft | null {
	const raw = character.data[ADVANCEMENT_DRAFT_KEY];
	if (!raw || typeof raw !== 'object') return null;
	return raw as AdvancementDraft;
}

/** The full advancement standing for a character (CHAR-009 read model). */
export function advancementStateOf(character: Character): AdvancementState {
	return {
		level: characterLevel(character),
		xp: characterXp(character),
		draft: advancementDraftOf(character),
	};
}

// --- Eligibility + draft lifecycle (pure) -------------------------------------------------------

export type AdvancementError =
	| 'already-at-max-level'
	| 'xp-below-threshold'
	| 'advancement-in-progress'
	| 'no-advancement-in-progress'
	| 'advancement-incomplete'
	| 'invalid-mode';

/** Whether the character is eligible to OPEN a level-up to the next level (CHAR-009 eligibility). */
export type EligibilityResult =
	| { eligible: true; toLevel: number }
	| { eligible: false; error: AdvancementError; message: string };

/**
 * Decide whether a character may OPEN an advancement of the given mode (CHAR-009). XP mode gates on
 * the cumulative XP threshold for the next level; milestone mode skips the XP gate (DM/owner
 * declared). Either way the character must be below max level and not already advancing.
 */
export function checkAdvancementEligibility(
	character: Character,
	mode: AdvancementMode,
): EligibilityResult {
	if (mode !== 'xp' && mode !== 'milestone') {
		return { eligible: false, error: 'invalid-mode', message: 'Unknown advancement mode.' };
	}
	if (advancementDraftOf(character)) {
		return {
			eligible: false,
			error: 'advancement-in-progress',
			message: 'An advancement is already in progress for this character.',
		};
	}
	const level = characterLevel(character);
	if (level >= MAX_CHARACTER_LEVEL) {
		return {
			eligible: false,
			error: 'already-at-max-level',
			message: `The character is already at the maximum level (${MAX_CHARACTER_LEVEL}).`,
		};
	}
	const toLevel = level + 1;
	if (mode === 'xp') {
		const required = xpForLevel(toLevel);
		if (required === null || characterXp(character) < required) {
			return {
				eligible: false,
				error: 'xp-below-threshold',
				message: `Reaching level ${toLevel} requires ${required ?? '—'} XP.`,
			};
		}
	}
	return { eligible: true, toLevel };
}

/** Build a fresh advancement draft for a character that has passed eligibility. Pure. */
export function buildAdvancementDraft(
	character: Character,
	mode: AdvancementMode,
	openedBy: ActorId,
	now: string,
): AdvancementDraft {
	const fromLevel = characterLevel(character);
	return {
		mode,
		fromLevel,
		toLevel: fromLevel + 1,
		choices: {},
		openedBy,
		openedAt: now,
		updatedAt: now,
		schemaVersion: CHARACTER_ADVANCEMENT_SCHEMA_VERSION,
	};
}

// --- Validation (pure, deterministic) -----------------------------------------------------------

/** A single advancement validation issue, keyed by the choice field it concerns. */
export interface AdvancementIssue {
	field: keyof AdvancementChoices | 'mode';
	message: string;
}

/** The validation report for an advancement draft. `complete` ⇒ ready to commit. */
export interface AdvancementValidation {
	issues: AdvancementIssue[];
	complete: boolean;
}

/** Levels at which a subclass must be chosen in the prototype rule system. */
const SUBCLASS_LEVEL = 3 as const;
/** Levels at which an ability-score improvement / feat must be chosen (5e-style subset). */
const ASI_LEVELS: ReadonlySet<number> = new Set([4, 8, 12, 16, 19]);

/**
 * Validate an advancement draft deterministically (CHAR-009 "invalid or incomplete choices block
 * finalization"). The same draft always reports the same issues, so the validation state restores
 * exactly on resume (AC3). A draft is `complete` only when it has NO issues.
 */
export function validateAdvancement(draft: AdvancementDraft): AdvancementValidation {
	const issues: AdvancementIssue[] = [];
	const { choices, toLevel } = draft;

	if (typeof choices.className !== 'string' || choices.className.trim() === '') {
		issues.push({ field: 'className', message: 'Choose the class gaining this level.' });
	}
	if (
		typeof choices.hitPointsGained !== 'number' ||
		!Number.isInteger(choices.hitPointsGained) ||
		choices.hitPointsGained <= 0
	) {
		issues.push({ field: 'hitPointsGained', message: 'Enter the hit points gained (a positive whole number).' });
	}
	if (toLevel === SUBCLASS_LEVEL) {
		if (typeof choices.subclass !== 'string' || choices.subclass.trim() === '') {
			issues.push({ field: 'subclass', message: `Choose a subclass at level ${SUBCLASS_LEVEL}.` });
		}
	}
	if (ASI_LEVELS.has(toLevel)) {
		if (typeof choices.abilityOrFeat !== 'string' || choices.abilityOrFeat.trim() === '') {
			issues.push({
				field: 'abilityOrFeat',
				message: `Choose an ability score improvement or feat at level ${toLevel}.`,
			});
		}
	}

	return { issues, complete: issues.length === 0 };
}

// --- Commit (pure; produces the new character ONLY when valid) ----------------------------------

export type CommitAdvancementResult =
	| { ok: true; character: Character; toLevel: number }
	| { ok: false; error: AdvancementError; message: string; issues?: AdvancementIssue[] };

/**
 * Commit a fully-valid advancement draft, producing the new character at `toLevel` (CHAR-009). The
 * level is bumped, the max HP (and current HP) increase by the chosen hit points, the chosen class
 * is recorded, and the staged draft is REMOVED. Fail closed and NO-PARTIAL-COMMIT: a missing or
 * incomplete/invalid draft returns an error and the caller leaves the character untouched (the
 * character is mutated only on the `ok: true` path). Pure.
 */
export function commitAdvancement(character: Character, now: string): CommitAdvancementResult {
	const draft = advancementDraftOf(character);
	if (!draft) {
		return {
			ok: false,
			error: 'no-advancement-in-progress',
			message: 'There is no advancement in progress to finalize.',
		};
	}
	const validation = validateAdvancement(draft);
	if (!validation.complete) {
		return {
			ok: false,
			error: 'advancement-incomplete',
			message: 'The advancement has unresolved validation issues and cannot be finalized.',
			issues: validation.issues,
		};
	}
	const hpGain = draft.choices.hitPointsGained!;
	const nextMaxHp = character.combat.maxHp + hpGain;
	const nextData = { ...character.data };
	nextData[LEVEL_KEY] = draft.toLevel;
	nextData['class'] = draft.choices.className;
	if (draft.choices.subclass) nextData['subclass'] = draft.choices.subclass;
	delete nextData[ADVANCEMENT_DRAFT_KEY];

	const nextCharacter: Character = {
		...character,
		data: nextData,
		combat: {
			...character.combat,
			maxHp: nextMaxHp,
			// Heal up by the gained HP so the new maximum is reflected on commit.
			hp: Math.min(nextMaxHp, character.combat.hp + hpGain),
		},
		updatedAt: now,
		revision: character.revision + 1,
	};
	return { ok: true, character: nextCharacter, toLevel: draft.toLevel };
}

/** Write a (new or updated) advancement draft onto a character's data block. Pure. */
export function writeAdvancementDraft(
	character: Character,
	draft: AdvancementDraft,
	now: string,
): Character {
	return {
		...character,
		data: { ...character.data, [ADVANCEMENT_DRAFT_KEY]: draft },
		updatedAt: now,
		revision: character.revision + 1,
	};
}

/** Remove an in-progress advancement draft (cancel). Pure. */
export function clearAdvancementDraft(character: Character, now: string): Character {
	const nextData = { ...character.data };
	delete nextData[ADVANCEMENT_DRAFT_KEY];
	return { ...character, data: nextData, updatedAt: now, revision: character.revision + 1 };
}

/** Merge new choices into the draft (resume/update during the flow). Pure. */
export function mergeAdvancementChoices(
	draft: AdvancementDraft,
	choices: AdvancementChoices,
	now: string,
): AdvancementDraft {
	return { ...draft, choices: { ...draft.choices, ...choices }, updatedAt: now };
}
