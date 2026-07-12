import {
	claimPartyInventoryItemInputSchema,
	moveEquipmentItemInputSchema,
	removeEquipmentItemInputSchema,
	setCurrencyInputSchema,
	upsertEquipmentItemInputSchema,
} from '../schemas/commands';
import type { Character } from '../state/character-state';
import {
	CHARACTER_ENTITY_TYPE,
	partyRecordOf,
	removePartyInventoryItem,
	upsertCharacter,
	upsertPartyInventoryItem,
} from '../state/character-state';
import {
	adjustCurrency,
	consolidateCurrency,
	inventoryOf,
	moveEquipmentItem,
	removeEquipmentItem,
	setCurrency,
	upsertEquipmentItem,
	type CharacterInventory,
	type CurrencyPurse,
} from '../state/character-inventory';
import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import {
	appendOperationDraft,
	ensureCharacterStateSlice,
	parseInput,
	reject,
	requireActor,
} from './helpers';

/**
 * I10 S10.1.3 / S10.4.2 — durable STRUCTURED EQUIPMENT / CURRENCY commands (Architecture Contract 1 /
 * Contract 3). Every mutation is a Processing-Core command following the EXACT idioms of the sibling
 * character-sheet commands: actor authority is checked fail-closed, the durable CharacterState is
 * mutated through the pure `state/character-inventory.ts` reducers, and a durable `character.*` sync
 * operation is appended. Carried weight / encumbrance / computed AC are DERIVED on read (queries), so
 * no command stores them.
 *
 * Authority mirrors the CHAR-008 owner-or-DM manage guard: equipment + currency edits are OWNER (a
 * granted `owner` capability) OR the DM (administrator). An observer never qualifies (and the observer
 * write-gate in `dispatch.ts` rejects them before we run). They are NOT session-gated — inventory is
 * durable "at full rest" sheet state, like proficiencies and managed resources.
 *
 * The one exception is `character.claim-party-inventory-item` (S10.4.2): ANY connected participant may
 * move an item from the shared stash into a character THEY may edit, so it composes the party-inventory
 * remove + the character equipment add in one atomic command.
 */

function charactersWith(state: CoreStateSlice, characters: CoreStateSlice['characters']): CoreStateSlice {
	return { ...state, characters };
}

/**
 * OWNER-or-DM guard (mirrors `character-sheet.ts` / CHAR-008). `now` MUST be the env clock so an
 * EXPIRED `owner` grant is inert (fail closed — PERM-004 AC2).
 */
function actorMayEditInventory(
	state: CoreStateSlice,
	actor: Actor,
	characterId: string,
	now: string,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	return hasGrantedCapability(state.permissions, actor, CHARACTER_ENTITY_TYPE, characterId, 'owner', now);
}

function inventoryGuard(
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
	if (!actorMayEditInventory(state, actor, existing.id, now)) {
		return {
			rejection: reject(
				{ code: 'actor-not-authorized', message: 'Only the character owner may edit equipment and currency.' },
				state,
			),
		};
	}
	return { actor, existing };
}

function inventoryChangedEvent(characterId: string, revision: number, actorId: string): CoreEvent {
	return { kind: 'character.inventory-changed', characterId, revision, actorId };
}

/**
 * Commit a character's next inventory block: bump revision, upsert, append a durable op, and emit the
 * inventory-changed event. Shared by every equipment/currency handler so the op-log shape is uniform.
 */
function commitInventory(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actor: Actor,
	existing: Character,
	nextInventory: CharacterInventory,
	opType: string,
	value: unknown,
	now: string,
): CommandResult {
	const updated: Character = {
		...existing,
		inventory: nextInventory,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	const characters = ensureCharacterStateSlice(state.characters);
	const nextCharacters = upsertCharacter(characters, updated);
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: updated.id,
		opType,
		path: `characters/${updated.id}/inventory`,
		value,
		beforeRevision: existing.revision,
		afterRevision: updated.revision,
	});
	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [inventoryChangedEvent(updated.id, updated.revision, actor.id)],
		operationIds: [draft.op.id],
	};
}

// --- S10.1.3 — equipment add/update ------------------------------------------------------------

export function handleUpsertEquipmentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(upsertEquipmentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = inventoryGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const result = upsertEquipmentItem(
		inventoryOf(guard.existing),
		{
			...(parsed.data.id !== undefined ? { id: parsed.data.id } : {}),
			name: parsed.data.name,
			...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
			...(parsed.data.weight !== undefined ? { weight: parsed.data.weight } : {}),
			...(parsed.data.equipped !== undefined ? { equipped: parsed.data.equipped } : {}),
			...(parsed.data.attuned !== undefined ? { attuned: parsed.data.attuned } : {}),
			...(parsed.data.vaultObjectId !== undefined ? { vaultObjectId: parsed.data.vaultObjectId } : {}),
			...(parsed.data.container !== undefined ? { container: parsed.data.container } : {}),
			...(parsed.data.armor !== undefined ? { armor: parsed.data.armor } : {}),
			...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
		},
		env.ids,
	);
	if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
	return commitInventory(
		state,
		env,
		guard.actor,
		guard.existing,
		result.inventory,
		'character.upsert-equipment-item',
		{ itemId: result.item.id, name: result.item.name, quantity: result.item.quantity },
		now,
	);
}

// --- S10.1.3 — equipment remove ----------------------------------------------------------------

