/**
 * RC-SYS-1.1 — the SYSTEM PACKAGE model: the declarative rules vocabulary the whole interface reads.
 *
 * A `SystemPackage` describes a tabletop system's *shape* — its words, attributes, resources,
 * conditions, dice, turn order, creature fields, advancement, skills and derived values — with NO
 * behaviour attached. Everything here is primitive and JSON-serializable: no functions, no classes,
 * no closures, so a package round-trips through the durable store byte-identically and a DM-authored
 * package is exactly as capable as a built-in one.
 *
 * Anywhere a system needs arithmetic (an ability modifier, a proficiency bonus, a resource maximum)
 * it declares a FORMULA in a tiny expression grammar — `floor((score-10)/2)`, `1+ceil(level/4)` —
 * evaluated by the pure `evaluateFormula` below. The grammar has no variables it is not given, no
 * property access and no call into the host, so an untrusted package can never execute anything.
 *
 * The slice (`SystemsState`) is durable state document `systems` (schema version 1).
 */

import {
	BUILT_IN_SYSTEM_PACKAGES,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
} from '../systems';

/** The durable schema version of the `systems` state document. */
export const SYSTEMS_STATE_SCHEMA_VERSION = 1 as const;

// --- The declarative formula grammar ------------------------------------------------------------

/**
 * A declarative arithmetic expression over named numeric inputs. Supported: decimal numbers,
 * identifiers (`score`, `level`, …), `+ - * /`, unary minus, parentheses, and the functions
 * `floor`, `ceil`, `round`, `abs`, `min`, `max`. Nothing else parses.
 */
export type SystemFormula = string;

/** The named numeric inputs a formula is evaluated against. */
export type FormulaScope = Readonly<Record<string, number>>;

export type FormulaResult =
	| { ok: true; value: number }
	| { ok: false; reason: FormulaFailureReason; message: string };

export type FormulaFailureReason =
	| 'empty'
	| 'syntax'
	| 'unknown-identifier'
	| 'unknown-function'
	| 'arity'
	| 'divide-by-zero'
	| 'not-finite';

type Token =
	| { kind: 'number'; value: number }
	| { kind: 'name'; value: string }
	| { kind: 'op'; value: '+' | '-' | '*' | '/' }
	| { kind: 'punct'; value: '(' | ')' | ',' };

class FormulaError extends Error {
	constructor(
		readonly reason: FormulaFailureReason,
		message: string,
	) {
		super(message);
	}
}

interface FormulaFunction {
	arity: number;
	apply: (args: readonly number[]) => number;
}

const FORMULA_FUNCTIONS: Readonly<Record<string, FormulaFunction>> = Object.freeze({
	floor: { arity: 1, apply: (a) => Math.floor(a[0] ?? 0) },
	ceil: { arity: 1, apply: (a) => Math.ceil(a[0] ?? 0) },
	round: { arity: 1, apply: (a) => Math.round(a[0] ?? 0) },
	abs: { arity: 1, apply: (a) => Math.abs(a[0] ?? 0) },
	min: { arity: 2, apply: (a) => Math.min(a[0] ?? 0, a[1] ?? 0) },
	max: { arity: 2, apply: (a) => Math.max(a[0] ?? 0, a[1] ?? 0) },
});

/** The function names the grammar accepts, sorted. Exported so schemas and docs stay in step. */
export const FORMULA_FUNCTION_NAMES: readonly string[] = Object.freeze(
	Object.keys(FORMULA_FUNCTIONS).sort(),
);

const DIGITS = /[0-9]/;
const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;

function tokenizeFormula(source: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source.charAt(index);
		if (char === ' ' || char === '\t') {
			index += 1;
			continue;
		}
		if (char === '+' || char === '-' || char === '*' || char === '/') {
			tokens.push({ kind: 'op', value: char });
			index += 1;
			continue;
		}
		if (char === '(' || char === ')' || char === ',') {
			tokens.push({ kind: 'punct', value: char });
			index += 1;
			continue;
		}
		if (DIGITS.test(char)) {
			let end = index;
			while (end < source.length && DIGITS.test(source.charAt(end))) end += 1;
			if (source.charAt(end) === '.') {
				end += 1;
				while (end < source.length && DIGITS.test(source.charAt(end))) end += 1;
			}
			tokens.push({ kind: 'number', value: Number(source.slice(index, end)) });
			index = end;
			continue;
		}
		if (NAME_START.test(char)) {
			let end = index;
			while (end < source.length && NAME_PART.test(source.charAt(end))) end += 1;
			tokens.push({ kind: 'name', value: source.slice(index, end) });
			index = end;
			continue;
		}
		throw new FormulaError(
			'syntax',
			`Unexpected character ${JSON.stringify(char)} in the formula.`,
		);
	}
	return tokens;
}

