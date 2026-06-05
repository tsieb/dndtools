import {
	createCharacterDraftInputSchema,
	editCharacterFieldInputSchema,
	finalizeCharacterDraftInputSchema,
	quickCreateCharacterInputSchema,
	resolveCharacterConflictInputSchema,
	revokeCharacterDraftInputSchema,
	setCharacterCombatInputSchema,
	transferCharacterDraftInputSchema,
	updateCharacterDraftStepInputSchema,
} from '../schemas/commands';
import type { CharacterState } from '../state/character-state';
import {
	applyDraftStep,
	buildCharacterDraft,
	buildQuickCreatedCharacter,
	CHARACTER_DRAFT_ENTITY_TYPE,
	CHARACTER_ENTITY_TYPE,
	isDraftOwner,
	removeDraft,
	transferDraftOwnership,
	upsertCharacter,
	upsertDraft,
	type Character,
	type CharacterDraft,
} from '../state/character-state';
import {
	applyFieldEdit,
	ensureCollaboration,
	resolveFieldConflict,
	validateFieldEdit,
} from '../state/character-collaboration';
import { computeDraftCompleteness, validateDraftStep } from '../state/character-draft-flow';
import { hasGrantedCapability } from '../permissions/grants';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
	requireDm,
} from './helpers';

/**
 * CHAR-001 / CHAR-002 / CHAR-013 — durable character commands (Architecture Contract 1 / Contract 3).
 *
 * Every mutation is a Processing-Core command: it requires the right actor, validates with a pure
 * reducer/validator, mutates the durable CharacterState through PURE functions, and appends a durable
 * `character.*` sync operation so the write is replayable and persisted via the storage adapter —
 * never written to storage directly (Contract 1 / PLAT-006).
 *
 * Authority + fail-closed posture:
 *   - quick-create / create-draft / transfer-draft / revoke-draft are DM-only.
 *   - update-draft-step / finalize-draft require the SINGLE draft owner (a non-owner — player or
 *     observer — is rejected `not-draft-owner`, fail closed: CHAR-002 owner-only editing).
 *   - draft transfer is ATOMIC (the prior owner is replaced in one step), so a draft never has zero
 *     or two owners (CHAR-013), the same singular-ownership invariant as PERM-013.
 */

function charactersWith(state: CoreStateSlice, characters: CharacterState): CoreStateSlice {
	return { ...state, characters };
}

// --- CHAR-001 — DM quick-create -----------------------------------------------------------------

export function handleQuickCreateCharacter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(quickCreateCharacterInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const now = env.clock();
	const character: Character = buildQuickCreatedCharacter(parsed.data, {
		id: env.ids(),
		createdBy: actor.id,
		now,
		attackIds: env.ids,
	});

	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, character);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: character.id,
		opType: 'character.quick-create',
		path: `characters/${character.id}`,
		value: character,
		afterRevision: character.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.created',
			characterId: character.id,
			kindOfCharacter: character.kind,
			visibility: character.visibility,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events,
		operationIds: [draft.op.id],
	};
}

// --- CHAR-001 foundation — set combat fields ----------------------------------------------------

export function handleSetCharacterCombat(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	// DM-only in this foundational epic; player combat-participant writes land in the CHAR combat epic.
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setCharacterCombatInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[parsed.data.characterId];
	if (!existing) {
		return reject(
			{ code: 'character-not-found', message: `Character ${parsed.data.characterId} does not exist.` },
			state,
		);
	}

	const now = env.clock();
	const updated: Character = {
		...existing,
		combat: {
			hp: parsed.data.hp ?? existing.combat.hp,
			maxHp: parsed.data.maxHp ?? existing.combat.maxHp,
			tempHp: parsed.data.tempHp ?? existing.combat.tempHp,
			ac: parsed.data.ac ?? existing.combat.ac,
			conditions: parsed.data.conditions ?? [...existing.combat.conditions],
		},
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const nextCharacters = upsertCharacter(characters, updated);

	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'character.set-combat',
		path: `characters/${updated.id}/combat`,
		value: updated.combat,
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.combat-changed',
			characterId: updated.id,
			revision: updated.revision,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events,
		operationIds: [draft.op.id],
	};
}

// --- CHAR-013 — draft ownership lifecycle (DM-only) ---------------------------------------------

