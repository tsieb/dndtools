import { hasDmAuthority } from '../state/permission-state';
import {
	applyAdvancementInputSchema,
	awardXpInputSchema,
	cancelAdvancementInputSchema,
	commitAdvancementInputSchema,
	levelPartyInputSchema,
	openAdvancementInputSchema,
	setAdvancementChoicesInputSchema,
	setCharacterXpInputSchema,
} from '../schemas/commands';
import type { Character } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE, upsertCharacter } from '../state/character-state';
import {
	advancementDraftOf,
	buildAdvancementDraft,
	characterXp,
	checkAdvancementEligibility,
	clearAdvancementDraft,
	commitAdvancement,
	mergeAdvancementChoices,
	validateAdvancement,
	writeAdvancementDraft,
	type AdvancementChoices,
} from '../state/character-advancement';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';
import { activeSystemPackageFor } from './character';

/**
 * CHAR-009 — durable LEVEL-UP / ADVANCEMENT commands using the STAGED-THEN-COMMIT pattern
 * (Architecture Contract 1 / Contract 3). Advancement is OWNER-only (the DM bypasses as
 * administrator; an observer is always rejected). The staged advancement draft is carried on the
 * durable character (`state/character-advancement.ts`), so:
 *
 *   - `open` checks XP/milestone ELIGIBILITY fail-closed before staging a draft (no draft when
 *     ineligible);
 *   - `set-choices` merges the staged choices and persists the draft — the character revision is NOT
 *     finalized here, so progress and validation state survive an app restart (CHAR-009 AC3);
 *   - `commit` is rejected fail-closed unless the draft passes VALIDATION; an invalid/incomplete
 *     advancement NEVER partially mutates the character (the character is mutated only when the pure
 *     commit reducer returns ok) — proving no-partial-commit (CHAR-009 AC1);
 *   - `cancel` discards the staged draft without touching level/XP.
 *
 * Every accepted mutation appends a durable `character.advancement.*` op so it is replayable.
 */

function charactersWith(
	state: CoreStateSlice,
	characters: CoreStateSlice['characters'],
): CoreStateSlice {
	return { ...state, characters };
}

/**
 * CHAR-009 authority: the DM (administrator) OR the character `owner`. Fail closed otherwise.
 *
 * `now` (the ISO clock from `env.clock()`) MUST be passed so that expired grants are treated as
 * inert (fail closed, PERM-004 AC2). Omitting `now` would allow an expired grant to remain
 * effective, violating the grant expiry guarantee.
 */
function actorMayAdvance(
	state: CoreStateSlice,
	actor: Actor,
	characterId: string,
	now?: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(
		state.permissions,
		actor,
		CHARACTER_ENTITY_TYPE,
		characterId,
		'owner',
		now,
	);
}

function advanceGuard(
	state: CoreStateSlice,
	actorId: string,
	characterId: string,
	now?: string,
): { actor: Actor; existing: Character } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[characterId];
	if (!existing) {
		return {
			rejection: reject(
				{ code: 'character-not-found', message: `Character ${characterId} does not exist.` },
				state,
			),
		};
	}
	if (!actorMayAdvance(state, actor, existing.id, now)) {
		return {
			rejection: reject(
				{
					code: 'actor-not-authorized',
					message: 'Only the character owner may manage advancement.',
				},
				state,
			),
		};
	}
	return { actor, existing };
}