/**
 * Recursive-descent evaluator over the token stream. Kept as a closure rather than a class so the
 * whole grammar stays one readable unit; it never touches anything outside `tokens` and `scope`.
 */
function parseFormula(tokens: readonly Token[], scope: FormulaScope): number {
	let position = 0;
	const peek = (): Token | undefined => tokens[position];

	function atPunct(value: '(' | ')' | ','): boolean {
		const token = peek();
		return token !== undefined && token.kind === 'punct' && token.value === value;
	}

	function expectPunct(value: '(' | ')' | ','): void {
		const token = peek();
		if (!token || token.kind !== 'punct' || token.value !== value) {
			throw new FormulaError('syntax', `Expected ${JSON.stringify(value)} in the formula.`);
		}
		position += 1;
	}

	function parsePrimary(): number {
		const token = peek();
		if (!token) throw new FormulaError('syntax', 'The formula ended before a value.');
		if (token.kind === 'op' && token.value === '-') {
			position += 1;
			return -parsePrimary();
		}
		if (token.kind === 'op' && token.value === '+') {
			position += 1;
			return parsePrimary();
		}
		if (token.kind === 'number') {
			position += 1;
			return token.value;
		}
		if (token.kind === 'punct' && token.value === '(') {
			position += 1;
			const value = parseSum();
			expectPunct(')');
			return value;
		}
		if (token.kind === 'name') {
			position += 1;
			if (atPunct('(')) {
				const fn = FORMULA_FUNCTIONS[token.value];
				if (!fn) {
					throw new FormulaError(
						'unknown-function',
						`The formula calls unknown function ${token.value}.`,
					);
				}
				position += 1;
				const args: number[] = [];
				if (!atPunct(')')) {
					args.push(parseSum());
					while (atPunct(',')) {
						position += 1;
						args.push(parseSum());
					}
				}
				expectPunct(')');
				if (args.length !== fn.arity) {
					throw new FormulaError(
						'arity',
						`${token.value} takes ${fn.arity} argument(s); the formula passed ${args.length}.`,
					);
				}
				return fn.apply(args);
			}
			if (!Object.prototype.hasOwnProperty.call(scope, token.value)) {
				throw new FormulaError(
					'unknown-identifier',
					`The formula reads unknown value ${token.value}.`,
				);
			}
			const value = scope[token.value];
			if (value === undefined || !Number.isFinite(value)) {
				throw new FormulaError('not-finite', `Value ${token.value} is not a finite number.`);
			}
			return value;
		}
		throw new FormulaError('syntax', 'The formula has a value in the wrong place.');
	}

	function parseProduct(): number {
		let left = parsePrimary();
		for (;;) {
			const token = peek();
			if (!token || token.kind !== 'op' || (token.value !== '*' && token.value !== '/'))
				return left;
			position += 1;
			const right = parsePrimary();
			if (token.value === '/') {
				if (right === 0) throw new FormulaError('divide-by-zero', 'The formula divides by zero.');
				left = left / right;
			} else {
				left = left * right;
			}
		}
	}

	function parseSum(): number {
		let left = parseProduct();
		for (;;) {
			const token = peek();
			if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-'))
				return left;
			position += 1;
			const right = parseProduct();
			left = token.value === '+' ? left + right : left - right;
		}
	}

	const value = parseSum();
	if (position !== tokens.length) {
		throw new FormulaError('syntax', 'The formula has trailing content.');
	}
	return value;
}

/**
 * Evaluate a declarative formula against named numeric inputs. PURE and total: every failure comes
 * back as a typed result, never a throw, so a malformed DM-authored package degrades to a stated
 * reason instead of taking down a render.
 */
export function evaluateFormula(formula: SystemFormula, scope: FormulaScope = {}): FormulaResult {
	if (typeof formula !== 'string' || formula.trim().length === 0) {
		return { ok: false, reason: 'empty', message: 'The formula is empty.' };
	}
	try {
		const value = parseFormula(tokenizeFormula(formula), scope);
		if (!Number.isFinite(value)) {
			return {
				ok: false,
				reason: 'not-finite',
				message: 'The formula did not produce a finite number.',
			};
		}
		return { ok: true, value };
	} catch (error) {
		if (error instanceof FormulaError) {
			return { ok: false, reason: error.reason, message: error.message };
		}
		return { ok: false, reason: 'syntax', message: 'The formula could not be read.' };
	}
}

