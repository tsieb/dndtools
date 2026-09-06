import type { SystemDiceModel, SystemPackage } from './system-package';
import { createRng, normalizeSeed, type SeededRng } from './prng';

/**
 * SES-003 / SES-008 — the PURE, DETERMINISTIC dice engine: an EXPRESSION PARSER (text → AST), a ROLL
 * EVALUATOR that draws from the seeded PRNG and RECORDS every individual die, and ROLLABLE-TABLE
 * resolution from a recorded draw.
 *
 * Why this shape (Architecture Contract 1 + Contract 2):
 *
 *   - The PARSER is a PURE function: the same expression text always parses to the same AST, and a
 *     MALFORMED expression is REJECTED fail-closed (a structured {@link DiceParseError}) — never
 *     silently evaluated. No `eval`, no ambient state.
 *   - The EVALUATOR is deterministic FROM A SEED. It threads the seeded PRNG (`state/prng.ts`,
 *     mulberry32 — the SAME generator MAP-004 uses) and records each die face it draws, the kept/dropped
 *     set, the modifier, and the total. Because the random OUTCOME is computed ONCE from a recorded seed
 *     and stored, the roll is REPRODUCIBLE: replaying the recorded seed + expression yields the IDENTICAL
 *     result on every device and every render (Contract 2 sync invariant). The result is NEVER re-rolled
 *     per device.
 *   - ROLLABLE TABLES resolve by drawing the table's own dice expression and mapping the total onto the
 *     declared rows; the draw is recorded the same way, so the selected row is reproducible.
 *
 * Everything here is pure data + pure functions. No GUI, no storage, no clock, no `Math.random`.
 */

export const DICE_SCHEMA_VERSION = 1 as const;

/** The maximum dice COUNT and SIDES a single term may declare. Guards against pathological expressions. */
export const MAX_DICE_COUNT = 100 as const;
export const MAX_DICE_SIDES = 1000 as const;
/** The maximum length of an expression string accepted by the parser (fail-closed bound). */
export const MAX_EXPRESSION_LENGTH = 200 as const;

// --- The AST (deterministic parse target) --------------------------------------------------------

/**
 * A keep policy on a dice term: keep the N HIGHEST (`kh`) or N LOWEST (`kl`) of the rolled dice. Drives
 * advantage (`2d20kh1`) and disadvantage (`2d20kl1`). `null` keeps every die.
 */
export interface DiceKeep {
	kind: 'highest' | 'lowest';
	count: number;
}

/** One dice term: `count`d`sides` with an optional keep policy (e.g. `2d20kh1`). */
export interface DiceTerm {
	kind: 'dice';
	count: number;
	sides: number;
	keep: DiceKeep | null;
	/** Sign applied to this term's contribution (+1 / -1). */
	sign: 1 | -1;
}

/** A flat numeric modifier term (e.g. `+5`). */
export interface ConstantTerm {
	kind: 'constant';
	value: number;
	sign: 1 | -1;
}

export type DiceExpressionTerm = DiceTerm | ConstantTerm;

/**
 * A parsed dice expression: an ordered list of terms summed into a total. Pure value; the canonical
 * `source` is the normalized text the parser accepted (whitespace-stripped, lower-cased), so the same
 * logical expression always carries the same canonical form for storage/comparison.
 */
export interface DiceExpression {
	terms: DiceExpressionTerm[];
	/** The canonical normalized expression text. */
	source: string;
	schemaVersion: typeof DICE_SCHEMA_VERSION;
}

/** A structured parse failure (fail-closed). Never thrown for control flow; returned and surfaced. */
export interface DiceParseError {
	code:
		| 'empty'
		| 'too-long'
		| 'syntax'
		| 'dice-count-out-of-range'
		| 'dice-sides-out-of-range'
		| 'keep-out-of-range';
	message: string;
}

export type DiceParseResult =
	| { ok: true; expression: DiceExpression }
	| { ok: false; error: DiceParseError };

// --- The PURE parser (text → AST) ----------------------------------------------------------------

/**
 * One token in an expression. A dice term token matches `NdM`, an optional keep suffix (`kh`/`kl` + N),
 * or a constant. The grammar is intentionally tiny and fully deterministic.
 */
const TERM_PATTERN = /^(\d*)d(\d+)(?:(kh|kl)(\d*))?$/;
const CONSTANT_PATTERN = /^\d+$/;

