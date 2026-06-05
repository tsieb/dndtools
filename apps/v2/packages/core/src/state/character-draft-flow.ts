import type { CharacterDraft } from './character-state';
import { draftStepValues } from './character-state';

/**
 * CHAR-002 — the GUIDED, STRUCTURED PC-creation flow: rules, options, per-step VALIDATION, and a
 * completeness report. All PURE Processing-Core policy (Contract 1): the GUI renders these steps and
 * the computed validation/completeness; it does not author the rules. Validation is deterministic so
 * the same draft always reports the same issues, and progress is RESUMABLE — a draft persists its
 * step values (`character-state.ts`) and this module recomputes validity from them on resume so
 * "completed steps and unresolved validation issues are restored" (CHAR-002 AC2).
 *
 * The rule set is intentionally a SMALL, self-contained prototype rule system, not a full 5e engine:
 * an identity step, an ability-scores step with a point-budget rule, and a class/options step. Later
 * CHAR epics (leveling, inventory) extend the flow by adding steps and rules here without reshaping
 * the draft document.
 */

export type CharacterDraftStepId = 'identity' | 'abilities' | 'class';

/** A selectable option presented for a step field (CHAR-002 "options"). */
export interface DraftStepOption {
	value: string;
	label: string;
}

/** A declared field within a step, with its allowed options when it is a choice field. */
export interface DraftStepField {
	id: string;
	label: string;
	kind: 'text' | 'choice' | 'number';
	required: boolean;
	options?: DraftStepOption[];
}

/** A step definition in the guided flow: id, order, human title, and its declared fields. */
export interface DraftStepDefinition {
	id: CharacterDraftStepId;
	order: number;
	title: string;
	description: string;
	fields: DraftStepField[];
}

/** The allowed class options for the prototype flow (CHAR-002 options). */
export const DRAFT_CLASS_OPTIONS: readonly DraftStepOption[] = Object.freeze([
	{ value: 'fighter', label: 'Fighter' },
	{ value: 'wizard', label: 'Wizard' },
	{ value: 'rogue', label: 'Rogue' },
	{ value: 'cleric', label: 'Cleric' },
]);

export const DRAFT_BACKGROUND_OPTIONS: readonly DraftStepOption[] = Object.freeze([
	{ value: 'acolyte', label: 'Acolyte' },
	{ value: 'criminal', label: 'Criminal' },
	{ value: 'folk-hero', label: 'Folk Hero' },
	{ value: 'sage', label: 'Sage' },
]);

/** The six ability ids in canonical order. */
export const ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

/** Prototype point-buy rule bounds (CHAR-002 rules). Each score is bounded; the total is budgeted. */
export const ABILITY_MIN = 8 as const;
export const ABILITY_MAX = 15 as const;
export const ABILITY_POINT_BUDGET = 27 as const;

/**
 * Point-buy cost table (5e-style): the marginal cost of each score above the 8 floor. This is the
 * "rule" the abilities step validates against, kept as data so it is auditable and extensible.
 */
const POINT_BUY_COST: Readonly<Record<number, number>> = Object.freeze({
	8: 0,
	9: 1,
	10: 2,
	11: 3,
	12: 4,
	13: 5,
	14: 7,
	15: 9,
});

/** The ordered step definitions for the guided flow. The single source of truth for the GUI. */
export const DRAFT_STEPS: readonly DraftStepDefinition[] = Object.freeze([
	{
		id: 'identity',
		order: 0,
		title: 'Identity',
		description: 'Name your character and choose a background.',
		fields: [
			{ id: 'name', label: 'Name', kind: 'text', required: true },
			{
				id: 'background',
				label: 'Background',
				kind: 'choice',
				required: true,
				options: [...DRAFT_BACKGROUND_OPTIONS],
			},
		],
	},
	{
		id: 'abilities',
		order: 1,
		title: 'Ability scores',
		description: `Assign ability scores using point buy (${ABILITY_POINT_BUDGET} points, each ${ABILITY_MIN}–${ABILITY_MAX}).`,
		fields: ABILITY_IDS.map((ability) => ({
			id: ability,
			label: ability.toUpperCase(),
			kind: 'number' as const,
			required: true,
		})),
	},
	{
		id: 'class',
		order: 2,
		title: 'Class',
		description: 'Choose your class.',
		fields: [
			{
				id: 'class',
				label: 'Class',
				kind: 'choice',
				required: true,
				options: [...DRAFT_CLASS_OPTIONS],
			},
		],
	},
]);

export function getDraftStep(stepId: string): DraftStepDefinition | undefined {
	return DRAFT_STEPS.find((step) => step.id === stepId);
}

/** A validation issue for one step field, or a step-level rule. Path is `step.field` or `step`. */
export interface DraftValidationIssue {
	stepId: CharacterDraftStepId;
	/** The field id the issue concerns, or null for a step-level rule (e.g. point budget). */
	fieldId: string | null;
	message: string;
}

/** The validation result for a single step: valid when it has no issues. */
export interface DraftStepValidation {
	stepId: CharacterDraftStepId;
	valid: boolean;
	issues: DraftValidationIssue[];
}