/** Whether a formula parses at all, checked against a scope of zeroes for every identifier it names. */
export function isValidFormula(
	formula: SystemFormula,
	identifiers: readonly string[] = [],
): boolean {
	const scope: Record<string, number> = {};
	for (const identifier of identifiers) scope[identifier] = 0;
	const result = evaluateFormula(formula, scope);
	return result.ok || result.reason === 'divide-by-zero';
}

// --- The package shape --------------------------------------------------------------------------

/** How an attribute turns its raw score into the number the rest of the system reads. */
export type SystemAttributeDerivation =
	| { kind: 'none' }
	| { kind: 'modifier'; formula: SystemFormula };

export interface SystemAttribute {
	key: string;
	label: string;
	abbreviation: string;
	derivation: SystemAttributeDerivation;
}

/** The five shapes a trackable resource can take. */
export type SystemResourceKind = 'pool' | 'slots' | 'dice' | 'clock' | 'track';
export const SYSTEM_RESOURCE_KINDS: readonly SystemResourceKind[] = Object.freeze([
	'pool',
	'slots',
	'dice',
	'clock',
	'track',
]);

/** When a resource comes back. `never` = only an explicit award restores it. */
export type SystemRecovery = 'short' | 'long' | 'scene' | 'never';
export const SYSTEM_RECOVERIES: readonly SystemRecovery[] = Object.freeze([
	'short',
	'long',
	'scene',
	'never',
]);

export interface SystemResource {
	key: string;
	label: string;
	kind: SystemResourceKind;
	/** Declarative maximum, or null when the maximum is authored per character. */
	maxFormula: SystemFormula | null;
	recovery: SystemRecovery;
	/** Dice notation for `kind: 'dice'` resources (hit dice, superiority dice); null otherwise. */
	diceNotation: string | null;
}

export type SystemConditionSeverity = 'minor' | 'major' | 'severe' | 'boon';
export const SYSTEM_CONDITION_SEVERITIES: readonly SystemConditionSeverity[] = Object.freeze([
	'minor',
	'major',
	'severe',
	'boon',
]);

/** How long a condition lasts by default, before any per-instance override. */
export type SystemConditionDuration = 'rounds' | 'save-ends' | 'scene' | 'rest' | 'until-removed';
export const SYSTEM_CONDITION_DURATIONS: readonly SystemConditionDuration[] = Object.freeze([
	'rounds',
	'save-ends',
	'scene',
	'rest',
	'until-removed',
]);

export interface SystemCondition {
	key: string;
	label: string;
	/** Icon name from the semantic icon vocabulary (`docs/reference/ICON_VOCABULARY.md`). */
	icon: string;
	severity: SystemConditionSeverity;
	defaultDuration: SystemConditionDuration;
	/** Rounds the condition runs for when `defaultDuration` is `rounds`; null otherwise. */
	defaultRounds: number | null;
	/** Whether the condition stacks in levels (5e exhaustion); null when it does not. */
	maxStacks: number | null;
}

export type SystemDiceModel = 'd20-plus-modifier' | 'dice-pool' | '2d6-pbta' | 'custom';
export const SYSTEM_DICE_MODELS: readonly SystemDiceModel[] = Object.freeze([
	'd20-plus-modifier',
	'dice-pool',
	'2d6-pbta',
	'custom',
]);

/** What "advantage" (or its equivalent) does to a roll. */
export type SystemAdvantageSemantics =
	| 'roll-twice-take-best'
	| 'extra-die'
	| 'bonus-modifier'
	| 'none';
export const SYSTEM_ADVANTAGE_SEMANTICS: readonly SystemAdvantageSemantics[] = Object.freeze([
	'roll-twice-take-best',
	'extra-die',
	'bonus-modifier',
	'none',
]);

export type SystemCritEffect = 'double-dice' | 'max-dice' | 'extra-effect' | 'none';
export const SYSTEM_CRIT_EFFECTS: readonly SystemCritEffect[] = Object.freeze([
	'double-dice',
	'max-dice',
	'extra-effect',
	'none',
]);

export interface SystemCritRules {
	/** Natural die result at or above which a roll crits; null when the system has no crit. */
	naturalHigh: number | null;
	/** Natural die result at or below which a roll fumbles; null when the system has no fumble. */
	naturalLow: number | null;
	effect: SystemCritEffect;
}

