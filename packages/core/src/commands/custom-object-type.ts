import {
	defineCustomObjectTypeInputSchema,
	deleteCustomObjectTypeInputSchema,
	updateCustomObjectTypeInputSchema,
} from '../schemas/commands';
import {
	CUSTOM_OBJECT_TYPE_ENTITY_TYPE,
	buildCustomObjectType,
	validateCustomObjectTypeDefinition,
	type CustomObjectTypeDraft,
	type CustomObjectTypeValidationResult,
} from '../state/custom-object-type';
import {
	countObjectsOfSubtype,
	customObjectTypeById,
	defineCustomObjectType,
	removeCustomObjectType,
	type VaultContentState,
} from '../state/content';
import type { Actor } from '../state/permission-state';
import type { CommandRejection, CommandResult, CoreEnvironment, CoreStateSlice } from './types';
import { appendOperationDraft, ensureContentStateSlice, parseInput, reject, requireActor } from './helpers';

/**
 * CONTENT-005 (custom types) — USER-DEFINED VAULT OBJECT TYPE lifecycle commands (Contract 1 / Contract 3).
 *
 * These make the DM's own object types first-class alongside the built-in subtypes. A custom type is a
 * durable {@link import('../state/custom-object-type').CustomObjectTypeDefinition} in the content slice; it
 * PROJECTS to a `VaultObjectSchema` so instances flow through the SAME schema-validated create/update path a
 * built-in object uses (there is NO parallel storage/validation system — see `commands/vault-object.ts`).
 *
 * Fail-closed invariants:
 *   - DM-only authoring. Defining a type is a vault-level authoring act; players/observers cannot. Reuses the
 *     SAME `actor.role === 'dm'` gate `commands/vault-object.ts` uses for create — no new authority is invented.
 *   - The draft is STRUCTURALLY VALIDATED before any durable write (id in the reserved `custom:` namespace so
 *     it can never collide with a built-in subtype; label present + bounded; every field a valid, unique,
 *     non-reserved key of a KNOWN kind). An invalid draft is rejected `custom-type-invalid` and NO revision is
 *     written.
 *   - DEFINE is create-only (rejects `custom-type-exists` when the id is taken); UPDATE is edit-only (rejects
 *     `custom-type-not-found`), preserving createdAt/author and bumping the definition revision.
 *   - DELETE is refused `custom-type-in-use` while ANY live instance of the type still exists — the SAFER of
 *     the two options: never orphan an instance into an unresolvable subtype. The DM removes the instances
 *     first. (A removed type's stray instances would still be handled fail-closed by the shared path — an
 *     unknown subtype projects nothing to non-DM and serializes only its envelope — but blocking is safer.)
 *
 * Each mutation appends a durable `content.*-object-type` op and emits `content.object-type-changed`.
 */

/** Vault-level authoring (define/update/delete a type): DM only. Mirrors `commands/vault-object.ts`. */
function actorMayAuthorVault(actor: Actor): boolean {
	return actor.role === 'dm';
}

const NOT_DM_REJECTION: CommandRejection = {
	code: 'actor-not-authorized',
	message: 'Only the DM may define custom object types.',
};

/** Turn a definition validation result into a non-leaking rejection (names fields/expectations, not values). */
function typeInvalidRejection(result: CustomObjectTypeValidationResult): CommandRejection {
	return {
		code: 'custom-type-invalid',
		message: 'The custom object type definition failed validation.',
		issues: result.issues.map((issue) => ({ path: issue.field, message: issue.message })),
	};
}

/** The draft carried by define/update (identical shape); pure projection of the parsed payload. */
function draftFromInput(input: {
	id: string;
	label: string;
	fields: ReadonlyArray<{ key: string; type: string; required?: boolean; description?: string; dmOnly?: boolean }>;
	defaultVisibility?: string;
}): CustomObjectTypeDraft {
	return {
		id: input.id,
		label: input.label,
		fields: input.fields,
		defaultVisibility: input.defaultVisibility,
	};
}

function contentWith(state: CoreStateSlice, content: VaultContentState): CoreStateSlice {
	return { ...state, content };
}

// --- CONTENT-005 — define a new custom object type (DM-only; validated, fail closed) --------------

