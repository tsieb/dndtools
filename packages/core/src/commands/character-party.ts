import {
	removePartyInventoryItemInputSchema,
	setMarchingOrderInputSchema,
	upsertPartyInventoryItemInputSchema,
} from '../schemas/commands';
import {
	CHARACTER_ENTITY_TYPE,
	partyRecordOf,
	removePartyInventoryItem,
	setMarchingOrder,
	upsertPartyInventoryItem,
	type CharacterState,
} from '../state/character-state';
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
 * CHAR-011 — durable PARTY-RECORD commands (Architecture Contract 1 / Contract 3). The party's
 * marching order and shared inventory are AUTHORED by the DM (administrative party state); the
 * actor-filtered party-overview query is the only sanctioned READ path and decides per-viewer
 * visibility. Every mutation is a Processing-Core command: it requires the DM, mutates the durable
 * CharacterState through PURE reducers, and appends a durable `party.*` sync op — the GUI never writes
 * party state directly.
 */

const PARTY_ENTITY_ID = 'party' as const;

function charactersWith(state: CoreStateSlice, characters: CharacterState): CoreStateSlice {
	return { ...state, characters };
}

function partyChangedEvent(actorId: string, revision: number): CoreEvent {
	return { kind: 'character.party-changed', revision, actorId };
}

/** CHAR-011 — set the party marching order (DM-only). */
export function handleSetMarchingOrder(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setMarchingOrderInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	// Fail closed: a marching-order id that names no character is rejected so the order never carries
	// a dangling reference (it would silently vanish from every viewer's filtered order otherwise).
	for (const id of parsed.data.order) {
		if (!characters.characters[id]) {
			return reject(
				{ code: 'character-not-found', message: `Character ${id} does not exist.` },
				state,
			);
		}
	}

	const next = setMarchingOrder(characters, parsed.data.order);
	const revision = partyRecordOf(next).revision;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: PARTY_ENTITY_ID,
		opType: 'party.set-marching-order',
		path: `characters/party/marchingOrder`,
		value: { order: parsed.data.order },
		afterRevision: revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, next), sync: draft.log },
		events: [partyChangedEvent(actor.id, revision)],
		operationIds: [draft.op.id],
	};
}

/** CHAR-011 — add/update a party-inventory item (DM-only). */
export function handleUpsertPartyInventoryItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(upsertPartyInventoryItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const next = upsertPartyInventoryItem(
		characters,
		{
			...(parsed.data.id !== undefined ? { id: parsed.data.id } : {}),
			name: parsed.data.name,
			detail: parsed.data.detail,
			visibility: parsed.data.visibility,
			sharedWith: parsed.data.sharedWith,
		},
		env.ids,
	);
	const revision = partyRecordOf(next).revision;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: PARTY_ENTITY_ID,
		opType: 'party.upsert-inventory-item',
		path: `characters/party/inventory`,
		value: { name: parsed.data.name, visibility: parsed.data.visibility },
		afterRevision: revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, next), sync: draft.log },
		events: [partyChangedEvent(actor.id, revision)],
		operationIds: [draft.op.id],
	};
}

/** CHAR-011 — remove a party-inventory item (DM-only). */
export function handleRemovePartyInventoryItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(removePartyInventoryItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const characters = ensureCharacterStateSlice(state.characters);
	const next = removePartyInventoryItem(characters, parsed.data.itemId);
	const revision = partyRecordOf(next).revision;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: PARTY_ENTITY_ID,
		opType: 'party.remove-inventory-item',
		path: `characters/party/inventory`,
		value: { itemId: parsed.data.itemId },
		afterRevision: revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, next), sync: draft.log },
		events: [partyChangedEvent(actor.id, revision)],
		operationIds: [draft.op.id],
	};
}