function commitCharacter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: Actor,
	before: Character,
	updated: Character,
	opType: string,
	value: unknown,
): CommandResult {
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType,
		path: `characters/${updated.id}/advancement`,
		value,
		beforeRevision: before.revision,
		afterRevision: updated.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.advancement-changed',
				characterId: updated.id,
				revision: updated.revision,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-009 — XP adjustment (drives XP-mode eligibility) --------------------------------------

export function handleSetCharacterXp(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setCharacterXpInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;
	const updated: Character = {
		...guard.existing,
		data: { ...guard.existing.data, xp: parsed.data.xp },
		updatedAt: now,
		revision: guard.existing.revision + 1,
	};
	return commitCharacter(state, env, guard.actor, guard.existing, updated, 'character.set-xp', {
		xp: parsed.data.xp,
	});
}

// --- CHAR-009 — open a staged advancement (eligibility fail-closed) -----------------------------

export function handleOpenAdvancement(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(openAdvancementInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const eligibility = checkAdvancementEligibility(guard.existing, parsed.data.mode);
	if (!eligibility.eligible) {
		const code =
			eligibility.error === 'xp-below-threshold' || eligibility.error === 'already-at-max-level'
				? 'invalid-state'
				: eligibility.error === 'invalid-mode'
					? 'invalid-payload'
					: 'invalid-state';
		return reject({ code, message: eligibility.message }, state);
	}
	const advancementDraft = buildAdvancementDraft(
		guard.existing,
		parsed.data.mode,
		guard.actor.id,
		now,
	);
	const updated = writeAdvancementDraft(guard.existing, advancementDraft, now);
	return commitCharacter(
		state,
		env,
		guard.actor,
		guard.existing,
		updated,
		'character.open-advancement',
		{
			mode: parsed.data.mode,
			toLevel: advancementDraft.toLevel,
		},
	);
}

// --- CHAR-009 — set staged choices (staged; not finalized) --------------------------------------

export function handleSetAdvancementChoices(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setAdvancementChoicesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const draft = advancementDraftOf(guard.existing);
	if (!draft) {
		return reject(
			{ code: 'invalid-state', message: 'Open an advancement before setting level-up choices.' },
			state,
		);
	}

	const choices: AdvancementChoices = {};
	if (parsed.data.className !== undefined) choices.className = parsed.data.className;
	if (parsed.data.hitPointsGained !== undefined)
		choices.hitPointsGained = parsed.data.hitPointsGained;
	if (parsed.data.subclass !== undefined) choices.subclass = parsed.data.subclass;
	if (parsed.data.abilityOrFeat !== undefined) choices.abilityOrFeat = parsed.data.abilityOrFeat;
	const mergedDraft = mergeAdvancementChoices(draft, choices, now);
	// `writeAdvancementDraft` writes the merged draft onto the character and bumps the revision exactly
	// once. The character revision is bumped, but level/XP are unchanged — staged, not finalized.
	const updated = writeAdvancementDraft(guard.existing, mergedDraft, now);
	const validation = validateAdvancement(mergedDraft);
	return commitCharacter(
		state,
		env,
		guard.actor,
		guard.existing,
		updated,
		'character.set-advancement-choices',
		{
			choices,
			complete: validation.complete,
			issues: validation.issues,
		},
	);
}

// --- CHAR-009 — COMMIT (validation fail-closed; no-partial-commit) ------------------------------

export function handleCommitAdvancement(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(commitAdvancementInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;
	// The character is mutated ONLY when the pure commit reducer returns ok. An invalid/incomplete
	// advancement returns an error here and NOTHING below runs — no partial mutation (CHAR-009 AC1).
	const result = commitAdvancement(guard.existing, now, activeSystemPackageFor(state));
	if (!result.ok) {
		const code =
			result.error === 'no-advancement-in-progress' ? 'invalid-state' : 'draft-incomplete';
		return reject(
			{
				code,
				message: result.message,
				...(result.issues
					? { issues: result.issues.map((i) => ({ path: i.field, message: i.message })) }
					: {}),
			},
			state,
		);
	}

	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, result.character);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: result.character.id,
		opType: 'character.commit-advancement',
		path: `characters/${result.character.id}/advancement`,
		value: { toLevel: result.toLevel },
		beforeRevision: guard.existing.revision,
		afterRevision: result.character.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.advancement-finalized',
				characterId: result.character.id,
				toLevel: result.toLevel,
				revision: result.character.revision,
				actorId: guard.actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- CHAR-009 — cancel a staged advancement -----------------------------------------------------

export function handleCancelAdvancement(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(cancelAdvancementInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	if (!advancementDraftOf(guard.existing)) {
		return reject(
			{ code: 'invalid-state', message: 'There is no advancement in progress to cancel.' },
			state,
		);
	}
	const updated = clearAdvancementDraft(guard.existing, now);
	return commitCharacter(
		state,
		env,
		guard.actor,
		guard.existing,
		updated,
		'character.cancel-advancement',
		{},
	);
}

// --- RC-AI-1.4 — atomic advancement (open + choices + commit in ONE dispatch) -------------------

/**
 * Apply a WHOLE level-up in one dispatch: eligibility, the staged draft, every choice, and the
 * finalization, atomically (RC-AI-1.4). The staged-then-commit trio above exists because a HUMAN
 * works through the wizard over several steps and needs the half-finished draft to survive a
 * restart. An AGENT has neither a wizard nor a place to keep a half-open draft while the DM decides,
 * so an agent-proposed level-up carries the full choice set and approval runs the three steps here.
 *
 * Authority, eligibility and validation are UNCHANGED — the same `advanceGuard`, the same
 * `checkAdvancementEligibility`, the same `validateAdvancement` inside `commitAdvancement`. This is a
 * composition of the existing pure reducers, not a second set of rules, so it cannot let an agent
 * finalize something the wizard would refuse.
 *
 * Fail closed and NO-PARTIAL-COMMIT: the character is written exactly once, at the end, and only when
 * the commit reducer returns ok. An ineligible character, an incomplete choice set, or a level that
 * needs a subclass/ASI the payload omits all reject with NOTHING staged and NOTHING mutated — the
 * character never lands in a half-open advancement the DM then has to clean up.
 */
export function handleApplyAdvancement(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(applyAdvancementInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = advanceGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	// STEP 1 — OPEN. Eligibility is checked exactly as `character.open-advancement` checks it, so an
	// XP-mode character below the threshold, one already at max level, and one already mid-advancement
	// are all refused here (the last matters most: an agent must never silently overwrite the choices a
	// human is part-way through making in the wizard).
	const eligibility = checkAdvancementEligibility(guard.existing, parsed.data.mode);
	if (!eligibility.eligible) {
		const code = eligibility.error === 'invalid-mode' ? 'invalid-payload' : 'invalid-state';
		return reject({ code, message: eligibility.message }, state);
	}
	const opened = buildAdvancementDraft(guard.existing, parsed.data.mode, guard.actor.id, now);

	// STEP 2 — SET CHOICES. Merged into the fresh draft in memory; nothing is written yet.
	const choices: AdvancementChoices = {
		className: parsed.data.className,
		hitPointsGained: parsed.data.hitPointsGained,
	};
	if (parsed.data.subclass !== undefined) choices.subclass = parsed.data.subclass;
	if (parsed.data.abilityOrFeat !== undefined) choices.abilityOrFeat = parsed.data.abilityOrFeat;
	const filled = mergeAdvancementChoices(opened, choices, now);

	// STEP 3 — COMMIT. `commitAdvancement` reads the draft off the character, so the filled draft is
	// written to an in-memory copy first. That copy is DISCARDED on a rejection below — the durable
	// state threaded back is the untouched `state`, so an invalid choice set leaves no draft behind.
	const staged = writeAdvancementDraft(guard.existing, filled, now);
	const result = commitAdvancement(staged, now, activeSystemPackageFor(state));
	if (!result.ok) {
		const code =
			result.error === 'no-advancement-in-progress' ? 'invalid-state' : 'draft-incomplete';
		return reject(
			{
				code,
				message: result.message,
				...(result.issues
					? { issues: result.issues.map((i) => ({ path: i.field, message: i.message })) }
					: {}),
			},
			state,
		);
	}

	// The character moves from its ORIGINAL revision straight to the finalized one: the intermediate
	// draft revision never existed durably, so the op records one before/after pair and a replay of
	// this op reproduces the same jump.
	const characters = ensureCharacterStateSlice(state.characters);
	const finalized: Character = { ...result.character, revision: guard.existing.revision + 1 };
	const nextCharacters = upsertCharacter(characters, finalized);
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: finalized.id,
		opType: 'character.apply-advancement',
		path: `characters/${finalized.id}/advancement`,
		value: { mode: parsed.data.mode, toLevel: result.toLevel, choices },
		beforeRevision: guard.existing.revision,
		afterRevision: finalized.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.advancement-finalized',
				characterId: finalized.id,
				toLevel: result.toLevel,
				revision: finalized.revision,
				actorId: guard.actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- RC-CHR-1.4 — bulk party actions (DM-only) ---------------------------------------------------
//
// "Award XP" (from the session encounter log) and "Level the party" (milestone) both act on several
// characters in one dispatch. Neither is owner-authored (a player never awards XP to themself or the
// table), so both are DM-authority only, unlike the per-character commands above. Both are FAIL-OPEN
// per character — a missing/ineligible id is skipped rather than failing the whole batch — and reject
// only when the batch produced NO change at all, so a partial party (e.g. one PC already mid-level-up)
// still gets its due.

/** DM-authority guard shared by the two bulk party commands. Fail closed for anyone but the DM. */
function requireDm(
	state: CoreStateSlice,
	actorId: string,
): { actor: Actor } | { rejection: CommandResult } {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return { rejection: reject(actor, state) };
	if (!hasDmAuthority(actor.role)) {
		return {
			rejection: reject(
				{ code: 'actor-not-authorized', message: 'Only the DM may act on the whole party.' },
				state,
			),
		};
	}
	return { actor };
}

/**
 * Award a flat XP amount to several party characters at once (RC-CHR-1.4 "Award XP", e.g. from the
 * session encounter log's defeated-monster total). DM-only. A character id that does not exist is
 * skipped; the command is rejected only when NOT ONE of the listed characters received the award.
 */
export function handleAwardXp(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(awardXpInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = requireDm(state, actorId);
	if ('rejection' in guard) return guard.rejection;

	const now = env.clock();
	let characters = ensureCharacterStateSlice(state.characters);
	const awarded: string[] = [];
	for (const characterId of parsed.data.characterIds) {
		const existing = characters.characters[characterId];
		if (!existing) continue;
		const updated: Character = {
			...existing,
			data: { ...existing.data, xp: characterXp(existing) + parsed.data.amount },
			updatedAt: now,
			revision: existing.revision + 1,
		};
		characters = upsertCharacter(characters, updated);
		awarded.push(characterId);
	}
	if (awarded.length === 0) {
		return reject(
			{ code: 'invalid-state', message: 'None of the listed characters exist to award XP to.' },
			state,
		);
	}
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: awarded[0]!,
		opType: 'character.award-xp',
		path: 'characters/party/xp',
		value: { amount: parsed.data.amount, characterIds: awarded },
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, characters), sync: draft.log },
		events: awarded.map((characterId) => ({
			kind: 'character.advancement-changed' as const,
			characterId,
			revision: characters.characters[characterId]!.revision,
			actorId: guard.actor.id,
		})),
		operationIds: [draft.op.id],
	};
}

/**
 * Open a MILESTONE advancement draft for every eligible party character at once (RC-CHR-1.4 "Level
 * the party"). DM-only. A character already mid-advancement or at max level is skipped, not
 * rejected; the command fails only when NONE of the listed characters were eligible to open one.
 */
export function handleLevelParty(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(levelPartyInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const guard = requireDm(state, actorId);
	if ('rejection' in guard) return guard.rejection;

	const now = env.clock();
	let characters = ensureCharacterStateSlice(state.characters);
	const opened: string[] = [];
	for (const characterId of parsed.data.characterIds) {
		const existing = characters.characters[characterId];
		if (!existing) continue;
		if (!checkAdvancementEligibility(existing, 'milestone').eligible) continue;
		const advancementDraft = buildAdvancementDraft(existing, 'milestone', guard.actor.id, now);
		characters = upsertCharacter(
			characters,
			writeAdvancementDraft(existing, advancementDraft, now),
		);
		opened.push(characterId);
	}
	if (opened.length === 0) {
		return reject(
			{ code: 'invalid-state', message: 'No listed party member is eligible to level up.' },
			state,
		);
	}
	const draft = appendOperationDraft(env, state.sync, guard.actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: opened[0]!,
		opType: 'character.level-party',
		path: 'characters/party/advancement',
		value: { characterIds: opened },
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, characters), sync: draft.log },
		events: opened.map((characterId) => ({
			kind: 'character.advancement-changed' as const,
			characterId,
			revision: characters.characters[characterId]!.revision,
			actorId: guard.actor.id,
		})),
		operationIds: [draft.op.id],
	};
}
