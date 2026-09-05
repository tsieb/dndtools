import { hasDmAuthority } from '../state/permission-state';
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
	isDmOnlyFieldPath,
	resolveFieldConflict,
	validateFieldEdit,
} from '../state/character-collaboration';
import {
	computeDraftCompleteness,
	draftAttributeFieldId,
	validateDraftStep,
} from '../state/character-draft-flow';
import { abilityScoreKeyFor, normalizeCharacterAttributes } from '../state/character-state';
import type { SystemPackage } from '../state/system-package';
import { activeSystemPackage, hydrateSystemsState } from '../state/system-package';
import { hasGrantedCapability } from '../permissions/grants';
import { requiredCapabilityForCharacterField } from '../permissions/character-field-authority';
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
			{
				code: 'character-not-found',
				message: `Character ${parsed.data.characterId} does not exist.`,
			},
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
			{
				code: 'unknown-actor',
				message: `Draft owner ${parsed.data.ownerActorId} is not registered.`,
			},
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
			{
				code: 'unknown-actor',
				message: `New owner ${parsed.data.toOwnerActorId} is not registered.`,
			},
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
	const transfer = transferDraftOwnership(
		characters,
		parsed.data.draftId,
		parsed.data.toOwnerActorId,
		now,
	);
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

	const pkg = activePackage(state);
	const stepValidation = validateDraftStep(parsed.data.stepId, parsed.data.values, pkg);
	const completeness = computeDraftCompleteness(updated, pkg);

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

/**
 * RC-SYS-2.1 — the ACTIVE system package the draft flow and the finalized character are shaped by.
 * Hydrated tolerantly so a vault written before the `systems` slice existed still resolves to the
 * built-in 5e package and behaves exactly as it did.
 */