/**
 * Parse a dice expression string into a deterministic AST (SES-003). PURE: the same input always yields
 * the same result. Supports dice terms (`NdM`), keep-highest/lowest for advantage/disadvantage
 * (`2d20kh1`, `2d20kl1`), implicit single-die count (`d20` ⇒ `1d20`), flat modifiers, and `+`/`-`
 * between terms. A MALFORMED expression returns a structured error and is NEVER evaluated.
 */
export function parseDiceExpression(input: string): DiceParseResult {
	const raw = String(input ?? '');
	if (raw.length > MAX_EXPRESSION_LENGTH) {
		return { ok: false, error: { code: 'too-long', message: 'The expression is too long.' } };
	}
	// Normalize: strip ALL whitespace, lower-case. The canonical form is built from the parsed terms.
	const normalized = raw.replace(/\s+/g, '').toLowerCase();
	if (normalized === '') {
		return { ok: false, error: { code: 'empty', message: 'The expression is empty.' } };
	}

	// Split into signed chunks. A leading sign is allowed; operators must separate terms.
	const chunks: Array<{ sign: 1 | -1; text: string }> = [];
	let sign: 1 | -1 = 1;
	let cursor = 0;
	// A term begins either at the start or right after an operator. Walk the string accumulating a term
	// until the next operator. This rejects doubled operators and trailing operators fail-closed.
	let expectTerm = true;
	let buffer = '';
	const flush = (): DiceParseError | null => {
		if (buffer === '') {
			return { code: 'syntax', message: 'Expected a dice term or number.' };
		}
		chunks.push({ sign, text: buffer });
		buffer = '';
		return null;
	};
	while (cursor < normalized.length) {
		const ch = normalized[cursor] as string;
		if (ch === '+' || ch === '-') {
			if (expectTerm) {
				// A leading sign on the very first term, or a sign with no preceding term ⇒ syntax error
				// unless it is the very first character (a unary sign on the first term).
				if (chunks.length === 0 && buffer === '') {
					sign = ch === '-' ? -1 : 1;
					cursor += 1;
					expectTerm = true;
					continue;
				}
				return { ok: false, error: { code: 'syntax', message: 'Unexpected operator.' } };
			}
			const err = flush();
			if (err) return { ok: false, error: err };
			sign = ch === '-' ? -1 : 1;
			expectTerm = true;
			cursor += 1;
			continue;
		}
		buffer += ch;
		expectTerm = false;
		cursor += 1;
	}
	if (expectTerm && buffer === '') {
		return {
			ok: false,
			error: { code: 'syntax', message: 'The expression ends with an operator.' },
		};
	}
	const err = flush();
	if (err) return { ok: false, error: err };

	const terms: DiceExpressionTerm[] = [];
	for (const chunk of chunks) {
		const diceMatch = TERM_PATTERN.exec(chunk.text);
		if (diceMatch) {
			const count = diceMatch[1] === '' ? 1 : Number.parseInt(diceMatch[1] as string, 10);
			const sides = Number.parseInt(diceMatch[2] as string, 10);
			if (count < 1 || count > MAX_DICE_COUNT) {
				return {
					ok: false,
					error: {
						code: 'dice-count-out-of-range',
						message: `Dice count must be between 1 and ${MAX_DICE_COUNT}.`,
					},
				};
			}
			if (sides < 1 || sides > MAX_DICE_SIDES) {
				return {
					ok: false,
					error: {
						code: 'dice-sides-out-of-range',
						message: `Dice sides must be between 1 and ${MAX_DICE_SIDES}.`,
					},
				};
			}
			let keep: DiceKeep | null = null;
			if (diceMatch[3]) {
				const keepCount = diceMatch[4] === '' ? 1 : Number.parseInt(diceMatch[4] as string, 10);
				if (keepCount < 1 || keepCount > count) {
					return {
						ok: false,
						error: {
							code: 'keep-out-of-range',
							message: `Keep count must be between 1 and the dice count (${count}).`,
						},
					};
				}
				keep = { kind: diceMatch[3] === 'kh' ? 'highest' : 'lowest', count: keepCount };
			}
			terms.push({ kind: 'dice', count, sides, keep, sign: chunk.sign });
			continue;
		}
		if (CONSTANT_PATTERN.test(chunk.text)) {
			terms.push({ kind: 'constant', value: Number.parseInt(chunk.text, 10), sign: chunk.sign });
			continue;
		}
		return {
			ok: false,
			error: { code: 'syntax', message: `Cannot parse term "${chunk.text}".` },
		};
	}

	return {
		ok: true,
		expression: { terms, source: canonicalSource(terms), schemaVersion: DICE_SCHEMA_VERSION },
	};
}