export function handleCreateCharacterDraft(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(createCharacterDraftInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	// The owner must be a registered player (the draft is owned by exactly one player — CHAR-013).
	const owner = state.permissions.actors[parsed.data.ownerActorId];
	if (!owner) {
		return reject(
			{ code: 'unknown-actor', message: `Draft owner ${parsed.data.ownerActorId} is not registered.` },
			state,
		);
	}
	if (owner.role !== 'player') {
		return reject(
			{ code: 'invalid-payload', message: 'A character draft can only be owned by a player.' },
			state,
		);
	}

	const now = env.clock();
	const newDraft: CharacterDraft = buildCharacterDraft(parsed.data, {
		id: env.ids(),
		createdBy: actor.id,
		now,
	});

	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertDraft(characters, newDraft);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_DRAFT_ENTITY_TYPE,
		entityId: newDraft.id,
		opType: 'character.create-draft',
		path: `drafts/${newDraft.id}`,
		value: newDraft,
		afterRevision: newDraft.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.draft-created',
			draftId: newDraft.id,
			ownerActorId: newDraft.ownerActorId,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draftOp.log },
		events,
		operationIds: [draftOp.op.id],
	};
}

export function handleTransferCharacterDraft(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(transferCharacterDraftInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const newOwner = state.permissions.actors[parsed.data.toOwnerActorId];
	if (!newOwner) {
		return reject(
			{ code: 'unknown-actor', message: `New owner ${parsed.data.toOwnerActorId} is not registered.` },
			state,
		);
	}
	if (newOwner.role !== 'player') {
		return reject(
			{ code: 'invalid-payload', message: 'A character draft can only be owned by a player.' },
			state,
		);
	}

	const characters = ensureCharacterStateSlice(state.characters);
	const now = env.clock();
	const transfer = transferDraftOwnership(characters, parsed.data.draftId, parsed.data.toOwnerActorId, now);
	if (!transfer.ok) {
		const code =
			transfer.error === 'draft-not-found'
				? 'draft-not-found'
				: transfer.error === 'draft-finalized'
					? 'draft-finalized'
					: 'invalid-state';
		return reject({ code, message: transfer.message }, state);
	}

	// One atomic transition: the prior owner is replaced by the new owner in the same draft value, so
	// there is never a window with zero or two owners (CHAR-013).
	const nextCharacters = upsertDraft(characters, transfer.draft);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_DRAFT_ENTITY_TYPE,
		entityId: transfer.draft.id,
		opType: 'character.transfer-draft',
		path: `drafts/${transfer.draft.id}/owner`,
		value: {
			toOwnerActorId: transfer.draft.ownerActorId,
			fromOwnerActorId: transfer.previousOwnerActorId,
		},
		beforeRevision: transfer.draft.revision - 1,
		afterRevision: transfer.draft.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.draft-transferred',
			draftId: transfer.draft.id,
			fromOwnerActorId: transfer.previousOwnerActorId,
			toOwnerActorId: transfer.draft.ownerActorId,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draftOp.log },
		events,
		operationIds: [draftOp.op.id],
	};
}

export function handleRevokeCharacterDraft(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(revokeCharacterDraftInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.drafts[parsed.data.draftId];
	if (!existing) {
		return reject(
			{ code: 'draft-not-found', message: `Draft ${parsed.data.draftId} does not exist.` },
			state,
		);
	}

	const nextCharacters = removeDraft(characters, existing.id);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_DRAFT_ENTITY_TYPE,
		entityId: existing.id,
		opType: 'character.revoke-draft',
		path: `drafts/${existing.id}`,
		value: { draftId: existing.id, ownerActorId: existing.ownerActorId },
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.draft-revoked',
			draftId: existing.id,
			ownerActorId: existing.ownerActorId,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draftOp.log },
		events,
		operationIds: [draftOp.op.id],
	};
}

// --- CHAR-002 — guided flow: save step + finalize (owner-only) -----------------------------------