export function handleDefineCustomObjectType(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(defineCustomObjectTypeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) return reject(NOT_DM_REJECTION, state);

	const draft = draftFromInput(parsed.data);
	const validation = validateCustomObjectTypeDefinition(draft);
	if (!validation.valid) return reject(typeInvalidRejection(validation), state);

	const content = ensureContentStateSlice(state.content);
	if (customObjectTypeById(content, draft.id) !== undefined) {
		return reject(
			{ code: 'custom-type-exists', message: `A custom object type ${draft.id} already exists.` },
			state,
		);
	}

	const now = env.clock();
	const def = buildCustomObjectType(draft, { authorActorId: actor.id, now, revision: 1 });
	const nextContent = defineCustomObjectType(content, def);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CUSTOM_OBJECT_TYPE_ENTITY_TYPE,
		entityId: def.id,
		opType: 'content.define-object-type',
		path: `content/customObjectTypes/${def.id}`,
		value: { id: def.id, label: def.label, fieldCount: def.fields.length },
		beforeRevision: 0,
		afterRevision: def.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draftOp.log },
		events: [{ kind: 'content.object-type-changed', typeId: def.id, mutation: 'define', actorId: actor.id }],
		operationIds: [draftOp.op.id],
	};
}

// --- CONTENT-005 — update an existing custom object type (DM-only; re-validated, fail closed) ------

export function handleUpdateCustomObjectType(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(updateCustomObjectTypeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) return reject(NOT_DM_REJECTION, state);

	const content = ensureContentStateSlice(state.content);
	const existing = customObjectTypeById(content, parsed.data.id);
	if (existing === undefined) {
		return reject(
			{ code: 'custom-type-not-found', message: `Custom object type ${parsed.data.id} does not exist.` },
			state,
		);
	}

	const draft = draftFromInput(parsed.data);
	const validation = validateCustomObjectTypeDefinition(draft);
	if (!validation.valid) return reject(typeInvalidRejection(validation), state);

	const now = env.clock();
	// Preserve createdAt/author; bump the definition revision (optimistic concurrency).
	const def = buildCustomObjectType(draft, {
		authorActorId: existing.authorActorId,
		now,
		createdAt: existing.createdAt,
		revision: existing.revision + 1,
	});
	const nextContent = defineCustomObjectType(content, def);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CUSTOM_OBJECT_TYPE_ENTITY_TYPE,
		entityId: def.id,
		opType: 'content.update-object-type',
		path: `content/customObjectTypes/${def.id}`,
		value: { id: def.id, label: def.label, fieldCount: def.fields.length },
		beforeRevision: existing.revision,
		afterRevision: def.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draftOp.log },
		events: [{ kind: 'content.object-type-changed', typeId: def.id, mutation: 'update', actorId: actor.id }],
		operationIds: [draftOp.op.id],
	};
}

// --- CONTENT-005 — delete a custom object type (DM-only; refused while instances exist) -----------

export function handleDeleteCustomObjectType(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(deleteCustomObjectTypeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	if (!actorMayAuthorVault(actor)) return reject(NOT_DM_REJECTION, state);

	const content = ensureContentStateSlice(state.content);
	const existing = customObjectTypeById(content, parsed.data.id);
	if (existing === undefined) {
		return reject(
			{ code: 'custom-type-not-found', message: `Custom object type ${parsed.data.id} does not exist.` },
			state,
		);
	}

	// FAIL CLOSED: never orphan an instance. Block the delete while any live object of this type exists.
	const inUse = countObjectsOfSubtype(content, existing.id);
	if (inUse > 0) {
		return reject(
			{
				code: 'custom-type-in-use',
				message: `Cannot delete ${existing.id}: ${inUse} object${inUse === 1 ? '' : 's'} of this type still exist. Remove them first.`,
			},
			state,
		);
	}

	const nextContent = removeCustomObjectType(content, existing.id);

	const draftOp = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CUSTOM_OBJECT_TYPE_ENTITY_TYPE,
		entityId: existing.id,
		opType: 'content.delete-object-type',
		path: `content/customObjectTypes/${existing.id}`,
		value: { id: existing.id },
		beforeRevision: existing.revision,
		afterRevision: existing.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: { ...contentWith(state, nextContent), sync: draftOp.log },
		events: [{ kind: 'content.object-type-changed', typeId: existing.id, mutation: 'delete', actorId: actor.id }],
		operationIds: [draftOp.op.id],
	};
}
