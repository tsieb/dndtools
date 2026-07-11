import { hasDmAuthority } from '../state/permission-state';
import {
	cancelAdvancementInputSchema,
	commitAdvancementInputSchema,
	openAdvancementInputSchema,
	setAdvancementChoicesInputSchema,
	setCharacterXpInputSchema,
} from '../schemas/commands';
import type { Character } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE, upsertCharacter } from '../state/character-state';
import {
	advancementDraftOf,
	buildAdvancementDraft,
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

function charactersWith(state: CoreStateSlice, characters: CoreStateSlice['characters']): CoreStateSlice {
	return { ...state, characters };
}

/**
 * CHAR-009 authority: the DM (administrator) OR the character `owner`. Fail closed otherwise.
 *
 * `now` (the ISO clock from `env.clock()`) MUST be passed so that expired grants are treated as
 * inert (fail closed, PERM-004 AC2). Omitting `now` would allow an expired grant to remain
 * effective, violating the grant expiry guarantee.
 */
function actorMayAdvance(state: CoreStateSlice, actor: Actor, characterId: string, now?: string): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, characterId, 'owner', now);
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
				{ code: 'actor-not-authorized', message: 'Only the character owner may manage advancement.' },
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
	const advancementDraft = buildAdvancementDraft(guard.existing, parsed.data.mode, guard.actor.id, now);
	const updated = writeAdvancementDraft(guard.existing, advancementDraft, now);
	return commitCharacter(state, env, guard.actor, guard.existing, updated, 'character.open-advancement', {
		mode: parsed.data.mode,
		toLevel: advancementDraft.toLevel,
	});
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
	if (parsed.data.hitPointsGained !== undefined) choices.hitPointsGained = parsed.data.hitPointsGained;
	if (parsed.data.subclass !== undefined) choices.subclass = parsed.data.subclass;
	if (parsed.data.abilityOrFeat !== undefined) choices.abilityOrFeat = parsed.data.abilityOrFeat;
	const mergedDraft = mergeAdvancementChoices(draft, choices, now);
	// `writeAdvancementDraft` writes the merged draft onto the character and bumps the revision exactly
	// once. The character revision is bumped, but level/XP are unchanged — staged, not finalized.
	const updated = writeAdvancementDraft(guard.existing, mergedDraft, now);
	const validation = validateAdvancement(mergedDraft);
	return commitCharacter(state, env, guard.actor, guard.existing, updated, 'character.set-advancement-choices', {
		choices,
		complete: validation.complete,
		issues: validation.issues,
	});
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
	const result = commitAdvancement(guard.existing, now);
	if (!result.ok) {
		const code = result.error === 'no-advancement-in-progress' ? 'invalid-state' : 'draft-incomplete';
		return reject(
			{
				code,
				message: result.message,
				...(result.issues ? { issues: result.issues.map((i) => ({ path: i.field, message: i.message })) } : {}),
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
	return commitCharacter(state, env, guard.actor, guard.existing, updated, 'character.cancel-advancement', {});
}