function activePackage(state: CoreStateSlice): SystemPackage {
	return activeSystemPackage(hydrateSystemsState(state.systems));
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

	const pkg = activePackage(state);
	const completeness = computeDraftCompleteness(existing, pkg);
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
	// The OPTIONAL `kit` step (AC / hit points / speed / custom attacks). It is not part of the
	// validated core flow, so every read is tolerant: an absent/partial kit finalizes exactly like
	// before (fail-safe defaults), while a saved kit carries onto the finalized character — including
	// the draft's CUSTOM ATTACKS, which previously were silently dropped.
	const kit = values['kit'] ?? {};
	const name =
		typeof identity['name'] === 'string' && identity['name'].trim()
			? identity['name']
			: existing.name;

	const kitAttacks: Character['attacks'] = Array.isArray(kit['attacks'])
		? (kit['attacks'] as unknown[])
				.map((raw) => draftAttackToCharacterAttack(raw, env.ids))
				.filter((attack): attack is Character['attacks'][number] => attack !== null)
		: [];
	const kitMaxHp = numberOrUndefined(kit['maxHp']) ?? numberOrUndefined(kit['hp']);
	const kitHp = numberOrUndefined(kit['hp']) ?? kitMaxHp;
	const kitAc = numberOrUndefined(kit['ac']);
	const kitSpeed = numberOrUndefined(kit['speed']);

	// RC-SYS-2.1 — the attributes step's saved values are mapped through the ACTIVE PACKAGE's
	// attributes: one that aliases a fixed ability field lands there (so a 5e PC finalizes into exactly
	// the document it always did, six keys and no `attributes` map), anything else lands in the open
	// package-keyed map. A package with no attributes finalizes a character with neither.
	const finalizedAbilityScores: Character['abilityScores'] = {};
	const finalizedOpenAttributes: Record<string, number> = {};
	for (const attribute of pkg.attributes) {
		const score = numberOrUndefined(abilities[draftAttributeFieldId(attribute)]);
		const alias = abilityScoreKeyFor(attribute.key);
		if (alias !== null) finalizedAbilityScores[alias] = score;
		else if (score !== undefined) finalizedOpenAttributes[attribute.key] = score;
	}
	const finalizedAttributes = normalizeCharacterAttributes(finalizedOpenAttributes);

	const character: Character = {
		id: env.ids(),
		kind: 'pc',
		name,
		// A finalized PC is `shared` with its creating player, so the owner can see and use their own
		// character (CHAR-002 AC1 "usable in session widgets") without it becoming visible to the whole
		// party. Broader party visibility and the `owner` grant are later CHAR epics (CHAR-003/011).
		visibility: 'shared',
		sharedWith: [existing.ownerActorId],
		abilityScores: finalizedAbilityScores,
		...(finalizedAttributes ? { attributes: finalizedAttributes } : {}),
		attacks: kitAttacks,
		combat: {
			hp: kitHp ?? 0,
			maxHp: kitMaxHp ?? 0,
			tempHp: 0,
			ac: kitAc ?? 10,
			conditions: [],
		},
		data: {
			background: identity['background'] ?? null,
			class: classStep['class'] ?? null,
			...(kitSpeed !== undefined ? { speed: kitSpeed } : {}),
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
 * Authority is FIELD-SCOPED by capability set (CHAR-010 / Architecture Contract 3 "Minimum Capability
 * Sets"):
 *   - The DM may edit any field (DM Authority — Contract 3). The DM role floor retains FULL character
 *     authority regardless of any player grant: granting `owner` to a player does NOT remove the DM's
 *     ability to edit everything, including after the grant (CHAR-003).
 *   - A non-DM may edit a field ONLY IF (a) it is not DM-only AND (b) they hold the capability set the
 *     field requires (`character-field-authority`): a narrative field needs `backstory-editor`, a
 *     combat field needs `combat-participant`, identity/other fields need `owner`. `owner` inherits
 *     all of these, so an owner can edit every player-authored field; a `backstory-editor` can edit
 *     ONLY the narrative surface (CHAR-010) — a combat or identity field is rejected fail-closed.
 *
 * Fail-closed: an unknown/invalid path or value is rejected the same way for everyone BEFORE any
 * authority decision (so a rejection never confirms a DM-only field's existence); a non-DM lacking the
 * field's capability is rejected; a non-DM editing a DM-only field is rejected with the SAME generic
 * message whether or not the field exists, so the DM-only field's existence is not probeable. DM edits
 * land on the SAME canonical value — there is NO separate hidden override layer (Contract 2 research).
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
			{
				code: 'character-not-found',
				message: `Character ${parsed.data.characterId} does not exist.`,
			},
			state,
		);
	}

	// Validate the field path + value fail-closed BEFORE any authority decision that could confirm
	// the field, so an unknown/invalid edit is always rejected the same way.
	const validation = validateFieldEdit(parsed.data.path, parsed.data.value);
	if (!validation.ok) {
		return reject({ code: 'invalid-payload', message: validation.message }, state);
	}

	const now = env.clock();

	// Authority. The DM may edit any field (DM Authority — Contract 3). The DM role FLOOR is
	// unaffected by any player grant, so the DM still edits everything after granting `owner` to a
	// player (CHAR-003). A non-DM may edit a field ONLY when it is not DM-only AND they hold the
	// capability set that field requires (CHAR-010, field-scoped by `character-field-authority`).
	const isDm = hasDmAuthority(actor.role);
	if (!isDm) {
		// A non-DM may never write a DM-only field. Checked FIRST and with the SAME generic message
		// regardless of capability, so a backstory-editor probing a DM-only path cannot distinguish
		// "DM-only" from "not allowed for my grant" — the field's DM-only status is not probeable.
		if (isDmOnlyFieldPath(existing, validation.path)) {
			return reject(
				{ code: 'actor-not-authorized', message: 'You do not have permission to edit this field.' },
				state,
			);
		}
		// Field-scoped capability: the narrowest set this field requires. `owner` inherits
		// `backstory-editor` + `combat-participant`, so an owner satisfies every field; a
		// backstory-editor satisfies only narrative fields (a combat/identity field fails closed).
		// `now` is passed so an EXPIRED grant is inert (fail closed — PERM-004): an expired
		// backstory-editor grant confers no narrative-edit authority.
		const required = requiredCapabilityForCharacterField(validation.path);
		const authorized = hasGrantedCapability(
			state.permissions,
			actor,
			CHARACTER_ENTITY_TYPE,
			existing.id,
			required,
			now,
		);
		if (!authorized) {
			return reject(
				{ code: 'actor-not-authorized', message: 'You do not have permission to edit this field.' },
				state,
			);
		}
	}

	const collaboration = ensureCollaboration(existing.collaboration);
	const operationId = env.ids();
	const result = applyFieldEdit(
		existing,
		collaboration,
		{
			path: validation.path,
			value: validation.value,
			authorActorId: actor.id,
			authorRole: actor.role,
			baseRevision: parsed.data.baseRevision,
		},
		{
			editId: env.ids(),
			conflictId: env.ids(),
			now,
			operationId,
		},
	);

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
			{
				code: 'character-not-found',
				message: `Character ${parsed.data.characterId} does not exist.`,
			},
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

/**
 * Normalize one draft-kit attack entry to a durable {@link Character} attack. Accepts either the
 * canonical `{name, detail}` shape or the builder's `{name, kind, hit, dmg}` row (folded into the
 * free-form `detail` text the quick-create attack model uses). A row with no usable name is dropped.
 */
function draftAttackToCharacterAttack(
	raw: unknown,
	ids: () => string,
): { id: string; name: string; detail: string } | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const entry = raw as Record<string, unknown>;
	const name = typeof entry['name'] === 'string' ? entry['name'].trim() : '';
	if (name === '') return null;
	if (typeof entry['detail'] === 'string') {
		return {
			id: typeof entry['id'] === 'string' && entry['id'] ? entry['id'] : ids(),
			name,
			detail: entry['detail'],
		};
	}
	const parts = [entry['kind'], entry['hit'], entry['dmg'], entry['type']]
		.filter((part): part is string => typeof part === 'string' && part.trim() !== '')
		.map((part) => part.trim());
	return {
		id: typeof entry['id'] === 'string' && entry['id'] ? entry['id'] : ids(),
		name,
		detail: parts.join(' · '),
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
