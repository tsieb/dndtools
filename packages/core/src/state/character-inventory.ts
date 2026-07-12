import type { Character } from './character-state';

/**
 * I10 S10.1.3 — the STRUCTURED EQUIPMENT / CURRENCY / ENCUMBRANCE model, plus the pure deterministic
 * policy that mutates and derives it.
 *
 * This EXTENDS the existing character model rather than introducing a parallel one: the durable
 * {@link Character} gains an optional {@link CharacterInventory} block (see `character-state.ts`),
 * carried alongside the existing `combat`/`data`/`resources`/`proficiencies` values it complements. A
 * character persisted before this slice hydrates safely (absent ⇒ empty inventory via
 * {@link ensureCharacterInventory}) — exactly the pattern `resourcesOf` / `proficienciesOf` use.
 *
 * Everything here is PURE Processing-Core policy (Contract 1): the equipment mutations, currency
 * conversion, and encumbrance thresholds are deterministic functions over plain data, with no GUI,
 * storage, or ambient clock/entropy — ids are supplied by the command env. The command handlers
 * (`commands/character-inventory.ts`) compose these and append a durable `character.*` op; the GUI
 * dispatches command intents and renders the DERIVED model (carried weight / encumbrance / computed
 * AC are never stored, so they cannot drift from the underlying items + ability scores).
 */

export const CHARACTER_INVENTORY_SCHEMA_VERSION = 1 as const;

// --- Currency (CP / SP / EP / GP / PP) ----------------------------------------------------------

/** The five 5e coin denominations the currency purse tracks (CHAR / S10.1.3). */
export type CoinType = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

export const COIN_TYPES: readonly CoinType[] = Object.freeze(['cp', 'sp', 'ep', 'gp', 'pp']);

/**
 * The value of one coin of each denomination in COPPER pieces — the canonical 5e conversion table.
 * Each larger denomination is an exact multiple of the smaller ones, so greedy consolidation is
 * optimal (see {@link consolidateCurrency}).
 */
export const COIN_VALUE_CP: Record<CoinType, number> = Object.freeze({
	cp: 1,
	sp: 10,
	ep: 50,
	gp: 100,
	pp: 1000,
});

/** Coins per POUND for encumbrance: 50 coins weigh 1 lb, regardless of denomination (PHB). */
export const COINS_PER_POUND = 50 as const;

/** A character's coin purse. All counts are non-negative whole numbers. */
export interface CurrencyPurse {
	cp: number;
	sp: number;
	ep: number;
	gp: number;
	pp: number;
}

