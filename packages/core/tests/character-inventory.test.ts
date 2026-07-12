import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	adjustCurrency,
	carriedItemWeight,
	coinWeight,
	computeEncumbrance,
	consolidateCurrency,
	currencyValueCp,
	derivedArmorClass,
	dispatchCommand,
	encumbranceLevelFor,
	EMPTY_CHARACTER_INVENTORY,
	inventoryOf,
	moveEquipmentItem,
	partyRecordOf,
	removeEquipmentItem,
	setCurrency,
	upsertEquipmentItem,
	type Actor,
	type Character,
	type CharacterState,
	type CommandResult,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';

/**
 * I10 S10.1.3 / S10.4.2 — STRUCTURED EQUIPMENT / CURRENCY / ENCUMBRANCE.
 *
 * Two layers of evidence:
 *   - PURE POLICY (state/character-inventory.ts): add/update/remove/move items, currency set/adjust
 *     fail-closed on overspend, greedy consolidation is value-preserving, encumbrance thresholds and
 *     coin weight, derived AC from equipped armor.
 *   - COMMANDS (commands/character-inventory.ts via dispatch): owner-or-DM authority (fail closed for a
 *     non-owner player and for an observer), overspend rejected at the command boundary, the
 *     inventory-changed event + a durable sync op, and claiming a stash item into personal equipment.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function firstCharacterId(state: CharacterState, name: string): string {
	return Object.values(state.characters).find((c) => c.name === name)!.id;
}

function characterById(state: CoreStateSlice, id: string): Character {
	const c = state.characters.characters[id];
	if (!c) throw new Error(`no character ${id}`);
	return c;
}

/** DM quick-creates a character with the given name and STR; returns state + its id. */
function createCharacter(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
	str = 10,
	dex = 10,
): { state: CoreStateSlice; id: string } {
	const result = accepted(
		dispatchCommand(state, env, {
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: {
				kind: 'sidekick',
				name,
				visibility: 'player-visible',
				abilityScores: { str, dex },
				combat: { hp: 10, maxHp: 10, ac: 10 },
			},
		}),
	);
	return { state: result.nextState, id: firstCharacterId(result.nextState.characters, name) };
}

/** DM grants `owner` to a player on a character. */
function grantOwner(
	state: CoreStateSlice,
	env: CoreEnvironment,
	characterId: string,
	playerActorId: string,
): CoreStateSlice {
	return accepted(
		dispatchCommand(state, env, {
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: characterId, playerActorId, capabilitySet: 'owner' },
		}),
	).nextState;
}

let itemSeq = 0;
const idFor = (): string => `item-${++itemSeq}`;

// =================================================================================================
// PURE — equipment items
// =================================================================================================

describe('S10.1.3 — equipment item policy (pure)', () => {
	it('adds a new item with a fresh id and defaults', () => {
		const result = upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'Longsword' }, idFor);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.inventory.items).toHaveLength(1);
		expect(result.item.name).toBe('Longsword');
		expect(result.item.quantity).toBe(1);
		expect(result.item.weight).toBe(0);
		expect(result.item.equipped).toBe(false);
	});

	it('updates an item in place with PATCH semantics (omitted fields preserved)', () => {
		const added = upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'Torch', quantity: 5, weight: 1 }, idFor);
		expect(added.ok).toBe(true);
		if (!added.ok) return;
		const patched = upsertEquipmentItem(added.inventory, { id: added.item.id, name: 'Torch', quantity: 2 }, idFor);
		expect(patched.ok).toBe(true);
		if (!patched.ok) return;
		expect(patched.inventory.items).toHaveLength(1);
		expect(patched.item.quantity).toBe(2);
		// weight preserved from the original.
		expect(patched.item.weight).toBe(1);
	});

	it('fails closed on an empty name or a negative quantity/weight', () => {
		expect(upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: '   ' }, idFor).ok).toBe(false);
		expect(upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'X', quantity: -1 }, idFor).ok).toBe(false);
		expect(upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'X', weight: -2 }, idFor).ok).toBe(false);
	});

	it('removes an item by id (no-op when absent)', () => {
		const added = upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'Rope' }, idFor);
		if (!added.ok) throw new Error('add failed');
		const removed = removeEquipmentItem(added.inventory, added.item.id);
		expect(removed.items).toHaveLength(0);
		// no-op path returns the same reference
		expect(removeEquipmentItem(added.inventory, 'nope')).toBe(added.inventory);
	});

	it('moves an item to a container and fails closed on a missing item', () => {
		const added = upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'Potion' }, idFor);
		if (!added.ok) throw new Error('add failed');
		const moved = moveEquipmentItem(added.inventory, added.item.id, 'Backpack');
		expect(moved.ok).toBe(true);
		if (!moved.ok) return;
		expect(moved.inventory.items[0]!.container).toBe('Backpack');
		expect(moveEquipmentItem(added.inventory, 'nope', 'Bag').ok).toBe(false);
	});
});

