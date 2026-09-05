import type { CharacterDraft } from './character-state';
import { abilityScoreKeyFor, draftStepValues } from './character-state';
import type { SystemAttribute, SystemPackage } from './system-package';
import { DND5E_SYSTEM_PACKAGE } from '../systems';

/**
 * CHAR-002 — the GUIDED, STRUCTURED PC-creation flow: rules, options, per-step VALIDATION, and a
 * completeness report. All PURE Processing-Core policy (Contract 1): the GUI renders these steps and
 * the computed validation/completeness; it does not author the rules. Validation is deterministic so
 * the same draft always reports the same issues, and progress is RESUMABLE — a draft persists its
 * step values (`character-state.ts`) and this module recomputes validity from them on resume so
 * "completed steps and unresolved validation issues are restored" (CHAR-002 AC2).
 *
 * The rule set is intentionally a SMALL, self-contained prototype rule system, not a full 5e engine:
 * an identity step, an attributes step with a point-budget rule, and a class/options step. Later
 * CHAR epics (leveling, inventory) extend the flow by adding steps and rules here without reshaping
 * the draft document.
 *
 * RC-SYS-2.1 — the ATTRIBUTES step is no longer six hard-coded abilities: it is BUILT from the active
 * `SystemPackage`'s `attributes[]`. A package that declares none (the built-in Generic package) has no
 * attributes step at all, so a Generic draft is complete without ever assigning a score. The step id
 * and, under 5e, its field ids stay exactly what they were (`abilities`, `str`…`cha`), so a draft
 * saved before this change resumes with its progress and issues intact.
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

/**
 * The six legacy ability field ids in canonical order — the ids a 5e attributes step still saves
 * under (RC-SYS-2.1 keeps them for byte-stability; see {@link draftAttributeFieldId}).
 */
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

/**
 * The field id an attribute is saved under. A package attribute that aliases one of the six fixed
 * ability fields keeps that legacy short id (`strength` ⇒ `str`), so a draft saved before RC-SYS-2.1
 * resumes against exactly the values it stored; anything else uses the package key verbatim.
 */
export function draftAttributeFieldId(attribute: SystemAttribute): string {
	return abilityScoreKeyFor(attribute.key) ?? attribute.key;
}

/**
 * Whether the point-buy budget rule applies to this package's attributes. Point buy is a rule about
 * SCORES that turn into modifiers; a system whose attributes derive nothing (a pool system counting
 * dice) is not scored that way, so it gets the field but not the budget.
 */
function usesPointBuy(attributes: readonly SystemAttribute[]): boolean {
	return (
		attributes.length > 0 &&
		attributes.every((attribute) => attribute.derivation.kind === 'modifier')
	);
}

/** The attributes step for a package, or `null` when the package declares no attributes. */
function attributesStep(pkg: SystemPackage): DraftStepDefinition | null {
	if (pkg.attributes.length === 0) return null;
	const budgeted = usesPointBuy(pkg.attributes);
	return {
		id: 'abilities',
		order: 1,
		title: 'Attributes',
		description: budgeted
			? `Assign scores using point buy (${ABILITY_POINT_BUDGET} points, each ${ABILITY_MIN}–${ABILITY_MAX}).`
			: 'Assign a rating to each attribute.',
		fields: pkg.attributes.map((attribute) => ({
			id: draftAttributeFieldId(attribute),
			label: attribute.abbreviation,
			kind: 'number' as const,
			required: true,
		})),
	};
}

/**
 * The ordered step definitions for the guided flow under one system package (RC-SYS-2.1). The single
 * source of truth for the GUI. Identity and class are flow-level prototype rules the package model
 * does not describe, so they are present for every system; the attributes step is package-derived and
 * disappears entirely for a system with no attributes.
 */
export function draftStepsForPackage(pkg: SystemPackage): DraftStepDefinition[] {
	const attributes = attributesStep(pkg);
	return [
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
		...(attributes ? [attributes] : []),
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
	];
}

/** The flow under the built-in 5e package — the shape every pre-RC-SYS-2.1 caller already expects. */
export const DRAFT_STEPS: readonly DraftStepDefinition[] = Object.freeze(
	draftStepsForPackage(DND5E_SYSTEM_PACKAGE),
);

/** One step definition under a package (5e by default). */
export function getDraftStep(
	stepId: string,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): DraftStepDefinition | undefined {
	return draftStepsForPackage(pkg).find((step) => step.id === stepId);
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
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): DraftStepValidation {
	const step = getDraftStep(stepId, pkg);
	if (!step) {
		return {
			stepId: stepId as CharacterDraftStepId,
			valid: false,
			issues: [{ stepId: stepId as CharacterDraftStepId, fieldId: null, message: 'Unknown step.' }],
		};
	}
	const issues: DraftValidationIssue[] = [];
	// The point-buy bounds/budget are a rule about SCORES; a system whose attributes derive nothing
	// still declares the fields but is not scored that way (RC-SYS-2.1).
	const budgeted = step.id === 'abilities' && usesPointBuy(pkg.attributes);

	for (const field of step.fields) {
		const raw = values[field.id];
		if (field.kind === 'number') {
			const num = asNumber(raw);
			if (num === null) {
				if (field.required) {
					issues.push({
						stepId: step.id,
						fieldId: field.id,
						message: `${field.label} is required.`,
					});
				}
				continue;
			}
			if (step.id === 'abilities' && budgeted && (num < ABILITY_MIN || num > ABILITY_MAX)) {
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
					issues.push({
						stepId: step.id,
						fieldId: field.id,
						message: `${field.label} is required.`,
					});
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
	if (budgeted && issues.length === 0) {
		let spent = 0;
		for (const field of step.fields) {
			const score = asNumber(values[field.id]);
			const cost = score === null ? null : pointBuyCost(score);
			if (cost === null) {
				// Defensive: a score outside the cost table that slipped past range checks.
				issues.push({
					stepId: step.id,
					fieldId: field.id,
					message: `${field.label} is not a legal point-buy score.`,
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
export function computeDraftCompleteness(
	draft: CharacterDraft,
	pkg: SystemPackage = DND5E_SYSTEM_PACKAGE,
): DraftCompleteness {
	const valuesByStep = draftStepValues(draft);
	const completed = new Set(
		draft.steps.filter((step) => step.completed).map((step) => step.stepId),
	);
	const definitions = draftStepsForPackage(pkg);

	const steps = definitions.map((definition) =>
		validateDraftStep(definition.id, valuesByStep[definition.id] ?? {}, pkg),
	);
	const issues = steps.flatMap((step) => step.issues);
	const readyToFinalize = steps.every((step) => step.valid);

	const completedStepIds = definitions
		.filter((definition) => completed.has(definition.id))
		.map((definition) => definition.id);

	// The next step to resume: the first step that is either not yet completed, or completed but
	// still invalid. Null when the draft is ready.
	const nextStep = definitions.find((definition) => {
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