export interface SystemDice {
	model: SystemDiceModel;
	/** The system's core roll, in dice notation (`1d20`, `2d6`, `5d6`). */
	notation: string;
	advantage: SystemAdvantageSemantics;
	/** Per-die success threshold for pool models; null for every other model. */
	successThreshold: number | null;
	crit: SystemCritRules;
}

export type SystemTurnModel =
	| { kind: 'initiative'; initiativeFormula: SystemFormula | null }
	| { kind: 'actions-per-turn'; actionsPerTurn: number }
	| { kind: 'popcorn' }
	| { kind: 'none' };

export type SystemFieldType = 'string' | 'text' | 'number' | 'boolean' | 'enum';
export const SYSTEM_FIELD_TYPES: readonly SystemFieldType[] = Object.freeze([
	'string',
	'text',
	'number',
	'boolean',
	'enum',
]);

export interface SystemCreatureField {
	key: string;
	label: string;
	type: SystemFieldType;
	required: boolean;
	/** Allowed values for `type: 'enum'`; null for every other type. */
	options: readonly string[] | null;
}

export type SystemAdvancementModel = 'xp-table' | 'milestone' | 'none';
export const SYSTEM_ADVANCEMENT_MODELS: readonly SystemAdvancementModel[] = Object.freeze([
	'xp-table',
	'milestone',
	'none',
]);

export interface SystemAdvancement {
	model: SystemAdvancementModel;
	/** Highest reachable level; null when the system has no levels. */
	levelCap: number | null;
	/** Cumulative experience needed to REACH each level, index 0 = level 1. Empty unless `xp-table`. */
	xpThresholds: readonly number[];
}

export interface SystemSkill {
	key: string;
	label: string;
	/** The attribute key this skill keys off, or null for an attribute-free system. */
	attribute: string | null;
}

/** A named number the system derives from a formula (proficiency bonus, passive scores, …). */
export interface SystemDerivedValue {
	key: string;
	label: string;
	formula: SystemFormula;
	/** The identifiers the formula reads, so a caller knows what scope to supply. */
	inputs: readonly string[];
}

/** The words the interface uses in place of its defaults. Every field is required and non-empty. */
export interface SystemVocabulary {
	/** What this system calls the person running the game ("DM", "GM", "Keeper"). */
	gameMaster: string;
	player: string;
	character: string;
	/** What this system calls a magical/special ability ("spell", "power", "move"). */
	ability: string;
	abilityPlural: string;
	/** The verb for gaining a level ("level up", "advance", "grow"). */
	levelUpVerb: string;
	levelNoun: string;
	hitPoints: string;
	session: string;
	campaign: string;
}

/**
 * A complete rules system, declaratively. Every field is primitive or a primitive collection, so a
 * package is storable, syncable, diffable and DM-authorable without any privileged code path.
 */
export interface SystemPackage {
	id: string;
	version: string;
	displayName: string;
	/** One sentence for the system picker. */
	summary: string;
	vocabulary: SystemVocabulary;
	attributes: readonly SystemAttribute[];
	resources: readonly SystemResource[];
	conditions: readonly SystemCondition[];
	dice: SystemDice;
	turnModel: SystemTurnModel;
	creatureSchema: readonly SystemCreatureField[];
	advancement: SystemAdvancement;
	skills: readonly SystemSkill[];
	derived: readonly SystemDerivedValue[];
}

/**
 * The durable `systems` state document.
 *
 * `activeWidgetPackageId` is the LEGACY BRIDGE: before SystemPackages existed the DM's chosen
 * system was recorded as `widgets.activeSystemPackageId`, an *installed widget package* id. That is
 * a different namespace from `activePackageId`, so it is carried across verbatim into its own field
 * rather than silently conflated — `widget.package.switch-system` keeps reading and writing it while
 * SYS-1.3's `system.select` governs `activePackageId`.
 */
export interface SystemsState {
	packages: Record<string, SystemPackage>;
	/** The active SystemPackage id. Always resolves in `packages`. */
	activePackageId: string;
	/** The widget package the DM selected as their system before this slice existed, or null. */
	activeWidgetPackageId: string | null;
	schemaVersion: typeof SYSTEMS_STATE_SCHEMA_VERSION;
}

// --- The built-in packages ------------------------------------------------------------------------

/**
 * RC-SYS-1.2 moved the package DATA to `../systems`. This module owns the MODEL — the types, the
 * formula grammar and the durable slice — and the packages that ship with the build live one
 * directory over, where a reader looking for "what does 5e say" finds them without wading through
 * the evaluator. They are re-exported here so every existing import path keeps resolving.
 *
 * The import edge runs one way: `state` reaches `systems` at runtime, `systems` reaches back for
 * TYPES ONLY, so neither module can be half-initialised when the other reads it.
 */