export const EMPTY_CURRENCY: CurrencyPurse = Object.freeze({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

/** Tolerantly hydrate a possibly-absent/partial purse into a full non-negative purse. Pure. */
export function ensureCurrency(purse: Partial<CurrencyPurse> | undefined): CurrencyPurse {
	const coin = (value: number | undefined): number =>
		typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
	return {
		cp: coin(purse?.cp),
		sp: coin(purse?.sp),
		ep: coin(purse?.ep),
		gp: coin(purse?.gp),
		pp: coin(purse?.pp),
	};
}

/** The purse's total value expressed in COPPER pieces. Pure. */
export function currencyValueCp(purse: CurrencyPurse): number {
	return COIN_TYPES.reduce((sum, coin) => sum + purse[coin] * COIN_VALUE_CP[coin], 0);
}

/** The purse's total value expressed in GOLD pieces (may be fractional). Pure. */
export function currencyValueGp(purse: CurrencyPurse): number {
	return currencyValueCp(purse) / COIN_VALUE_CP.gp;
}

/** The total number of coins in the purse (drives coin weight). Pure. */
export function coinCount(purse: CurrencyPurse): number {
	return COIN_TYPES.reduce((sum, coin) => sum + purse[coin], 0);
}

/** The weight of the purse's coins in POUNDS (50 coins ⇒ 1 lb). Pure. */
export function coinWeight(purse: CurrencyPurse): number {
	return coinCount(purse) / COINS_PER_POUND;
}

/**
 * CONSOLIDATE a purse into the fewest coins of the largest denominations, preserving total value.
 * Greedy from pp down to cp; because every denomination is an exact multiple of the smaller ones, the
 * greedy result is optimal and value-preserving (`currencyValueCp` is unchanged). Pure.
 */
export function consolidateCurrency(purse: CurrencyPurse): CurrencyPurse {
	let remaining = currencyValueCp(purse);
	// Largest value first so each denomination takes as much as it can (canonical-coin greedy).
	const order: CoinType[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
	const next: CurrencyPurse = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
	for (const coin of order) {
		const value = COIN_VALUE_CP[coin];
		next[coin] = Math.floor(remaining / value);
		remaining -= next[coin] * value;
	}
	return next;
}

export type CurrencyError = 'invalid-amount' | 'insufficient-funds';

/**
 * SET the purse's denominations. A supplied coin replaces its count (clamped to a non-negative whole
 * number); an omitted coin preserves the existing count. Pure; fail-closed on a negative/non-finite
 * count.
 */
export function setCurrency(
	purse: CurrencyPurse,
	next: Partial<CurrencyPurse>,
): { ok: true; purse: CurrencyPurse } | { ok: false; error: CurrencyError; message: string } {
	const result: CurrencyPurse = { ...purse };
	for (const coin of COIN_TYPES) {
		const value = next[coin];
		if (value === undefined) continue;
		if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
			return { ok: false, error: 'invalid-amount', message: `${coin.toUpperCase()} must be a non-negative whole number.` };
		}
		result[coin] = value;
	}
	return { ok: true, purse: result };
}

/**
 * ADJUST the purse by signed per-coin deltas (e.g. earn +50 gp, spend -2 sp). Fail-closed when any
 * denomination would go negative (`insufficient-funds`) — no auto-breaking of larger coins, so an
 * adjust never silently changes another denomination. Pure.
 */
export function adjustCurrency(
	purse: CurrencyPurse,
	delta: Partial<CurrencyPurse>,
): { ok: true; purse: CurrencyPurse } | { ok: false; error: CurrencyError; message: string } {
	const result: CurrencyPurse = { ...purse };
	for (const coin of COIN_TYPES) {
		const value = delta[coin];
		if (value === undefined) continue;
		if (!Number.isFinite(value) || !Number.isInteger(value)) {
			return { ok: false, error: 'invalid-amount', message: `${coin.toUpperCase()} delta must be a whole number.` };
		}
		const nextCount = result[coin] + value;
		if (nextCount < 0) {
			return { ok: false, error: 'insufficient-funds', message: `Not enough ${coin.toUpperCase()} for that change.` };
		}
		result[coin] = nextCount;
	}
	return { ok: true, purse: result };
}

// --- Equipment items ----------------------------------------------------------------------------

/** The armor category, which decides how DEX contributes to AC (S10.1.3 armor→AC). */
export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';

/**
 * Optional armor metadata on an equipment item. When present AND the item is `equipped`, the item
 * contributes to the character's DERIVED armor class (see {@link derivedArmorClass}).
 *
 *   - `baseAc` is the armor's base (e.g. 14 for a breastplate), or the flat bonus for a `shield`.
 *   - `addDex` — whether the DEX modifier is added (light/medium armor add it; heavy does not).
 *   - `maxDexBonus` — the DEX-bonus cap (medium armor caps at +2; light is uncapped ⇒ null).
 */
export interface EquipmentArmor {
	category: ArmorCategory;
	baseAc: number;
	addDex: boolean;
	maxDexBonus: number | null;
}

/**
 * One equipment/inventory line on a character (S10.1.3). `quantity` and per-unit `weight` drive the
 * derived carried weight; `equipped`/`attuned` are the two 5e flags; `vaultObjectId` links a known
 * vault compendium item (null when created inline); `container` is an optional slot/bag grouping.
 */
export interface EquipmentItem {
	id: string;
	name: string;
	/** How many of this item are carried (non-negative whole number). */
	quantity: number;
	/** Per-UNIT weight in pounds (non-negative). Total item weight is `quantity * weight`. */
	weight: number;
	/** Whether the item is currently equipped (worn/wielded). Equipped armor contributes to AC. */
	equipped: boolean;
	/** Whether the item is attuned (5e caps a character at 3 attuned items — surfaced, not enforced). */
	attuned: boolean;
	/** The linked vault compendium object id, or null when the item was created inline. */
	vaultObjectId: string | null;
	/** Optional container/slot grouping (e.g. "Backpack", "Bag of Holding"), or null when loose. */
	container: string | null;
	/** Optional armor metadata; equipped armor contributes to the derived AC (S10.1.3). */
	armor: EquipmentArmor | null;
	/** Free-form notes (e.g. attunement requirement, charges). */
	notes: string;
}

/** The structured inventory carried on a {@link Character}: equipment list + coin purse. */
export interface CharacterInventory {
	items: EquipmentItem[];
	currency: CurrencyPurse;
	schemaVersion: typeof CHARACTER_INVENTORY_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_INVENTORY: CharacterInventory = Object.freeze({
	items: [],
	currency: { ...EMPTY_CURRENCY },
	schemaVersion: CHARACTER_INVENTORY_SCHEMA_VERSION,
});

/** Hydrate one possibly-partial persisted equipment item into a full item with safe defaults. Pure. */
function ensureEquipmentItem(item: Partial<EquipmentItem> & { id: string; name: string }): EquipmentItem {
	const nonNeg = (value: number | undefined, fallback: number): number =>
		typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
	return {
		id: item.id,
		name: item.name,
		quantity: nonNeg(item.quantity, 1),
		weight: nonNeg(item.weight, 0),
		equipped: item.equipped === true,
		attuned: item.attuned === true,
		vaultObjectId: item.vaultObjectId ?? null,
		container: item.container ?? null,
		armor: item.armor ? { ...item.armor } : null,
		notes: item.notes ?? '',
	};
}

/** Tolerantly hydrate a possibly-absent/partial inventory block (safe empty default). Pure. */
export function ensureCharacterInventory(
	inventory: CharacterInventory | undefined,
): CharacterInventory {
	return {
		items: inventory?.items
			? inventory.items
					.filter((item): item is EquipmentItem => !!item && typeof item.id === 'string' && typeof item.name === 'string')
					.map((item) => ensureEquipmentItem(item))
			: [],
		currency: ensureCurrency(inventory?.currency),
		schemaVersion: CHARACTER_INVENTORY_SCHEMA_VERSION,
	};
}

/** Read the inventory block off a character, hydrating safe defaults. Pure. */
export function inventoryOf(character: Character): CharacterInventory {
	return ensureCharacterInventory(character.inventory);
}

export type EquipmentError = 'invalid-quantity' | 'invalid-weight' | 'invalid-name' | 'no-such-item';

export interface UpsertEquipmentInput {
	/** Absent ⇒ a NEW item (the caller supplies a fresh id via `idFor`); present ⇒ update in place. */
	id?: string;
	name: string;
	quantity?: number;
	weight?: number;
	equipped?: boolean;
	attuned?: boolean;
	vaultObjectId?: string | null;
	container?: string | null;
	armor?: EquipmentArmor | null;
	notes?: string;
}

/**
 * ADD or UPDATE an equipment item (S10.1.3). An input without an `id` is a NEW item and gets a fresh
 * id from `idFor`; an input WITH an id updates that item in place, with PATCH semantics — an omitted
 * optional field preserves the item's existing value. Fail-closed on an empty name or a negative
 * quantity/weight. Pure.
 */
export function upsertEquipmentItem(
	inventory: CharacterInventory,
	input: UpsertEquipmentInput,
	idFor: () => string,
): { ok: true; inventory: CharacterInventory; item: EquipmentItem } | { ok: false; error: EquipmentError; message: string } {
	if (input.name.trim() === '') {
		return { ok: false, error: 'invalid-name', message: 'An item name is required.' };
	}
	if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity < 0)) {
		return { ok: false, error: 'invalid-quantity', message: 'Quantity must be a non-negative whole number.' };
	}
	if (input.weight !== undefined && (!Number.isFinite(input.weight) || input.weight < 0)) {
		return { ok: false, error: 'invalid-weight', message: 'Weight must be a non-negative number.' };
	}
	const id = input.id ?? idFor();
	const existing = inventory.items.find((item) => item.id === id);
	const item: EquipmentItem = {
		id,
		name: input.name.trim(),
		quantity: input.quantity ?? existing?.quantity ?? 1,
		weight: input.weight ?? existing?.weight ?? 0,
		equipped: input.equipped ?? existing?.equipped ?? false,
		attuned: input.attuned ?? existing?.attuned ?? false,
		vaultObjectId: input.vaultObjectId !== undefined ? input.vaultObjectId : existing?.vaultObjectId ?? null,
		container: input.container !== undefined ? input.container : existing?.container ?? null,
		armor: input.armor !== undefined ? (input.armor ? { ...input.armor } : null) : existing?.armor ?? null,
		notes: input.notes !== undefined ? input.notes : existing?.notes ?? '',
	};
	const items = existing
		? inventory.items.map((i) => (i.id === id ? item : i))
		: [...inventory.items, item];
	return { ok: true, inventory: { ...inventory, items }, item };
}

/** REMOVE an equipment item by id. Pure: no-op when absent. */
export function removeEquipmentItem(inventory: CharacterInventory, itemId: string): CharacterInventory {
	if (!inventory.items.some((item) => item.id === itemId)) return inventory;
	return { ...inventory, items: inventory.items.filter((item) => item.id !== itemId) };
}

/**
 * MOVE an equipment item into a different container/slot (or to loose ⇒ `null`), preserving order.
 * Fail-closed when the item does not exist. Pure.
 */
export function moveEquipmentItem(
	inventory: CharacterInventory,
	itemId: string,
	container: string | null,
): { ok: true; inventory: CharacterInventory } | { ok: false; error: EquipmentError; message: string } {
	const existing = inventory.items.find((item) => item.id === itemId);
	if (!existing) {
		return { ok: false, error: 'no-such-item', message: `No equipment item "${itemId}".` };
	}
	const items = inventory.items.map((item) =>
		item.id === itemId ? { ...item, container } : item,
	);
	return { ok: true, inventory: { ...inventory, items } };
}

// --- Derived weight / encumbrance / armor (pure, never stored) ----------------------------------

/** The total weight of all equipment items (quantity × per-unit weight), in pounds. Pure. */
export function carriedItemWeight(inventory: CharacterInventory): number {
	return inventory.items.reduce((sum, item) => sum + item.quantity * item.weight, 0);
}

/** The strength score used for carry capacity — the character's STR, defaulting to 10 when absent. */
export function effectiveStrength(character: Character): number {
	const str = character.abilityScores.str;
	return typeof str === 'number' && Number.isFinite(str) && str > 0 ? str : 10;
}

/** The encumbrance band a character is in, from lightest to heaviest. */
export type EncumbranceLevel = 'unencumbered' | 'encumbered' | 'heavily-encumbered' | 'overloaded';

/**
 * The fully-derived encumbrance read model for a character (S10.1.3 / S10.4.2 baseline). Uses the 5e
 * VARIANT encumbrance thresholds so there are graded indicators, not just a single cap:
 *
 *   - carry capacity        = STR × 15
 *   - encumbered            when carried weight > STR × 5   (speed −10)
 *   - heavily encumbered    when carried weight > STR × 10  (speed −20)
 *   - overloaded            when carried weight > STR × 15  (over capacity; cannot effectively move)
 *
 * Carried weight includes coin weight (50 coins ⇒ 1 lb). Everything is derived on read, so it can
 * never drift from the underlying items / coins / ability scores. Pure.
 */
export interface EncumbranceState {
	/** Total carried weight in pounds (items + coins). */
	carriedWeight: number;
	/** Weight contributed by equipment items. */
	itemWeight: number;
	/** Weight contributed by carried coins. */
	coinWeight: number;
	/** The strength score the thresholds are computed from. */
	strength: number;
	/** Maximum carry capacity (STR × 15). */
	carryCapacity: number;
	/** The encumbered threshold (STR × 5). */
	encumberedAt: number;
	/** The heavily-encumbered threshold (STR × 10). */
	heavilyEncumberedAt: number;
	/** The derived band. */
	level: EncumbranceLevel;
	/** The 5e speed penalty in feet for the band (0 / −10 / −20). */
	speedPenalty: number;
	/** Whether carried weight exceeds the STR × 15 capacity. */
	overCapacity: boolean;
	/** Carried weight as a fraction of capacity (0–1+), for a meter. */
	capacityRatio: number;
}

/** Classify a carried weight against a strength score into an encumbrance band. Pure. */
export function encumbranceLevelFor(carriedWeight: number, strength: number): EncumbranceLevel {
	if (carriedWeight > strength * 15) return 'overloaded';
	if (carriedWeight > strength * 10) return 'heavily-encumbered';
	if (carriedWeight > strength * 5) return 'encumbered';
	return 'unencumbered';
}

const SPEED_PENALTY: Record<EncumbranceLevel, number> = {
	unencumbered: 0,
	encumbered: -10,
	'heavily-encumbered': -20,
	overloaded: -20,
};

/** Compute the full encumbrance read model for a character. Pure. */
export function computeEncumbrance(character: Character): EncumbranceState {
	const inventory = inventoryOf(character);
	const itemWeight = carriedItemWeight(inventory);
	const coinsWeight = coinWeight(inventory.currency);
	const carriedWeight = itemWeight + coinsWeight;
	const strength = effectiveStrength(character);
	const carryCapacity = strength * 15;
	const level = encumbranceLevelFor(carriedWeight, strength);
	return {
		carriedWeight,
		itemWeight,
		coinWeight: coinsWeight,
		strength,
		carryCapacity,
		encumberedAt: strength * 5,
		heavilyEncumberedAt: strength * 10,
		level,
		speedPenalty: SPEED_PENALTY[level],
		overCapacity: carriedWeight > carryCapacity,
		capacityRatio: carryCapacity > 0 ? carriedWeight / carryCapacity : 0,
	};
}

/** The 5e ability modifier for a score (⌊(score − 10) / 2⌋; an absent score reads as 10 ⇒ +0). Pure. */
function abilityMod(score: number | undefined): number {
	const value = typeof score === 'number' && Number.isFinite(score) ? score : 10;
	return Math.floor((value - 10) / 2);
}

/**
 * The character's DERIVED armor class from EQUIPPED armor items (S10.1.3 "items marked equipped
 * contribute to AC calculation if armor type is defined"). Returns null when no equipped item carries
 * armor metadata, so the caller falls back to the manually-tracked `combat.ac` (S10.1.2). Pure.
 *
 * The highest-base body armor decides the base + DEX contribution (light adds full DEX; medium caps
 * at its `maxDexBonus`; heavy adds none); shield items add their flat `baseAc` on top. Unarmored (no
 * body armor equipped) uses the 5e 10 + DEX default before adding shields.
 */
export function derivedArmorClass(character: Character): number | null {
	const inventory = inventoryOf(character);
	const armored = inventory.items.filter((item) => item.equipped && item.armor);
	if (armored.length === 0) return null;
	const dex = abilityMod(character.abilityScores.dex);

	const body = armored.filter((item) => item.armor!.category !== 'shield');
	const shields = armored.filter((item) => item.armor!.category === 'shield');

	let base: number;
	if (body.length === 0) {
		// Only shield(s) equipped ⇒ unarmored base (10 + DEX) before shield bonus.
		base = 10 + dex;
	} else {
		// The best body armor wins (highest resulting AC), then apply its DEX rule.
		base = Math.max(
			...body.map((item) => {
				const armor = item.armor!;
				if (!armor.addDex) return armor.baseAc;
				const capped = armor.maxDexBonus === null ? dex : Math.min(dex, armor.maxDexBonus);
				return armor.baseAc + capped;
			}),
		);
	}
	const shieldBonus = shields.reduce((sum, item) => sum + item.armor!.baseAc, 0);
	return base + shieldBonus;
}
