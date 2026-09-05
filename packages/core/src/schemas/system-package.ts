/**
 * RC-SYS-1.1 — zod schemas for the SYSTEM PACKAGE model (`state/system-package.ts`).
 *
 * Every object is `.strict()`: an unknown key is a rejection, not a silently-kept extra. A package
 * arriving from an import, a DM's authoring form or a synced peer is either exactly this shape or it
 * does not enter the vault (fail closed). Formula fields are checked for parseability against the
 * identifiers their site is allowed to read, so a package can never carry an expression the
 * evaluator would only refuse at render time.
 */
import { z } from 'zod';
import {
	SYSTEM_ADVANCEMENT_MODELS,
	SYSTEM_ADVANTAGE_SEMANTICS,
	SYSTEM_CONDITION_DURATIONS,
	SYSTEM_CONDITION_SEVERITIES,
	SYSTEM_CRIT_EFFECTS,
	SYSTEM_DICE_MODELS,
	SYSTEM_FIELD_TYPES,
	SYSTEM_RECOVERIES,
	SYSTEM_RESOURCE_KINDS,
	SYSTEMS_STATE_SCHEMA_VERSION,
	evaluateFormula,
} from '../state/system-package';

/**
 * A stable machine key: starts lower-case, then letters, digits or hyphens. Both `hitPoints` and
 * `animal-handling` are legal — the codebase uses camelCase for record fields and kebab for the
 * multi-word vocabulary keys, and a key doubles as a formula identifier, so no other characters.
 */
const keySchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z][a-zA-Z0-9-]*$/,
		'Start a key with a lower-case letter, then letters, digits or hyphens.',
	);
const labelSchema = z.string().min(1).max(120);
const idSchema = z.string().min(1).max(200);
const diceNotationSchema = z.string().regex(/^\d*d\d+([+-]\d+)?$/, 'Use dice notation, e.g. 1d20.');

/**
 * A formula that parses against `identifiers`. Evaluated with every identifier bound to 1 (not 0) so
 * a legitimate division by a supplied value is not mistaken for a divide-by-zero.
 */
function formulaSchema(identifiers: readonly string[]) {
	return z
		.string()
		.min(1)
		.max(200)
		.superRefine((value, ctx) => {
			const scope: Record<string, number> = {};
			for (const identifier of identifiers) scope[identifier] = 1;
			const result = evaluateFormula(value, scope);
			if (!result.ok) {
				ctx.addIssue({ code: 'custom', message: result.message });
			}
		});
}

export const systemVocabularySchema = z
	.object({
		gameMaster: labelSchema,
		player: labelSchema,
		character: labelSchema,
		ability: labelSchema,
		abilityPlural: labelSchema,
		levelUpVerb: labelSchema,
		levelNoun: labelSchema,
		hitPoints: labelSchema,
		session: labelSchema,
		campaign: labelSchema,
	})
	.strict();

export const systemAttributeSchema = z
	.object({
		key: keySchema,
		label: labelSchema,
		abbreviation: z.string().min(1).max(8),
		derivation: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('none') }).strict(),
			z.object({ kind: z.literal('modifier'), formula: formulaSchema(['score']) }).strict(),
		]),
	})
	.strict();

export const systemResourceSchema = z
	.object({
		key: keySchema,
		label: labelSchema,
		kind: z.enum(SYSTEM_RESOURCE_KINDS),
		maxFormula: formulaSchema(['level', 'score', 'modifier', 'proficiency']).nullable(),
		recovery: z.enum(SYSTEM_RECOVERIES),
		diceNotation: diceNotationSchema.nullable(),
	})
	.strict();

export const systemConditionSchema = z
	.object({
		key: keySchema,
		label: labelSchema,
		icon: z.string().min(1).max(64),
		severity: z.enum(SYSTEM_CONDITION_SEVERITIES),
		defaultDuration: z.enum(SYSTEM_CONDITION_DURATIONS),
		defaultRounds: z.number().int().min(1).max(1000).nullable(),
		maxStacks: z.number().int().min(1).max(100).nullable(),
	})
	.strict();