// =================================================================================================
// PURE — currency
// =================================================================================================

describe('S10.4.2 — currency policy (pure)', () => {
	it('sets denominations and fails closed on a negative count', () => {
		const set = setCurrency(EMPTY_CHARACTER_INVENTORY.currency, { gp: 10, sp: 5 });
		expect(set.ok).toBe(true);
		if (!set.ok) return;
		expect(set.purse.gp).toBe(10);
		expect(set.purse.sp).toBe(5);
		expect(setCurrency(EMPTY_CHARACTER_INVENTORY.currency, { gp: -1 }).ok).toBe(false);
	});

	it('adjusts by signed deltas and fails closed (insufficient-funds) on overspend', () => {
		const start = { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 };
		const earn = adjustCurrency(start, { gp: 5 });
		expect(earn.ok).toBe(true);
		if (earn.ok) expect(earn.purse.gp).toBe(15);

		const spend = adjustCurrency(start, { gp: -4 });
		expect(spend.ok).toBe(true);
		if (spend.ok) expect(spend.purse.gp).toBe(6);

		const overspend = adjustCurrency(start, { gp: -11 });
		expect(overspend.ok).toBe(false);
		if (!overspend.ok) expect(overspend.error).toBe('insufficient-funds');
	});

	it('consolidates greedily without changing total value', () => {
		const messy = { cp: 250, sp: 30, ep: 1, gp: 0, pp: 0 };
		const before = currencyValueCp(messy);
		const tidy = consolidateCurrency(messy);
		expect(currencyValueCp(tidy)).toBe(before);
		// 250cp + 300cp + 50cp = 600cp => 6gp exactly
		expect(tidy).toEqual({ cp: 0, sp: 0, ep: 0, gp: 6, pp: 0 });
	});
});

// =================================================================================================
// PURE — encumbrance + derived AC
// =================================================================================================

describe('S10.4.2 — encumbrance thresholds (pure)', () => {
	it('classifies the four bands against STR', () => {
		// STR 10 => encumbered at >50, heavily at >100, overloaded at >150.
		expect(encumbranceLevelFor(0, 10)).toBe('unencumbered');
		expect(encumbranceLevelFor(50, 10)).toBe('unencumbered');
		expect(encumbranceLevelFor(51, 10)).toBe('encumbered');
		expect(encumbranceLevelFor(100, 10)).toBe('encumbered');
		expect(encumbranceLevelFor(101, 10)).toBe('heavily-encumbered');
		expect(encumbranceLevelFor(150, 10)).toBe('heavily-encumbered');
		expect(encumbranceLevelFor(151, 10)).toBe('overloaded');
	});

	it('carried weight includes coin weight (50 coins ⇒ 1 lb)', () => {
		const withItems = upsertEquipmentItem(EMPTY_CHARACTER_INVENTORY, { name: 'Anvil', quantity: 2, weight: 5 }, idFor);
		if (!withItems.ok) throw new Error('add failed');
		expect(carriedItemWeight(withItems.inventory)).toBe(10);
		expect(coinWeight({ cp: 100, sp: 0, ep: 0, gp: 0, pp: 0 })).toBe(2);
	});
});

describe('S10.1.3 — computed encumbrance + AC via a real character', () => {
	it('derives encumbrance state from items + coins vs STR capacity', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Ox', 15);
		state = c.state;
		state = grantOwner(state, env, c.id, PLAYER_ACTOR.id);
		// Add a 200 lb load (well over STR15 capacity of 225... use 240 to overload).
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, name: 'Boulder', quantity: 1, weight: 240 },
			}),
		).nextState;
		const enc = computeEncumbrance(characterById(state, c.id));
		expect(enc.strength).toBe(15);
		expect(enc.carryCapacity).toBe(225);
		expect(enc.carriedWeight).toBe(240);
		expect(enc.level).toBe('overloaded');
		expect(enc.overCapacity).toBe(true);
	});

	it('derives AC from equipped armor + shield, else null', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Knight', 12, 14); // DEX 14 => +2
		state = c.state;
		const noArmor = characterById(state, c.id);
		expect(derivedArmorClass(noArmor)).toBeNull();

		// Breastplate (medium, base 14, DEX capped +2) + shield (+2) => 14+2+2 = 18.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: DM_ACTOR.id,
				payload: {
					characterId: c.id,
					name: 'Breastplate',
					equipped: true,
					armor: { category: 'medium', baseAc: 14, addDex: true, maxDexBonus: 2 },
				},
			}),
		).nextState;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: DM_ACTOR.id,
				payload: {
					characterId: c.id,
					name: 'Shield',
					equipped: true,
					armor: { category: 'shield', baseAc: 2, addDex: false, maxDexBonus: null },
				},
			}),
		).nextState;
		expect(derivedArmorClass(characterById(state, c.id))).toBe(18);
	});
});