/** Render a term's keep suffix back to canonical text. */
function keepSuffix(keep: DiceKeep | null): string {
	if (!keep) return '';
	return `${keep.kind === 'highest' ? 'kh' : 'kl'}${keep.count}`;
}

/** Build the canonical normalized expression text from parsed terms. Pure. */
export function canonicalSource(terms: readonly DiceExpressionTerm[]): string {
	let out = '';
	terms.forEach((term, index) => {
		const op = term.sign < 0 ? '-' : index === 0 ? '' : '+';
		const body =
			term.kind === 'dice'
				? `${term.count}d${term.sides}${keepSuffix(term.keep)}`
				: String(term.value);
		out += `${op}${body}`;
	});
	return out;
}

// --- Advantage / disadvantage expression transform (UX-SES-010) ----------------------------------

/** The 3-state advantage selector the Dice Tools panel exposes (UX-SES-010 §2). */
export type DiceAdvantageMode = 'normal' | 'advantage' | 'disadvantage';

/** The result of {@link applyAdvantageToExpression}: the (possibly rewritten) expression text plus
 * whether the advantage/disadvantage semantics were actually applied. `applied: false` with a non-
 * normal mode means the expression is not a single plain d20 term — the GUI clarifies that advantage
 * applies to d20 rolls and the expression is rolled unchanged (UX-SES-010 spec). */
export interface AdvantageTransformResult {
	expression: string;
	applied: boolean;
}

/**
 * UX-SES-010 — apply the Advantage/Disadvantage selector to a dice expression. PURE.
 *
 * A "d20-only" expression — exactly one positive dice term that is a single plain `1d20` (no keep
 * policy), with any flat modifiers — is rewritten to `2d20kh1` (advantage) / `2d20kl1` (disadvantage)
 * semantics, preserving the modifiers: `d20+5` + advantage ⇒ `2d20kh1+5`. Any other expression
 * (multiple dice terms, non-d20 dice, an existing keep policy, a subtracted die) is returned
 * UNCHANGED with `applied: false`, so the caller can surface the "use kh1 notation" hint instead of
 * silently changing semantics. A malformed expression is also returned unchanged (the roll command's
 * parser rejects it fail-closed with the real error).
 */
export function applyAdvantageToExpression(
	input: string,
	mode: DiceAdvantageMode,
): AdvantageTransformResult {
	if (mode === 'normal') return { expression: input, applied: false };
	const parsed = parseDiceExpression(input);
	if (!parsed.ok) return { expression: input, applied: false };
	const diceTerms = parsed.expression.terms.filter((term) => term.kind === 'dice');
	const target = diceTerms[0];
	if (
		diceTerms.length !== 1 ||
		!target ||
		target.sides !== 20 ||
		target.count !== 1 ||
		target.keep !== null ||
		target.sign !== 1
	) {
		return { expression: input, applied: false };
	}
	const keep: DiceKeep = { kind: mode === 'advantage' ? 'highest' : 'lowest', count: 1 };
	const terms = parsed.expression.terms.map((term) =>
		term === target ? { ...term, count: 2, keep } : term,
	);
	return { expression: canonicalSource(terms), applied: true };
}

// --- The PURE, recorded roll evaluator -----------------------------------------------------------

/** One rolled die face within a term's evaluation, with whether it was KEPT in the total. */
export interface RolledDie {
	/** The die's face value (1..sides). */
	value: number;
	/** Whether this die was kept (true) or dropped by a keep policy (false). */
	kept: boolean;
}

/** The recorded evaluation of one dice term: its rolled dice, kept set, and signed contribution. */
export interface EvaluatedDiceTerm {
	kind: 'dice';
	count: number;
	sides: number;
	keep: DiceKeep | null;
	sign: 1 | -1;
	dice: RolledDie[];
	/** The values kept toward the total, in roll order. */
	kept: number[];
	/** This term's signed contribution to the total. */
	subtotal: number;
}