export const systemCritRulesSchema = z
	.object({
		naturalHigh: z.number().int().min(1).max(1000).nullable(),
		naturalLow: z.number().int().min(1).max(1000).nullable(),
		effect: z.enum(SYSTEM_CRIT_EFFECTS),
	})
	.strict();

export const systemDiceSchema = z
	.object({
		model: z.enum(SYSTEM_DICE_MODELS),
		notation: diceNotationSchema,
		advantage: z.enum(SYSTEM_ADVANTAGE_SEMANTICS),
		successThreshold: z.number().int().min(1).max(100).nullable(),
		crit: systemCritRulesSchema,
	})
	.strict();

export const systemTurnModelSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('initiative'),
			initiativeFormula: formulaSchema(['modifier', 'score', 'level']).nullable(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('actions-per-turn'),
			actionsPerTurn: z.number().int().min(1).max(20),
		})
		.strict(),
	z.object({ kind: z.literal('popcorn') }).strict(),
	z.object({ kind: z.literal('none') }).strict(),
]);

export const systemCreatureFieldSchema = z
	.object({
		key: keySchema,
		label: labelSchema,
		type: z.enum(SYSTEM_FIELD_TYPES),
		required: z.boolean(),
		options: z.array(z.string().min(1).max(120)).nullable(),
	})
	.strict()
	.refine((field) => (field.type === 'enum' ? (field.options?.length ?? 0) > 0 : true), {
		message: 'An enum field must declare at least one option.',
		path: ['options'],
	});

export const systemAdvancementSchema = z
	.object({
		model: z.enum(SYSTEM_ADVANCEMENT_MODELS),
		levelCap: z.number().int().min(1).max(100).nullable(),
		xpThresholds: z.array(z.number().int().min(0)),
	})
	.strict()
	.refine(
		(advancement) =>
			advancement.model === 'xp-table' ? advancement.xpThresholds.length > 0 : true,
		{
			message: 'An xp-table system must declare its experience thresholds.',
			path: ['xpThresholds'],
		},
	);

export const systemSkillSchema = z
	.object({ key: keySchema, label: labelSchema, attribute: keySchema.nullable() })
	.strict();

export const systemDerivedValueSchema = z
	.object({
		key: keySchema,
		label: labelSchema,
		formula: z.string().min(1).max(200),
		inputs: z.array(keySchema.or(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/))).max(16),
	})
	.strict()
	.superRefine((derived, ctx) => {
		const scope: Record<string, number> = {};
		for (const input of derived.inputs) scope[input] = 1;
		const result = evaluateFormula(derived.formula, scope);
		if (!result.ok) {
			ctx.addIssue({ code: 'custom', message: result.message, path: ['formula'] });
		}
	});

/** A complete system package. Unknown keys are rejected at every level. */
export const systemPackageSchema = z
	.object({
		id: idSchema,
		version: z.string().min(1).max(32),
		displayName: labelSchema,
		summary: z.string().min(1).max(280),
		vocabulary: systemVocabularySchema,
		attributes: z.array(systemAttributeSchema),
		resources: z.array(systemResourceSchema),
		conditions: z.array(systemConditionSchema),
		dice: systemDiceSchema,
		turnModel: systemTurnModelSchema,
		creatureSchema: z.array(systemCreatureFieldSchema),
		advancement: systemAdvancementSchema,
		skills: z.array(systemSkillSchema),
		derived: z.array(systemDerivedValueSchema),
	})
	.strict()
	.superRefine((pkg, ctx) => {
		const attributeKeys = new Set(pkg.attributes.map((a) => a.key));
		for (const [index, entry] of pkg.skills.entries()) {
			if (entry.attribute !== null && !attributeKeys.has(entry.attribute)) {
				ctx.addIssue({
					code: 'custom',
					message: `Skill ${entry.key} keys off unknown attribute ${entry.attribute}.`,
					path: ['skills', index, 'attribute'],
				});
			}
		}
	});

/** The durable `systems` state document. */
export const systemsStateSchema = z
	.object({
		packages: z.record(idSchema, systemPackageSchema),
		activePackageId: idSchema,
		activeWidgetPackageId: idSchema.nullable(),
		schemaVersion: z.literal(SYSTEMS_STATE_SCHEMA_VERSION),
	})
	.strict();