export function handleRemoveEquipmentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(removeEquipmentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = inventoryGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const inventory = inventoryOf(guard.existing);
	if (!inventory.items.some((item) => item.id === parsed.data.itemId)) {
		return reject({ code: 'invalid-payload', message: `No equipment item "${parsed.data.itemId}".` }, state);
	}
	const nextInventory = removeEquipmentItem(inventory, parsed.data.itemId);
	return commitInventory(
		state,
		env,
		guard.actor,
		guard.existing,
		nextInventory,
		'character.remove-equipment-item',
		{ itemId: parsed.data.itemId },
		now,
	);
}

// --- S10.1.3 — equipment move (container/slot) -------------------------------------------------

export function handleMoveEquipmentItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(moveEquipmentItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = inventoryGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const result = moveEquipmentItem(inventoryOf(guard.existing), parsed.data.itemId, parsed.data.container);
	if (!result.ok) return reject({ code: 'invalid-payload', message: result.message }, state);
	return commitInventory(
		state,
		env,
		guard.actor,
		guard.existing,
		result.inventory,
		'character.move-equipment-item',
		{ itemId: parsed.data.itemId, container: parsed.data.container },
		now,
	);
}

// --- S10.1.3 — currency set / adjust -----------------------------------------------------------

export function handleSetCurrency(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(setCurrencyInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = inventoryGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;

	const inventory = inventoryOf(guard.existing);
	let purse: CurrencyPurse = inventory.currency;
	if (parsed.data.currency !== undefined) {
		const result =
			parsed.data.mode === 'adjust'
				? adjustCurrency(purse, parsed.data.currency)
				: setCurrency(purse, parsed.data.currency);
		if (!result.ok) {
			const code = result.error === 'insufficient-funds' ? 'invalid-state' : 'invalid-payload';
			return reject({ code, message: result.message }, state);
		}
		purse = result.purse;
	}
	if (parsed.data.consolidate === true) purse = consolidateCurrency(purse);

	return commitInventory(
		state,
		env,
		guard.actor,
		guard.existing,
		{ ...inventory, currency: purse },
		'character.set-currency',
		{ mode: parsed.data.mode, currency: purse },
		now,
	);
}

// --- S10.4.2 — claim a stash item into personal equipment --------------------------------------

/**
 * S10.4.2 — move an item from the shared party stash to a character's personal equipment. Authority is
 * broader than the DM-only stash edit: ANY connected participant may claim FOR a character they may
 * edit (owner or DM), and the item must be VISIBLE to the actor (so a player can't claim a `dm-only`
 * stash item they cannot see). Atomic: the claimed quantity leaves the stash (the stack is reduced or
 * removed) and becomes an equipment line on the character. Emits BOTH inventory- and party-changed.
 */
export function handleClaimPartyInventoryItem(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(claimPartyInventoryItemInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const now = env.clock();
	const guard = inventoryGuard(state, actorId, parsed.data.characterId, now);
	if ('rejection' in guard) return guard.rejection;
	const { actor, existing } = guard;

	const characters = ensureCharacterStateSlice(state.characters);
	const party = partyRecordOf(characters);
	const stashItem = party.inventory.find((item) => item.id === parsed.data.itemId);
	if (!stashItem) {
		return reject({ code: 'invalid-payload', message: `No stash item "${parsed.data.itemId}".` }, state);
	}
	// Visibility gate: the actor must be able to SEE the stash item (fail closed). The DM sees all.
	const canSee =
		actor.role === 'dm' ||
		stashItem.visibility === 'player-visible' ||
		(stashItem.visibility === 'shared' && stashItem.sharedWith.includes(actor.id));
	if (!canSee) {
		return reject({ code: 'actor-not-authorized', message: 'You cannot claim an item you cannot see.' }, state);
	}

	const claimQty = Math.min(parsed.data.quantity ?? stashItem.quantity, stashItem.quantity);
	if (claimQty <= 0) {
		return reject({ code: 'invalid-state', message: 'The stash item has nothing to claim.' }, state);
	}

	// 1) Add the claimed quantity as a new equipment line on the character (weight carries over).
	const addResult = upsertEquipmentItem(
		inventoryOf(existing),
		{ name: stashItem.name, quantity: claimQty, weight: stashItem.weight, notes: stashItem.detail },
		env.ids,
	);
	if (!addResult.ok) return reject({ code: 'invalid-payload', message: addResult.message }, state);
	const claimedCharacter: Character = {
		...existing,
		inventory: addResult.inventory,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	let nextCharacters = upsertCharacter(characters, claimedCharacter);

	// 2) Reduce/remove the stash stack by the claimed quantity.
	const remaining = stashItem.quantity - claimQty;
	nextCharacters =
		remaining > 0
			? upsertPartyInventoryItem(
					nextCharacters,
					{ id: stashItem.id, name: stashItem.name, detail: stashItem.detail, quantity: remaining, weight: stashItem.weight, visibility: stashItem.visibility, sharedWith: stashItem.sharedWith },
					env.ids,
				)
			: removePartyInventoryItem(nextCharacters, stashItem.id);

	const partyRevision = partyRecordOf(nextCharacters).revision;
	const draft = appendOperationDraft(env, state.sync, actor.id, {
		entityType: CHARACTER_ENTITY_TYPE,
		entityId: claimedCharacter.id,
		opType: 'character.claim-party-inventory-item',
		path: `characters/${claimedCharacter.id}/inventory`,
		value: { itemId: stashItem.id, name: stashItem.name, quantity: claimQty },
		beforeRevision: existing.revision,
		afterRevision: claimedCharacter.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...charactersWith(state, nextCharacters), sync: draft.log },
		events: [
			inventoryChangedEvent(claimedCharacter.id, claimedCharacter.revision, actor.id),
			{ kind: 'character.party-changed', revision: partyRevision, actorId: actor.id },
		],
		operationIds: [draft.op.id],
	};
}