export interface EvaluatedConstantTerm {
	kind: 'constant';
	value: number;
	sign: 1 | -1;
	subtotal: number;
}

export type EvaluatedTerm = EvaluatedDiceTerm | EvaluatedConstantTerm;

/**
 * The complete RECORDED result of rolling an expression (SES-003). It is the durable, reproducible
 * artifact: the canonical expression, the SEED used, every rolled die with its kept flag, the modifier
 * total, and the grand total. Because the seed + expression are recorded, {@link evaluateRoll} replays
 * to the IDENTICAL value.
 */
export interface DiceRollResult {
	expression: string;
	/** The 32-bit normalized seed the dice were drawn from. Recording it makes the roll reproducible. */
	seed: number;
	terms: EvaluatedTerm[];
	/** The kept dice values across all dice terms, in order (the "dice" the requirement records). */
	dice: number[];
	/** The kept values that actually counted toward the total (after keep policy). */
	kept: number[];
	/** The sum of all flat modifier terms (signed). */
	modifier: number;
	/** The grand total. */
	total: number;
	schemaVersion: typeof DICE_SCHEMA_VERSION;
}

/**
 * Evaluate a parsed expression deterministically from a SEED, recording every die (SES-003). PURE: the
 * same (expression, seed) always yields the same result. The seed is normalized to a 32-bit int and a
 * single seeded cursor (`state/prng.ts`) is threaded across all dice in declaration order, so the draw
 * order is part of the determinism contract. Keep policies (`kh`/`kl`) select the kept dice AFTER all of
 * a term's dice are rolled, so a re-evaluation never changes which dice were rolled.
 */
export function evaluateRoll(expression: DiceExpression, seed: number | string): DiceRollResult {
	const normalizedSeed = normalizeSeed(seed);
	const rng: SeededRng = createRng(normalizedSeed);
	const terms: EvaluatedTerm[] = [];
	const allKeptDice: number[] = [];
	let modifier = 0;
	let total = 0;

	for (const term of expression.terms) {
		if (term.kind === 'constant') {
			const subtotal = term.sign * term.value;
			total += subtotal;
			modifier += subtotal;
			terms.push({ kind: 'constant', value: term.value, sign: term.sign, subtotal });
			continue;
		}
		// Roll every die in declaration order.
		const rolled: number[] = [];
		for (let i = 0; i < term.count; i += 1) {
			rolled.push(rng.nextInt(1, term.sides));
		}
		// Resolve the keep policy: select the indices that count toward the total.
		const keptIndices = resolveKeptIndices(rolled, term.keep);
		const keptSet = new Set(keptIndices);
		const dice: RolledDie[] = rolled.map((value, index) => ({ value, kept: keptSet.has(index) }));
		const kept = keptIndices.map((index) => rolled[index] as number);
		const keptSum = kept.reduce((sum, value) => sum + value, 0);
		const subtotal = term.sign * keptSum;
		total += subtotal;
		for (const value of kept) allKeptDice.push(value);
		terms.push({
			kind: 'dice',
			count: term.count,
			sides: term.sides,
			keep: term.keep,
			sign: term.sign,
			dice,
			kept,
			subtotal,
		});
	}

	return {
		expression: expression.source,
		seed: normalizedSeed,
		terms,
		dice: allKeptDice,
		kept: allKeptDice,
		modifier,
		total,
		schemaVersion: DICE_SCHEMA_VERSION,
	};
}

/**
 * Resolve which die INDICES are kept for a keep policy. With no policy every die is kept (original
 * order). For `kh`/`kl`, sort a copy by value and select the highest/lowest `count`, then return the
 * selected ORIGINAL indices in original order (stable). Pure.
 */
function resolveKeptIndices(rolled: readonly number[], keep: DiceKeep | null): number[] {
	if (!keep) return rolled.map((_value, index) => index);
	const indexed = rolled.map((value, index) => ({ value, index }));
	// Deterministic sort: by value, tie-broken by index, so equal faces keep a stable selection.
	indexed.sort((a, b) =>
		keep.kind === 'highest'
			? b.value - a.value || a.index - b.index
			: a.value - b.value || a.index - b.index,
	);
	const selected = indexed.slice(0, keep.count).map((entry) => entry.index);
	return selected.sort((a, b) => a - b);
}

/**
 * Parse AND evaluate in one step (the common command path). Returns the parse error fail-closed when the
 * expression is malformed — the roll is NEVER produced for an invalid expression. Pure.
 */