export function handleUpdateCharacterDraftStep(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(updateCharacterDraftStepInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.drafts[parsed.data.draftId];
	if (!existing) {
		return reject(
			{ code: 'draft-not-found', message: `Draft ${parsed.data.draftId} does not exist.` },
			state,
		);
	}
	// Fail closed: only the SINGLE draft owner may edit (a non-owner player/observer is rejected —
	// the DM administers ownership but does not edit a player's draft through this command).
	if (!isDraftOwner(existing, actor.id)) {
		return reject(
			{ code: 'not-draft-owner', message: 'Only the draft owner may edit this draft.' },
			state,
		);
	}
	if (existing.finalized) {
		return reject({ code: 'draft-finalized', message: 'This draft is already finalized.' }, state);
	}
	if (
		parsed.data.expectedRevision !== undefined &&
		parsed.data.expectedRevision !== existing.revision
	) {
		return reject(
			{ code: 'revision-conflict', message: 'The draft changed since you last loaded it.' },
			state,
		);
	}

	const now = env.clock();
	const updated = applyDraftStep(existing, parsed.data.stepId, parsed.data.values, now);
	const nextCharacters = upsertDraft(characters, updated);

	const stepValidation = validateDraftStep(parsed.data.stepId, parsed.data.values);
	const completeness = computeDraftCompleteness(updated);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_DRAFT_ENTITY_TYPE,
		entityId: updated.id,
		opType: 'character.update-draft-step',
		path: `drafts/${updated.id}/steps/${parsed.data.stepId}`,
		value: { stepId: parsed.data.stepId, values: parsed.data.values },
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.draft-step-updated',
			draftId: updated.id,
			stepId: parsed.data.stepId,
			revision: updated.revision,
			stepValid: stepValidation.valid,
			readyToFinalize: completeness.readyToFinalize,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draftOp.log },
		events,
		operationIds: [draftOp.op.id],
	};
}

export function handleFinalizeCharacterDraft(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(finalizeCharacterDraftInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.drafts[parsed.data.draftId];
	if (!existing) {
		return reject(
			{ code: 'draft-not-found', message: `Draft ${parsed.data.draftId} does not exist.` },
			state,
		);
	}
	if (!isDraftOwner(existing, actor.id)) {
		return reject(
			{ code: 'not-draft-owner', message: 'Only the draft owner may finalize this draft.' },
			state,
		);
	}
	if (existing.finalized) {
		return reject({ code: 'draft-finalized', message: 'This draft is already finalized.' }, state);
	}

	const completeness = computeDraftCompleteness(existing);
	if (!completeness.readyToFinalize) {
		return reject(
			{
				code: 'draft-incomplete',
				message: 'The draft has unresolved validation issues and cannot be finalized.',
				issues: completeness.issues.map((issue) => ({
					path: issue.fieldId ? `${issue.stepId}.${issue.fieldId}` : issue.stepId,
					message: issue.message,
				})),
			},
			state,
		);
	}

	const now = env.clock();
	// Assemble the finalized character from the validated step values. The flow's known step shape
	// drives the mapping; the validator already guaranteed required fields are present and legal.
	const values: Record<string, Record<string, unknown>> = {};
	for (const step of existing.steps) values[step.stepId] = step.values;
	const identity = values['identity'] ?? {};
	const abilities = values['abilities'] ?? {};
	const classStep = values['class'] ?? {};
	const name = typeof identity['name'] === 'string' && identity['name'].trim() ? identity['name'] : existing.name;

	const character: Character = {
		id: env.ids(),
		kind: 'pc',
		name,
		// A finalized PC is `shared` with its creating player, so the owner can see and use their own
		// character (CHAR-002 AC1 "usable in session widgets") without it becoming visible to the whole
		// party. Broader party visibility and the `owner` grant are later CHAR epics (CHAR-003/011).
		visibility: 'shared',
		sharedWith: [existing.ownerActorId],
		abilityScores: {
			str: numberOrUndefined(abilities['str']),
			dex: numberOrUndefined(abilities['dex']),
			con: numberOrUndefined(abilities['con']),
			int: numberOrUndefined(abilities['int']),
			wis: numberOrUndefined(abilities['wis']),
			cha: numberOrUndefined(abilities['cha']),
		},
		attacks: [],
		combat: { hp: 0, maxHp: 0, tempHp: 0, ac: 10, conditions: [] },
		data: {
			background: identity['background'] ?? null,
			class: classStep['class'] ?? null,
		},
		dmOnlyFields: [],
		createdBy: actor.id,
		createdAt: now,
		updatedAt: now,
		revision: 1,
		finalizedFromDraftId: existing.id,
		schemaVersion: existing.schemaVersion,
	};

	const finalizedDraft: CharacterDraft = {
		...existing,
		finalized: true,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	let nextCharacters = upsertCharacter(characters, character);
	nextCharacters = upsertDraft(nextCharacters, finalizedDraft);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: character.id,
		opType: 'character.finalize-draft',
		path: `characters/${character.id}`,
		value: { character, draftId: existing.id },
		afterRevision: character.revision,
	});

	const events: CoreEvent[] = [
		{
			kind: 'character.draft-finalized',
			draftId: existing.id,
			characterId: character.id,
			actorId: actor.id,
		},
		{
			kind: 'character.created',
			characterId: character.id,
			kindOfCharacter: character.kind,
			visibility: character.visibility,
			actorId: actor.id,
		},
	];

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draftOp.log },
		events,
		operationIds: [draftOp.op.id],
	};
}

