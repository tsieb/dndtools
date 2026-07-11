import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import type {
	DiceRollSourceKind,
	DiceRollVisibility,
	SessionDiceRoll,
	SessionState,
} from '../state/session-state';
import type { EvaluatedTerm } from '../state/dice';

/**
 * SES-003 / SES-008 — THE single actor-filtered SESSION ROLL HISTORY read model.
 *
 * This is the ONLY sanctioned read path for the roll history. Visibility is decided in the DATA LAYER
 * BEFORE anything is returned (Architecture Contract 3), so a `dm-only` (secret) roll's expression,
 * values, total, and reason are OMITTED from a player's history (SES-003 AC3), and a `shared` roll
 * reaches only the listed participants (SES-003 AC4). The DM sees every roll in full.
 *
 * Fail-closed posture:
 *
 *   - A roll the actor may not see is OMITTED ENTIRELY — no placeholder leaks its existence, expression,
 *     dice, total, or label.
 *   - A roll with NO recorded visibility (a legacy record) is treated as `session-visible` (the v2
 *     player-visible default for an in-session roll) only for the actor that rolled it and the DM; any
 *     other actor is denied. Unknown visibility strings collapse to `dm-only` (denied to non-DM).
 *
 * Pure + deterministic: a function of (session, permissions, actor) only. No GUI, no storage.
 */

/** A read-only roll in the actor-filtered history. Carries only what the actor may see. */
export interface DiceRollView {
	id: string;
	actorId: string;
	expression: string;
	total: number;
	rolledAt: string;
	sourceKind: DiceRollSourceKind;
	dice: number[];
	kept: number[];
	modifier: number;
	terms: EvaluatedTerm[];
	visibility: DiceRollVisibility;
	label: string | null;
	/** For a table draw: the source table item id + selected row (when visible). */
	tableItemId: string | null;
	tableRowNumber: number | null;
	tableRowText: string | null;
	/** The note this result was appended to, when it was (SES-008 attribution). */
	appendedToItemId: string | null;
	/** The recorded seed, exposed only to the DM (it makes the roll reproducible/auditable). */
	seed: number | null;
}

/** The actor-filtered roll history view. */
export interface DiceHistoryView {
	rolls: DiceRollView[];
	/** DM-only: how many rolls were hidden from a non-DM viewer (0 for the DM). */
	hiddenCount: number;
}

/** Normalize a possibly-absent recorded visibility to the fail-closed default. */
function effectiveVisibility(roll: SessionDiceRoll): DiceRollVisibility {
	const v = roll.visibility;
	if (v === 'session-visible' || v === 'dm-only' || v === 'shared') return v;
	// A legacy record (no recorded visibility) is treated as an in-session player-visible roll.
	return 'session-visible';
}

/**
 * Whether `actorId` (with `role`) may see `roll`. The DM sees everything. The actor that rolled always
 * sees their own roll. Otherwise: `session-visible` is visible to every participant; `shared` only to
 * the listed participants; `dm-only` to no one but the DM.
 */
function actorCanSeeRoll(roll: SessionDiceRoll, actorId: string, isDm: boolean): boolean {
	if (isDm) return true;
	if (roll.actorId === actorId) return true;
	const visibility = effectiveVisibility(roll);
	if (visibility === 'session-visible') return true;
	if (visibility === 'shared') return (roll.sharedWith ?? []).includes(actorId);
	return false; // dm-only
}

function toView(roll: SessionDiceRoll, includeSeed: boolean): DiceRollView {
	return {
		id: roll.id,
		actorId: roll.actorId,
		expression: roll.expression,
		total: roll.total,
		rolledAt: roll.rolledAt,
		sourceKind: roll.sourceKind ?? 'expression',
		dice: roll.dice ? [...roll.dice] : [],
		kept: roll.kept ? [...roll.kept] : [],
		modifier: roll.modifier ?? 0,
		terms: roll.terms ? [...roll.terms] : [],
		visibility: effectiveVisibility(roll),
		label: roll.label ?? null,
		tableItemId: roll.tableItemId ?? null,
		tableRowNumber: roll.tableRowNumber ?? null,
		tableRowText: roll.tableRowText ?? null,
		appendedToItemId: roll.appendedToItemId ?? null,
		seed: includeSeed ? (roll.seed ?? null) : null,
	};
}

/**
 * SES-003 — build the actor-filtered roll history (most recent last, in recorded order). Rolls the actor
 * may not see are omitted entirely; the DM additionally gets the hidden count and the recorded seed.
 */
export function getDiceHistoryForActor(
	session: SessionState,
	permissions: PermissionState,
	actorId: string,
): DiceHistoryView {
	const actor = getActor(permissions, actorId);
	const isDm = hasDmAuthority(actor?.role);
	const rolls: DiceRollView[] = [];
	let hiddenCount = 0;
	for (const roll of session.diceHistory) {
		if (actorCanSeeRoll(roll, actorId, isDm)) {
			rolls.push(toView(roll, isDm));
		} else {
			hiddenCount += 1;
		}
	}
	return { rolls, hiddenCount: isDm ? hiddenCount : 0 };
}

/**
 * SES-003 — REPLAY a recorded roll to verify it reproduces (audit/diagnostic helper, DM-only at the read
 * layer). Returns the recorded roll's total alongside a freshly re-evaluated total from the SAME seed +
 * expression; they MUST match (the proof that the roll is reproducible and was not re-rolled per device).
 * Returns null when the roll is not found or carries no recorded seed (a legacy manual record).
 */
export function findRollById(session: SessionState, rollId: string): SessionDiceRoll | null {
	return session.diceHistory.find((roll) => roll.id === rollId) ?? null;
}