export function rollExpression(
	input: string,
	seed: number | string,
): { ok: true; result: DiceRollResult } | { ok: false; error: DiceParseError } {
	const parsed = parseDiceExpression(input);
	if (!parsed.ok) return { ok: false, error: parsed.error };
	return { ok: true, result: evaluateRoll(parsed.expression, seed) };
}

// --- SES-008 — rollable-table resolution from a recorded draw ------------------------------------

/** One resolved table draw: the recorded dice roll + the selected row (by 1-based row number). */
export interface TableDrawResult {
	roll: DiceRollResult;
	/** The 1-based row number the total mapped to (clamped into [1, rowCount]). */
	rowNumber: number;
	/** The selected row's text. */
	rowText: string;
	/** How many rows the table declared. */
	rowCount: number;
}

/**
 * Resolve a rollable table from a recorded draw (SES-008). The table is the declared `dice-table` Vault
 * Object shape: a `dice` expression + ordered `entries`. We roll the expression deterministically from
 * the seed, then map the total onto the rows: row N corresponds to total N (1-based), CLAMPED into the
 * row range so an out-of-band total can never select a missing row (fail-closed). Pure + deterministic:
 * the same (table, seed) always selects the same row, so every participant sees the same result.
 */
export function resolveTableDraw(
	dice: string,
	entries: readonly string[],
	seed: number | string,
):
	| { ok: true; result: TableDrawResult }
	| { ok: false; error: DiceParseError | { code: 'empty-table'; message: string } } {
	if (entries.length === 0) {
		return { ok: false, error: { code: 'empty-table', message: 'The table has no rows.' } };
	}
	const rolled = rollExpression(dice, seed);
	if (!rolled.ok) return { ok: false, error: rolled.error };
	const rowCount = entries.length;
	// Map the total onto a 1-based row, clamped into [1, rowCount].
	const rowNumber = Math.min(rowCount, Math.max(1, rolled.result.total));
	return {
		ok: true,
		result: {
			roll: rolled.result,
			rowNumber,
			rowText: entries[rowNumber - 1] as string,
			rowCount,
		},
	};
}

// --- Macros (named expressions) ------------------------------------------------------------------

/** A named macro: a label + a dice expression. Macros are pure aliases resolved before rolling. */
export interface DiceMacro {
	name: string;
	expression: string;
}

/**
 * Resolve a macro reference (`@name` or a bare name) against a macro table, returning the underlying
 * expression text. Returns null when the name is unknown (the caller fails closed). Pure: macro
 * resolution never reaches storage — the macro table is supplied. Lookups are case-insensitive on a
 * whitespace-trimmed name.
 */
export function resolveMacro(reference: string, macros: readonly DiceMacro[]): string | null {
	const name = reference.trim().replace(/^@/, '').toLowerCase();
	const macro = macros.find((entry) => entry.name.trim().toLowerCase() === name);
	return macro ? macro.expression : null;
}

// ── RC-SYS-2.4 — the DICE MODEL comes from the active system package ─────────────────────────────

/**
 * RC-SYS-2.4 — how a recorded roll READS under the active system package.
 *
 * The engine above is model-agnostic on purpose: it rolls dice and records faces, which is true in
 * every system. What a system *makes of* those faces is not — d20 sums them against a target, a pool
 * counts how many beat a threshold, a 2d6 system reads a tier. That interpretation belongs to the
 * package, so this section turns a {@link DiceRollResult} plus a {@link SystemPackage} into the one
 * readout a screen needs, and no screen carries a 5e-shaped assumption about what a roll means.
 *
 * Nothing here re-rolls or re-seeds: it is a pure read over an already-recorded draw, so a roll made
 * under one package still reads honestly if the campaign later switches to another.
 */

/** One die in a readout: its face, and whether the package counts it as a success (pool models). */
export interface SystemRollDie {
	value: number;
	/** True/false under a pool model; `null` when the package's model has no per-die success. */
	success: boolean | null;
}

/** The PbtA-style outcome bands a 2d6 system reads off its total. */
export type SystemRollTier = 'miss' | 'partial' | 'strong';