// --- CHAR-004 / CHAR-005 — collaborative field edits (merge / conflict / attribution) -----------

/**
 * CHAR-005 — edit ANY character field through a VALIDATED command, attributed in history. CHAR-004 —
 * a same-path concurrent edit (a stale `baseRevision` against a path another author changed) is
 * surfaced as a CONFLICT instead of silent last-write-wins; edits to different paths always merge.
 *
 * Authority: the DM may edit any field (DM Authority — Contract 3); a character OWNER may edit a
 * field they hold an `owner`/`backstory-editor`/`combat-participant`-implied capability on AND that
 * is not DM-only. Fail-closed: a non-owner non-DM is rejected, an unknown/invalid path or value is
 * rejected, a non-DM editing a DM-only field is rejected (and the rejection does not confirm the
 * field's existence beyond the generic message). DM edits land on the SAME canonical value — there is
 * NO separate hidden override layer (CHAR-005 / Contract 2 research conclusion).
 */
export function handleEditCharacterField(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);

	const parsed = parseInput(editCharacterFieldInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[parsed.data.characterId];
	if (!existing) {
		return reject(
			{ code: 'character-not-found', message: `Character ${parsed.data.characterId} does not exist.` },
			state,
		);
	}

	// Validate the field path + value fail-closed BEFORE any authority decision that could confirm
	// the field, so an unknown/invalid edit is always rejected the same way.
	const validation = validateFieldEdit(parsed.data.path, parsed.data.value);
	if (!validation.ok) {
		return reject({ code: 'invalid-payload', message: validation.message }, state);
	}

	// Authority. The DM may edit any field. A non-DM may only edit a field they own AND that is NOT
	// DM-only (fail closed). The generic rejection does not reveal whether the DM-only field exists.
	const isDm = actor.role === 'dm';
	if (!isDm) {
		const ownsCharacter = hasGrantedCapability(
			state.permissions,
			actor,
			CHARACTER_ENTITY_TYPE,
			existing.id,
			'owner',
		);
		if (!ownsCharacter) {
			return reject(
				{ code: 'actor-not-authorized', message: 'You do not have permission to edit this character.' },
				state,
			);
		}
		if (existing.dmOnlyFields.includes(validation.path)) {
			return reject(
				{ code: 'actor-not-authorized', message: 'You do not have permission to edit this field.' },
				state,
			);
		}
	}

	const collaboration = ensureCollaboration(existing.collaboration);
	const now = env.clock();
	const operationId = env.ids();
	const result = applyFieldEdit(existing, collaboration, {
		path: validation.path,
		value: validation.value,
		authorActorId: actor.id,
		authorRole: actor.role,
		baseRevision: parsed.data.baseRevision,
	}, {
		editId: env.ids(),
		conflictId: env.ids(),
		now,
		operationId,
	});

	if (result.outcome === 'noop') {
		// Idempotent no-op: the value already matches. Accept without a new revision/op so a repeated
		// submit does not spuriously bump history; report no operations.
		return {
			status: 'accepted',
			nextState: charactersWith(state, characters),
			events: [],
			operationIds: [],
		};
	}

	const updatedCharacter: Character = {
		...result.character,
		collaboration: result.collaboration,
	};
	const nextCharacters = upsertCharacter(characters, updatedCharacter);

	if (result.outcome === 'conflict') {
		// CHAR-004 AC2 — a durable conflict op is recorded; the canonical value is UNCHANGED (the
		// concurrent edit did not overwrite). The path is now blocked until the DM resolves it.
		const op = appendOperationDraft(env, state.sync, actor.id, {
			entityType: CHARACTER_ENTITY_TYPE,
			entityId: updatedCharacter.id,
			opType: 'character.field-conflict',
			path: `characters/${updatedCharacter.id}/conflicts/${result.conflict.id}`,
			value: result.conflict,
			beforeRevision: existing.revision,
			afterRevision: existing.revision,
		});
		const events: CoreEvent[] = [
			{
				kind: 'character.field-conflicted',
				characterId: updatedCharacter.id,
				conflictId: result.conflict.id,
				path: result.conflict.path,
				actorId: actor.id,
			},
		];
		return {
			status: 'accepted',
			nextState: { ...charactersWith(state, nextCharacters), sync: op.log },
			events,
			operationIds: [op.op.id],
		};
	}

	// Applied: one canonical value written + attributed (CHAR-005).
	const op = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updatedCharacter.id,
		opType: 'character.edit-field',
		path: `characters/${updatedCharacter.id}/${result.edit.path}`,
		value: {
			path: result.edit.path,
			value: result.edit.value,
			authorActorId: result.edit.authorActorId,
			authorRole: result.edit.authorRole,
		},
		beforeRevision: existing.revision,
		afterRevision: updatedCharacter.revision,
	});
	const events: CoreEvent[] = [
		{
			kind: 'character.field-edited',
			characterId: updatedCharacter.id,
			path: result.edit.path,
			revision: updatedCharacter.revision,
			authorRole: result.edit.authorRole,
			actorId: actor.id,
		},
	];
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: op.log },
		events,
		operationIds: [op.op.id],
	};
}