function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function asText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** The point-buy cost of one score, or `null` when the score is out of the legal range. */
export function pointBuyCost(score: number): number | null {
	return POINT_BUY_COST[score] ?? null;
}

/**
 * Validate ONE step's saved values against its declared fields and rules (CHAR-002 rules/validation).
 * Pure and deterministic. Missing/invalid required fields and the abilities point-budget rule are
 * reported as typed issues; an empty issue list means the step is valid.
 */
export function validateDraftStep(
	stepId: string,
	values: Record<string, unknown>,
): DraftStepValidation {
	const step = getDraftStep(stepId);
	if (!step) {
		return {
			stepId: stepId as CharacterDraftStepId,
			valid: false,
			issues: [{ stepId: stepId as CharacterDraftStepId, fieldId: null, message: 'Unknown step.' }],
		};
	}
	const issues: DraftValidationIssue[] = [];

	for (const field of step.fields) {
		const raw = values[field.id];
		if (field.kind === 'number') {
			const num = asNumber(raw);
			if (num === null) {
				if (field.required) {
					issues.push({ stepId: step.id, fieldId: field.id, message: `${field.label} is required.` });
				}
				continue;
			}
			if (step.id === 'abilities' && (num < ABILITY_MIN || num > ABILITY_MAX)) {
				issues.push({
					stepId: step.id,
					fieldId: field.id,
					message: `${field.label} must be between ${ABILITY_MIN} and ${ABILITY_MAX}.`,
				});
			}
		} else if (field.kind === 'choice') {
			const text = asText(raw);
			if (!text) {
				if (field.required) {
					issues.push({ stepId: step.id, fieldId: field.id, message: `${field.label} is required.` });
				}
				continue;
			}
			if (field.options && !field.options.some((option) => option.value === text)) {
				issues.push({
					stepId: step.id,
					fieldId: field.id,
					message: `${field.label} "${text}" is not an available option.`,
				});
			}
		} else {
			// text
			if (field.required && asText(raw).trim() === '') {
				issues.push({ stepId: step.id, fieldId: field.id, message: `${field.label} is required.` });
			}
		}
	}

	// Step-level rule: the abilities point-buy budget. Only enforced once every ability is a legal
	// in-range score (otherwise the per-field range issues are the actionable ones).
	if (step.id === 'abilities' && issues.length === 0) {
		let spent = 0;
		for (const ability of ABILITY_IDS) {
			const score = asNumber(values[ability]);
			const cost = score === null ? null : pointBuyCost(score);
			if (cost === null) {
				// Defensive: a score outside the cost table that slipped past range checks.
				issues.push({
					stepId: step.id,
					fieldId: ability,
					message: `${ability.toUpperCase()} is not a legal point-buy score.`,
				});
			} else {
				spent += cost;
			}
		}
		if (issues.length === 0 && spent > ABILITY_POINT_BUDGET) {
			issues.push({
				stepId: step.id,
				fieldId: null,
				message: `Point buy spends ${spent} of ${ABILITY_POINT_BUDGET} points. Reduce a score.`,
			});
		}
	}

	return { stepId: step.id, valid: issues.length === 0, issues };
}

/** The completeness report for a draft: per-step validity, overall validity, and resume info. */
export interface DraftCompleteness {
	/** Per-step validation, in flow order. */
	steps: DraftStepValidation[];
	/** Step ids the player has saved at least once (completed flag), in flow order. */
	completedStepIds: CharacterDraftStepId[];
	/** Every validation issue across all steps, for the resume summary (CHAR-002 AC2). */
	issues: DraftValidationIssue[];
	/** True when every step is valid, so the draft may be finalized (CHAR-002 AC1). */
	readyToFinalize: boolean;
	/** The next incomplete-or-invalid step the player should work on, or null when ready. */
	nextStepId: CharacterDraftStepId | null;
}

/**
 * Compute the completeness/validation report for a whole draft from its saved step values
 * (CHAR-002). Deterministic and RESUMABLE: the report is derived purely from the persisted draft, so
 * reopening a draft restores exactly the completed steps and unresolved validation issues (AC2). A
 * draft is `readyToFinalize` only when EVERY step is valid (AC1).
 */
export function computeDraftCompleteness(draft: CharacterDraft): DraftCompleteness {
	const valuesByStep = draftStepValues(draft);
	const completed = new Set(draft.steps.filter((step) => step.completed).map((step) => step.stepId));

	const steps = DRAFT_STEPS.map((definition) =>
		validateDraftStep(definition.id, valuesByStep[definition.id] ?? {}),
	);
	const issues = steps.flatMap((step) => step.issues);
	const readyToFinalize = steps.every((step) => step.valid);

	const completedStepIds = DRAFT_STEPS.filter((definition) => completed.has(definition.id)).map(
		(definition) => definition.id,
	);

	// The next step to resume: the first step that is either not yet completed, or completed but
	// still invalid. Null when the draft is ready.
	const nextStep = DRAFT_STEPS.find((definition) => {
		const validation = steps.find((step) => step.stepId === definition.id);
		return !completed.has(definition.id) || (validation ? !validation.valid : true);
	});

	return {
		steps,
		completedStepIds,
		issues,
		readyToFinalize,
		nextStepId: nextStep?.id ?? null,
	};
}