/** A recorded roll, read through the active package's dice model. Pure value. */
export interface SystemRollReadout {
	model: SystemDiceModel;
	/** The number the readout leads with. */
	headline: number;
	/** What {@link headline} counts: the summed total, or successes in a pool. */
	headlineKind: 'total' | 'successes';
	/** The kept dice with their per-die success flag. */
	dice: readonly SystemRollDie[];
	/** The package's per-die success threshold, or null when the model has none. */
	successThreshold: number | null;
	/** The flat modifier sum, carried through so a pool readout can still show a bonus. */
	modifier: number;
	/** The summed total, always available even when the headline is a success count. */
	total: number;
	/** Crit/fumble as `pkg.dice.crit` defines it, or null when nothing qualified. */
	crit: 'success' | 'fail' | null;
	/** The outcome tier for a `2d6-pbta` package, or null for every other model. */
	tier: SystemRollTier | null;
}

/**
 * The natural face a crit is judged on: the highest-sided dice term's kept dice. A crit is a
 * property of the SYSTEM'S CORE DIE, not of the sum, so a `1d20+2d6` damage-and-attack expression
 * still crits off the d20. With no dice at all (a flat expression) there is no natural face.
 */
function naturalFaces(result: DiceRollResult): number[] {
	let widest = 0;
	for (const term of result.terms) {
		if (term.kind === 'dice' && term.sides > widest) widest = term.sides;
	}
	if (widest === 0) return [];
	const faces: number[] = [];
	for (const term of result.terms) {
		if (term.kind === 'dice' && term.sides === widest) faces.push(...term.kept);
	}
	return faces;
}

/** Every kept die across the roll, in roll order. Pure. */
function keptFaces(result: DiceRollResult): number[] {
	const faces: number[] = [];
	for (const term of result.terms) {
		if (term.kind === 'dice') faces.push(...term.kept);
	}
	return faces;
}

/**
 * Read a recorded roll under a system package (RC-SYS-2.4). PURE — the same (package, result)
 * always reads the same way.
 *
 *   - `d20-plus-modifier` / `custom` lead with the TOTAL.
 *   - `dice-pool` leads with the count of kept dice at or above `successThreshold`; each die carries
 *     its own success flag so the interface can mark them individually rather than colour a number.
 *   - `2d6-pbta` leads with the total and reads a TIER off the package's own crit rules:
 *     `naturalHigh` is the floor of a strong hit and `naturalLow` the ceiling of a miss, with the
 *     band between them a partial. The schema declares no separate tier fields, and inventing
 *     6/7-9/10+ in core would hard-code one game's numbers into every package — so the tier is read
 *     from what the package actually says, and a package that declares neither bound gets no tier.
 *     A tiered package reports NO crit: its bounds are already spoken for by the tier.
 *
 * Crit is judged on the package's own `naturalHigh`/`naturalLow` against the widest die's natural
 * faces; a package that declares neither never crits, which is exactly how a system with no crit
 * rule should behave.
 */
export function readRollUnderSystem(pkg: SystemPackage, result: DiceRollResult): SystemRollReadout {
	const model = pkg.dice.model;
	const threshold = model === 'dice-pool' ? pkg.dice.successThreshold : null;
	const faces = keptFaces(result);
	const dice: SystemRollDie[] = faces.map((value) => ({
		value,
		success: threshold === null ? null : value >= threshold,
	}));
	const successCount = dice.reduce((count, die) => count + (die.success === true ? 1 : 0), 0);

	const { naturalHigh, naturalLow } = pkg.dice.crit;
	const tiered = model === '2d6-pbta' && (naturalHigh !== null || naturalLow !== null);

	// Under a tiered model the crit bounds describe the TOTAL's bands, so they are read as a tier and
	// NOT also as a natural crit — one set of numbers means one thing, and reporting a "fumble"
	// alongside a miss would be the same fact said twice in two vocabularies.
	let crit: 'success' | 'fail' | null = null;
	if (!tiered) {
		const naturals = naturalFaces(result);
		if (naturalHigh !== null && naturals.some((face) => face >= naturalHigh)) crit = 'success';
		else if (naturalLow !== null && naturals.some((face) => face <= naturalLow)) crit = 'fail';
	}

	let tier: SystemRollTier | null = null;
	if (tiered) {
		if (naturalHigh !== null && result.total >= naturalHigh) tier = 'strong';
		else if (naturalLow !== null && result.total <= naturalLow) tier = 'miss';
		else tier = 'partial';
	}

	return {
		model,
		headline: threshold === null ? result.total : successCount,
		headlineKind: threshold === null ? 'total' : 'successes',
		dice,
		successThreshold: threshold,
		modifier: result.modifier,
		total: result.total,
		crit,
		tier,
	};
}

