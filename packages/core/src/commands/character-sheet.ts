import {
	setCharacterProficienciesInputSchema,
	setCharacterSharingInputSchema,
	updateCharacterAttacksInputSchema,
} from '../schemas/commands';
import type { Character, CharacterAttack, CharacterProficiencies } from '../state/character-state';
import {
	CHARACTER_ENTITY_TYPE,
	proficienciesOf,
	upsertCharacter,
} from '../state/character-state';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
	requireDm,
} from './helpers';

/**
 * Character SHEET extension commands: structured proficiencies, post-create attack-list editing, and
 * DM-authored sharing. Every mutation is a Processing-Core command (Contract 1): actor authority is
 * checked fail-closed, the durable CharacterState is mutated through pure builders, and a durable
 * `character.*` sync operation is appended.
 *
 * Authority (mirrors `commands/character-resources.ts` CHAR-008 management):
 *   - `character.set-proficiencies` / `character.update-attacks` are OWNER-or-DM structural edits
 *     (the DM bypasses as administrator; a non-owner player/observer is rejected fail-closed).
 *   - `character.set-sharing` is DM-ONLY: widening a character's audience (visibility level or the
 *     `sharedWith` delivery list) is a DM authority under the fail-closed visibility model
 *     (Contract 3 Axis 1 — the same rules the UX-PERM visibility-status models surface).
 */

function charactersWith(
	state: CoreStateSlice,
	characters: CoreStateSlice['characters'],
): CoreStateSlice {
	return { ...state, characters };
}

/**
 * OWNER-or-DM guard (mirrors the CHAR-008 manage guard). `now` MUST be the env clock so an EXPIRED
 * `owner` grant is inert (fail closed — PERM-004 AC2).
 */
function actorMayEditSheet(
	state: CoreStateSlice,
	actor: Actor,
	characterId: string,
	now: string,
): boolean {
	if (actor.role === 'dm') return true;
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

function sheetGuard(
	state: CoreStateSlice,
	actorId: string,
	characterId: string,
	now: string,
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
	if (!actorMayEditSheet(state, actor, existing.id, now)) {
		return {
			rejection: reject(
				{
					code: 'actor-not-authorized',
					message: 'Only the character owner may edit this part of the sheet.',
				},
				state,
			),
		};
	}
	return { actor, existing };
}

// --- character.set-proficiencies (owner or DM) ---------------------------------------------------

export function handleSetCharacterProficiencies(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setCharacterProficienciesInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = sheetGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;
	const { actor, existing } = guard;

	// PATCH semantics over the hydrated current block: a supplied facet replaces it; an omitted one is
	// preserved. `skills` entries set to `none` are dropped (absent ⇒ `none`, keeping the map minimal).
	const current = proficienciesOf(existing);
	const skills = { ...current.skills };
	if (parsed.data.skills !== undefined) {
		for (const [skill, level] of Object.entries(parsed.data.skills)) {
			if (level === 'none') delete skills[skill];
			else skills[skill] = level;
		}
	}
	const hitDiceInput = parsed.data.hitDice;
	const hitDice = hitDiceInput
		? {
				die: hitDiceInput.die,
				total: hitDiceInput.total,
				// Spent hit dice can never exceed the total (clamped fail-closed, like slot expenditure).
				spent: Math.min(hitDiceInput.spent, hitDiceInput.total),
			}
		: current.hitDice;
	const proficiencies: CharacterProficiencies = {
		skills,
		saves:
			parsed.data.saves !== undefined ? [...new Set(parsed.data.saves)] : current.saves,
		proficiencyBonus:
			parsed.data.proficiencyBonus !== undefined
				? parsed.data.proficiencyBonus
				: current.proficiencyBonus,
		hitDice,
	};

	const updated: Character = {
		...existing,
		proficiencies,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'character.set-proficiencies',
		path: `characters/${updated.id}/proficiencies`,
		value: proficiencies,
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.proficiencies-changed',
				characterId: updated.id,
				revision: updated.revision,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- character.update-attacks (owner or DM) ------------------------------------------------------

export function handleUpdateCharacterAttacks(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateCharacterAttacksInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = sheetGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;
	const { actor, existing } = guard;

	// Full-replacement semantics: the submitted list IS the new attack list (add/edit/remove in one
	// validated step). An entry without an id is a NEW attack and gets a deterministic env id.
	const attacks: CharacterAttack[] = parsed.data.attacks.map((attack) => ({
		id: attack.id ?? env.ids(),
		name: attack.name,
		detail: attack.detail,
	}));

	const updated: Character = {
		...existing,
		attacks,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'character.update-attacks',
		path: `characters/${updated.id}/attacks`,
		value: { attacks },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.attacks-changed',
				characterId: updated.id,
				revision: updated.revision,
				attackCount: attacks.length,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}

// --- character.set-sharing (DM-only) -------------------------------------------------------------

export function handleSetCharacterSharing(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	// DM-only: widening a character's audience is a DM authority (fail-closed visibility model).
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setCharacterSharingInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[parsed.data.characterId];
	if (!existing) {
		return reject(
			{
				code: 'character-not-found',
				message: `Character ${parsed.data.characterId} does not exist.`,
			},
			state,
		);
	}

	const now = env.clock();
	// `normalizeVisibilityLevel` fails closed to `dm-only` for an unrecognized level (same fail-closed
	// coercion the UX-PERM visibility-status models rely on). `sharedWith` is replaced, deduped.
	const visibility = normalizeVisibilityLevel(parsed.data.visibility ?? existing.visibility);
	const sharedWith =
		parsed.data.sharedWith !== undefined
			? [...new Set(parsed.data.sharedWith)]
			: [...existing.sharedWith];

	const updated: Character = {
		...existing,
		visibility,
		sharedWith,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const nextCharacters = upsertCharacter(characters, updated);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'character.set-sharing',
		path: `characters/${updated.id}/visibility`,
		value: { visibility, sharedWith },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			{
				kind: 'character.sharing-changed',
				characterId: updated.id,
				visibility,
				sharedWith,
				revision: updated.revision,
				actorId: actor.id,
			},
		],
		operationIds: [draft.op.id],
	};
}