/**
 * CHAR-004 — the DM resolves an unresolved same-path conflict by choosing the local or remote value.
 * DM-only (Contract 3: conflict resolution is a DM authority). The chosen value becomes the single
 * canonical value, attributed to the DM, and the conflict is marked resolved with its resolution op
 * id (Contract 2 Conflict Model rule 7). Fail closed: an unknown/already-resolved conflict is rejected.
 */
export function handleResolveCharacterConflict(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(resolveCharacterConflictInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const existing = characters.characters[parsed.data.characterId];
	if (!existing) {
		return reject(
			{ code: 'character-not-found', message: `Character ${parsed.data.characterId} does not exist.` },
			state,
		);
	}

	const collaboration = ensureCollaboration(existing.collaboration);
	const now = env.clock();
	const operationId = env.ids();
	const resolution = resolveFieldConflict(
		existing,
		collaboration,
		parsed.data.conflictId,
		parsed.data.choice,
		actor.id,
		actor.role,
		{ editId: env.ids(), conflictId: env.ids(), now, operationId },
	);
	if (!resolution.ok) {
		const code = resolution.error === 'conflict-not-found' ? 'conflict-not-found' : 'invalid-state';
		return reject({ code, message: resolution.message }, state);
	}

	const updatedCharacter: Character = {
		...resolution.character,
		collaboration: resolution.collaboration,
	};
	const nextCharacters = upsertCharacter(characters, updatedCharacter);

	const op = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updatedCharacter.id,
		opType: 'character.resolve-conflict',
		path: `characters/${updatedCharacter.id}/conflicts/${parsed.data.conflictId}`,
		value: {
			conflictId: parsed.data.conflictId,
			choice: parsed.data.choice,
			resolvedPath: resolution.resolvedPath,
			value: resolution.edit.value,
		},
		beforeRevision: existing.revision,
		afterRevision: updatedCharacter.revision,
	});
	const events: CoreEvent[] = [
		{
			kind: 'character.conflict-resolved',
			characterId: updatedCharacter.id,
			conflictId: parsed.data.conflictId,
			path: resolution.resolvedPath,
			revision: updatedCharacter.revision,
			actorId: actor.id,
		},
	];
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: op.log },
		events,
		operationIds: [op.op.id],
	};
}

function numberOrUndefined(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}
