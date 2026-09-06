import {
	SYSTEM_ADVANCEMENT_MODELS,
	SYSTEM_CONDITION_DURATIONS,
	SYSTEM_CONDITION_SEVERITIES,
	SYSTEM_FIELD_TYPES,
	SYSTEM_RECOVERIES,
	SYSTEM_RESOURCE_KINDS,
	cloneSystemPackage,
	evaluateFormula,
	systemPackageSchema,
	type SystemAttribute,
	type SystemCondition,
	type SystemCreatureField,
	type SystemPackage,
	type SystemResource,
	type SystemSkill,
	type SyncOperation,
} from '@dndtools/core';
import type { MessageKey, MessageValues } from '../../i18n';

/**
 * The system builder's draft model (RC-SYS-3.3) — the whole of the builder that is not React.
 *
 * A system package is already the authoring shape: it is a flat, serializable declaration of what a
 * rules system offers, so the draft IS a `SystemPackage` rather than a parallel form model. That
 * matters for honesty — the builder never edits a shadow copy that has to be translated back, and
 * `validateDraft` is the CORE's own `systemPackageSchema` (the same `.strict()` schema
 * `system.define` / `system.update` validate against) with each zod issue path mapped onto the step
 * that owns it. The builder can therefore point at the step that needs attention BEFORE a dispatch,
 * but it can never invent a rule the core would not have enforced, and it never pre-judges a
 * rejection: Review dispatches and prints what the core says.
 *
 * Nothing here writes state and nothing here imports React.
 */

export const STEP_IDS = [
	'identity',
	'attributes',
	'resources',
	'conditions',
	'dice',
	'creature',
	'advancement',
	'review',
] as const;

export type SystemStepId = (typeof STEP_IDS)[number];

export const STEP_LABEL: Record<SystemStepId, MessageKey> = {
	identity: 'systemBuilder.step.identity',
	attributes: 'systemBuilder.step.attributes',
	resources: 'systemBuilder.step.resources',
	conditions: 'systemBuilder.step.conditions',
	dice: 'systemBuilder.step.dice',
	creature: 'systemBuilder.step.creature',
	advancement: 'systemBuilder.step.advancement',
	review: 'systemBuilder.step.review',
};

/** The draft the stepper edits. Byte-identical to what `system.update` persists. */
export type SystemDraft = SystemPackage;

/** One problem with the draft, already attributed to the step that can fix it. */
export interface SystemDraftIssue {
	step: SystemStepId;
	/** The zod path, dotted, for the inline message under the offending row. */
	path: string;
	/** The core schema's own wording, kept verbatim the way command rejections are. */
	message: string;
	/** Set instead when the builder itself raised the issue, so its wording is localized. */
	messageKey?: MessageKey;
	values?: MessageValues;
}

/** Render one issue: the builder's own wording is translated, the core's is quoted as it stands. */
export function issueText(
	issue: SystemDraftIssue,
	t: (key: MessageKey, values?: MessageValues) => string,
): string {
	return issue.messageKey ? t(issue.messageKey, issue.values) : issue.message;
}

/** Which step owns a given top-level field of the package. */
const STEP_BY_FIELD: Record<string, SystemStepId> = {
	id: 'identity',
	version: 'identity',
	displayName: 'identity',
	summary: 'identity',
	vocabulary: 'identity',
	attributes: 'attributes',
	skills: 'attributes',
	derived: 'attributes',
	resources: 'resources',
	conditions: 'conditions',
	dice: 'dice',
	turnModel: 'dice',
	creatureSchema: 'creature',
	advancement: 'advancement',
};

export function stepForPath(path: readonly (string | number | symbol)[]): SystemStepId {
	const head = path.length > 0 ? String(path[0]) : '';
	return STEP_BY_FIELD[head] ?? 'review';
}

/** A deep copy of an installed package, so editing the draft can never reach the slice. */
export function draftFromPackage(source: SystemPackage): SystemDraft {
	return cloneSystemPackage(source);
}

/** Trim the free text so a stray space cannot be the difference between two systems' names. */
export function buildPackage(draft: SystemDraft): SystemPackage {
	return {
		...cloneSystemPackage(draft),
		displayName: draft.displayName.trim(),
		summary: draft.summary.trim(),
		version: draft.version.trim(),
	};
}

/**
 * Every problem the core would reject, plus the one thing the schema cannot see: a key repeated
 * inside a list. The sheets, the formulas and the switch dry-run all key off it, so the second entry
 * silently shadows the first — and it is the authoring mistake a stepper makes easiest to commit.
 */
export function validateDraft(draft: SystemDraft): SystemDraftIssue[] {
	const issues: SystemDraftIssue[] = [];
	const parsed = systemPackageSchema.safeParse(buildPackage(draft));
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			issues.push({
				step: stepForPath(issue.path),
				path: issue.path.map(String).join('.'),
				message: issue.message,
			});
		}
	}
	issues.push(...duplicateKeyIssues('attributes', draft.attributes, 'attributes'));
	issues.push(...duplicateKeyIssues('resources', draft.resources, 'resources'));
	issues.push(...duplicateKeyIssues('conditions', draft.conditions, 'conditions'));
	issues.push(...duplicateKeyIssues('creatureSchema', draft.creatureSchema, 'creature'));
	issues.push(...duplicateKeyIssues('skills', draft.skills, 'attributes'));
	return issues;
}