/** Why {@link applySystemAdvantage} did or did not rewrite the expression. */
export type SystemAdvantageReason =
	| 'applied'
	| 'normal'
	| 'no-advantage'
	| 'bonus-size-not-declared'
	| 'expression-not-core-roll';

/** The result of applying a package's advantage semantics to an expression. */
export interface SystemAdvantageResult {
	expression: string;
	applied: boolean;
	reason: SystemAdvantageReason;
}

/** The single dice term an advantage transform can act on, or null when the expression has no
 * unique, un-kept, positive dice term to rewrite. Pure. */
function soleDiceTerm(terms: readonly DiceExpressionTerm[]): DiceTerm | null {
	const diceTerms = terms.filter((term): term is DiceTerm => term.kind === 'dice');
	const target = diceTerms[0];
	if (diceTerms.length !== 1 || !target || target.keep !== null || target.sign !== 1) return null;
	return target;
}

/**
 * RC-SYS-2.4 — apply the ACTIVE PACKAGE's advantage semantics to a dice expression. PURE.
 *
 * `applyAdvantageToExpression` above hard-codes 5e: one d20, rolled twice, keep the best. That is
 * one system's answer. Here the package decides:
 *
 *   - `roll-twice-take-best` doubles the core die and keeps the highest (lowest for disadvantage) —
 *     `1d20+5` ⇒ `2d20kh1+5`, and a package whose core die is a d100 gets `2d100kh1`.
 *   - `extra-die` adds a die to the pool (advantage) or removes one, never below one (disadvantage) —
 *     the Generic package's `5d6` ⇒ `6d6`.
 *   - `bonus-modifier` is refused: the package declares the SEMANTICS but not the SIZE of the bonus,
 *     and core will not invent a number and present it as the system's rule. The caller gets
 *     `bonus-size-not-declared` and can say so plainly instead of silently rolling something else.
 *   - `none` is refused as `no-advantage` — a system without advantage does not get one by accident.
 *
 * A refusal always returns the expression UNCHANGED, so a caller that ignores `applied` still rolls
 * exactly what the participant typed. A malformed expression is likewise returned unchanged; the
 * roll command's parser rejects it fail-closed with the real error.
 */
export function applySystemAdvantage(
	pkg: SystemPackage,
	input: string,
	mode: DiceAdvantageMode,
): SystemAdvantageResult {
	if (mode === 'normal') return { expression: input, applied: false, reason: 'normal' };
	const semantics = pkg.dice.advantage;
	if (semantics === 'none') {
		return { expression: input, applied: false, reason: 'no-advantage' };
	}
	if (semantics === 'bonus-modifier') {
		return { expression: input, applied: false, reason: 'bonus-size-not-declared' };
	}
	const parsed = parseDiceExpression(input);
	if (!parsed.ok) {
		return { expression: input, applied: false, reason: 'expression-not-core-roll' };
	}
	const target = soleDiceTerm(parsed.expression.terms);
	if (!target) {
		return { expression: input, applied: false, reason: 'expression-not-core-roll' };
	}
	let replacement: DiceTerm;
	if (semantics === 'roll-twice-take-best') {
		// The transform is defined on the system's CORE roll: a single die of the package's own size.
		const core = parseDiceExpression(pkg.dice.notation);
		const coreTerm = core.ok ? soleDiceTerm(core.expression.terms) : null;
		if (!coreTerm || target.count !== 1 || target.sides !== coreTerm.sides) {
			return { expression: input, applied: false, reason: 'expression-not-core-roll' };
		}
		replacement = {
			...target,
			count: 2,
			keep: { kind: mode === 'advantage' ? 'highest' : 'lowest', count: 1 },
		};
	} else {
		const count = mode === 'advantage' ? target.count + 1 : Math.max(1, target.count - 1);
		if (count > MAX_DICE_COUNT) {
			return { expression: input, applied: false, reason: 'expression-not-core-roll' };
		}
		replacement = { ...target, count };
	}
	const terms = parsed.expression.terms.map((term) => (term === target ? replacement : term));
	return { expression: canonicalSource(terms), applied: true, reason: 'applied' };
}