export {
	BUILT_IN_SYSTEM_PACKAGES,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
} from '../systems';

/** The package id `hydrateSystemsState` falls back to whenever nothing valid is selected. */
export const DEFAULT_SYSTEM_PACKAGE_ID: string = DND5E_SYSTEM_PACKAGE_ID;

/** The `systems` document a vault with nothing configured starts from: every built-in installed. */
export const EMPTY_SYSTEMS_STATE: SystemsState = Object.freeze({
	packages: Object.freeze(
		Object.fromEntries(BUILT_IN_SYSTEM_PACKAGES.map((pkg) => [pkg.id, pkg])),
	) as Record<string, SystemPackage>,
	activePackageId: DEFAULT_SYSTEM_PACKAGE_ID,
	activeWidgetPackageId: null,
	schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
});

/** The legacy carrier: `widgets.activeSystemPackageId` as vaults written before this slice stored it. */
export interface LegacyActiveSystemPackage {
	activeSystemPackageId?: string | null;
}

/** Deep-clone a package so callers never mutate shared state. Pure. */
export function cloneSystemPackage(pkg: SystemPackage): SystemPackage {
	return {
		...pkg,
		vocabulary: { ...pkg.vocabulary },
		attributes: pkg.attributes.map((a) => ({ ...a, derivation: { ...a.derivation } })),
		resources: pkg.resources.map((r) => ({ ...r })),
		conditions: pkg.conditions.map((c) => ({ ...c })),
		dice: { ...pkg.dice, crit: { ...pkg.dice.crit } },
		turnModel: { ...pkg.turnModel },
		creatureSchema: pkg.creatureSchema.map((f) => ({
			...f,
			options: f.options ? [...f.options] : null,
		})),
		advancement: { ...pkg.advancement, xpThresholds: [...pkg.advancement.xpThresholds] },
		skills: pkg.skills.map((s) => ({ ...s })),
		derived: pkg.derived.map((d) => ({ ...d, inputs: [...d.inputs] })),
	};
}

/**
 * Hydrate the durable `systems` document, fail-closed.
 *
 * An ABSENT slice yields the 5e default: the built-in package installed and active. A present slice
 * keeps its authored packages, but the built-in packages are always re-seeded from the build (they
 * ship with the code, not the vault) and an `activePackageId` that no longer resolves falls back to
 * the default rather than leaving the interface pointing at nothing.
 *
 * `legacy` carries `widgets.activeSystemPackageId` from a vault written before this slice existed, so
 * a DM's earlier system choice survives the move (see `SystemsState.activeWidgetPackageId`).
 */
export function hydrateSystemsState(
	state: SystemsState | undefined,
	legacy?: LegacyActiveSystemPackage,
): SystemsState {
	const packages: Record<string, SystemPackage> = {};
	for (const [id, pkg] of Object.entries(state?.packages ?? {})) {
		if (!pkg || typeof pkg !== 'object' || typeof pkg.id !== 'string') continue;
		packages[id] = cloneSystemPackage(pkg);
	}
	for (const builtIn of BUILT_IN_SYSTEM_PACKAGES) {
		packages[builtIn.id] = cloneSystemPackage(builtIn);
	}
	const requestedId = state?.activePackageId;
	const activePackageId =
		typeof requestedId === 'string' && packages[requestedId]
			? requestedId
			: DEFAULT_SYSTEM_PACKAGE_ID;
	const carried =
		typeof state?.activeWidgetPackageId === 'string' && state.activeWidgetPackageId.length > 0
			? state.activeWidgetPackageId
			: typeof legacy?.activeSystemPackageId === 'string' && legacy.activeSystemPackageId.length > 0
				? legacy.activeSystemPackageId
				: null;
	return {
		packages,
		activePackageId,
		activeWidgetPackageId: carried,
		schemaVersion: SYSTEMS_STATE_SCHEMA_VERSION,
	};
}

/** The active package, always defined (hydration guarantees `activePackageId` resolves). Pure. */
export function activeSystemPackage(state: SystemsState): SystemPackage {
	return state.packages[state.activePackageId] ?? DND5E_SYSTEM_PACKAGE;
}

/** The package with this id, or `undefined`. Pure. */
export function systemPackageById(
	state: SystemsState,
	packageId: string,
): SystemPackage | undefined {
	return state.packages[packageId];
}