function duplicateKeyIssues(
	field: string,
	entries: readonly { key: string }[],
	step: SystemStepId,
): SystemDraftIssue[] {
	const seen = new Set<string>();
	const issues: SystemDraftIssue[] = [];
	for (const [index, entry] of entries.entries()) {
		if (seen.has(entry.key)) {
			issues.push({
				step,
				path: `${field}.${index}.key`,
				message: `Another entry already uses the key ${entry.key}.`,
				messageKey: 'systemBuilder.issue.duplicateKey',
				values: { key: entry.key },
			});
		}
		seen.add(entry.key);
	}
	return issues;
}

/** The first step (in stepper order) carrying an issue, for "take me to what is wrong". */
export function firstBlockedStep(issues: readonly SystemDraftIssue[]): SystemStepId | null {
	for (const id of STEP_IDS) {
		if (issues.some((issue) => issue.step === id)) return id;
	}
	return null;
}

/** The issues raised against exactly one path, for a `Field`'s error slot. */
export function issuesForPath(
	issues: readonly SystemDraftIssue[],
	path: string,
	t: (key: MessageKey, values?: MessageValues) => string,
): string | undefined {
	const found = issues.filter((issue) => issue.path === path);
	return found.length > 0 ? found.map((issue) => issueText(issue, t)).join(' ') : undefined;
}

/* ---- the formula grammar helper + live preview ------------------------------------------------ */

/** The identifiers a resource's `maxFormula` may read (mirrors `schemas/system-package.ts`). */
export const RESOURCE_FORMULA_IDENTIFIERS = ['level', 'score', 'modifier', 'proficiency'] as const;

/** The levels the Resources step previews every formula at. */
export const PREVIEW_LEVELS = [1, 5, 10, 20] as const;

/**
 * The scope a preview binds. `level` is the level being previewed; the other three are the sample
 * character the preview is honest about in its own caption — a preview is an illustration, not a
 * promise about any particular sheet.
 */
export const PREVIEW_ABILITY_SCORE = 16;
export const PREVIEW_ABILITY_MODIFIER = 3;

/** 5e's proficiency progression, the only widely-shared level→bonus curve, used for the sample. */
export function previewProficiency(level: number): number {
	return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export interface FormulaPreviewRow {
	level: number;
	/** The evaluated maximum, or `null` when the formula could not be evaluated at this level. */
	value: number | null;
	/** Why it could not, in the evaluator's own words. */
	message: string | null;
}

/** Evaluate one resource formula across `PREVIEW_LEVELS`. Pure — used by the step and its test. */
export function previewFormula(formula: string): FormulaPreviewRow[] {
	return PREVIEW_LEVELS.map((level) => {
		const result = evaluateFormula(formula, {
			level,
			score: PREVIEW_ABILITY_SCORE,
			modifier: PREVIEW_ABILITY_MODIFIER,
			proficiency: previewProficiency(level),
		});
		return result.ok
			? { level, value: result.value, message: null }
			: { level, value: null, message: result.message };
	});
}

/* ---- row factories ----------------------------------------------------------------------------- */

/** Mint a key that is not already taken, so "Add" never produces an instantly-invalid row. */
export function nextKey(base: string, taken: readonly { key: string }[]): string {
	const used = new Set(taken.map((entry) => entry.key));
	if (!used.has(base)) return base;
	for (let n = 2; n < 500; n += 1) {
		const candidate = `${base}-${n}`;
		if (!used.has(candidate)) return candidate;
	}
	return `${base}-${Date.now()}`;
}

export function newAttribute(taken: readonly SystemAttribute[]): SystemAttribute {
	return {
		key: nextKey('attribute', taken),
		label: 'Attribute',
		abbreviation: 'ATT',
		derivation: { kind: 'none' },
	};
}

export function newResource(taken: readonly SystemResource[]): SystemResource {
	return {
		key: nextKey('resource', taken),
		label: 'Resource',
		kind: SYSTEM_RESOURCE_KINDS[0]!,
		maxFormula: null,
		recovery: SYSTEM_RECOVERIES[1]!,
		diceNotation: null,
	};
}

export function newCondition(taken: readonly SystemCondition[]): SystemCondition {
	return {
		key: nextKey('condition', taken),
		label: 'Condition',
		icon: 'cond-stunned',
		severity: SYSTEM_CONDITION_SEVERITIES[0]!,
		defaultDuration: SYSTEM_CONDITION_DURATIONS[4]!,
		defaultRounds: null,
		maxStacks: null,
	};
}

export function newCreatureField(taken: readonly SystemCreatureField[]): SystemCreatureField {
	return {
		key: nextKey('field', taken),
		label: 'Field',
		type: SYSTEM_FIELD_TYPES[0]!,
		required: false,
		options: null,
	};
}

export function newSkill(taken: readonly SystemSkill[]): SystemSkill {
	return { key: nextKey('skill', taken), label: 'Skill', attribute: null };
}

/** The advancement models, dice models and field types, re-exported so steps import one module. */
export { SYSTEM_ADVANCEMENT_MODELS, SYSTEM_FIELD_TYPES };

/* ---- provenance -------------------------------------------------------------------------------- */

/**
 * Which package this one was forked from, read off the DURABLE operation log rather than a field on
 * the package: `system.fork` records `sourcePackageId` in its op (`commands/system-package.ts`), so
 * the origin survives a reload and a sync without a schema change. The most recent fork of this id
 * wins, because a deleted-and-re-forked id is the same story told twice.
 */
export function forkOriginId(
	operations: readonly SyncOperation[],
	packageId: string,
): string | null {
	for (let index = operations.length - 1; index >= 0; index -= 1) {
		const op = operations[index]!;
		if (op.opType !== 'system.fork' || op.entityId !== packageId) continue;
		const source = (op.value as { sourcePackageId?: unknown } | undefined)?.sourcePackageId;
		if (typeof source === 'string') return source;
	}
	return null;
}