// =================================================================================================
// COMMANDS — authority + events + sync
// =================================================================================================

describe('S10.1.3 — equipment commands (authority + sync)', () => {
	it('lets the OWNER add an item, emits inventory-changed, and appends a sync op', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Aria');
		state = c.state;
		state = grantOwner(state, env, c.id, PLAYER_ACTOR.id);
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, name: 'Rations', quantity: 3, weight: 2 },
			}),
		);
		expect(inventoryOf(characterById(result.nextState, c.id)).items).toHaveLength(1);
		expect(result.events.some((e) => e.kind === 'character.inventory-changed')).toBe(true);
		expect(result.operationIds.length).toBe(1);
	});

	it('lets the DM edit any character inventory', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Borin');
		state = c.state;
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: DM_ACTOR.id,
				payload: { characterId: c.id, name: 'Map' },
			}),
		);
		expect(inventoryOf(characterById(result.nextState, c.id)).items).toHaveLength(1);
	});

	it('rejects a non-owner player (fail closed)', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Cael');
		state = c.state;
		// PLAYER_B has no owner grant.
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: PLAYER_B.id,
				payload: { characterId: c.id, name: 'Sneaky Dagger' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects an observer (observer write gate)', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Dain');
		state = c.state;
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: OBSERVER_ACTOR.id,
				payload: { characterId: c.id, name: 'Forbidden' },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('removes an equipment item and rejects removing a missing one', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Elric');
		state = c.state;
		const added = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-equipment-item',
				actorId: DM_ACTOR.id,
				payload: { characterId: c.id, name: 'Wand' },
			}),
		);
		state = added.nextState;
		const itemId = inventoryOf(characterById(state, c.id)).items[0]!.id;
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.remove-equipment-item',
				actorId: DM_ACTOR.id,
				payload: { characterId: c.id, itemId },
			}),
		).nextState;
		expect(inventoryOf(characterById(state, c.id)).items).toHaveLength(0);
		rejected(
			dispatchCommand(state, env, {
				type: 'character.remove-equipment-item',
				actorId: DM_ACTOR.id,
				payload: { characterId: c.id, itemId: 'ghost' },
			}),
		);
	});
});

describe('S10.4.2 — currency commands (fail closed on overspend)', () => {
	it('sets, adjusts, and rejects an overspend at the command boundary', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Merchant');
		state = c.state;
		state = grantOwner(state, env, c.id, PLAYER_ACTOR.id);
		// Set 10 gp.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-currency',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, mode: 'set', currency: { gp: 10 } },
			}),
		).nextState;
		expect(inventoryOf(characterById(state, c.id)).currency.gp).toBe(10);
		// Spend 4 gp.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.set-currency',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, mode: 'adjust', currency: { gp: -4 } },
			}),
		).nextState;
		expect(inventoryOf(characterById(state, c.id)).currency.gp).toBe(6);
		// Overspend 20 gp => rejected, state unchanged.
		const result = rejected(
			dispatchCommand(state, env, {
				type: 'character.set-currency',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, mode: 'adjust', currency: { gp: -20 } },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
		expect(inventoryOf(characterById(state, c.id)).currency.gp).toBe(6);
	});
});

describe('S10.4.2 — claim a party-stash item into personal equipment', () => {
	it('moves the claimed quantity from the stash onto the character', () => {
		const env = makeEnvironment();
		let state = base();
		const c = createCharacter(state, env, 'Rogue');
		state = c.state;
		state = grantOwner(state, env, c.id, PLAYER_ACTOR.id);
		// DM adds a visible stash stack of 5 daggers.
		state = accepted(
			dispatchCommand(state, env, {
				type: 'character.upsert-party-inventory-item',
				actorId: DM_ACTOR.id,
				payload: { name: 'Dagger', quantity: 5, weight: 1, visibility: 'player-visible' },
			}),
		).nextState;
		const stashId = partyRecordOf(state.characters).inventory[0]!.id;
		// Player claims 2 for their character.
		const result = accepted(
			dispatchCommand(state, env, {
				type: 'character.claim-party-inventory-item',
				actorId: PLAYER_ACTOR.id,
				payload: { characterId: c.id, itemId: stashId, quantity: 2 },
			}),
		);
		state = result.nextState;
		const line = inventoryOf(characterById(state, c.id)).items.find((i) => i.name === 'Dagger');
		expect(line?.quantity).toBe(2);
		// Stash keeps the remaining 3.
		expect(partyRecordOf(state.characters).inventory[0]!.quantity).toBe(3);
		expect(result.events.some((e) => e.kind === 'character.inventory-changed')).toBe(true);
		expect(result.events.some((e) => e.kind === 'character.party-changed')).toBe(true);
	});
});
