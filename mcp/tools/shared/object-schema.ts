import { z } from 'zod';

export const vaultObjectTypeSchema = z.enum([
	'stat_block',
	'character',
	'image',
	'npc',
	'location',
	'faction',
	'quest',
	'item',
	'encounter',
	'timeline_event',
]);

export const objectRelationshipCoreTypeSchema = z.enum([
	'parent',
	'child',
	'ally',
	'enemy',
	'appears_in_session',
]);

const relationshipTargetSchema = {
	targetId: z.string().min(1).optional(),
	sessionId: z.string().min(1).optional(),
	description: z.string().optional(),
};

const coreRelationshipSchema = z
	.object({
		type: objectRelationshipCoreTypeSchema,
		...relationshipTargetSchema,
	})
	.strict();

const customRelationshipSchema = z
	.object({
		type: z.literal('custom'),
		label: z.string().min(1).max(120),
		...relationshipTargetSchema,
	})
	.strict();

export const objectRelationshipSchema = z
	.union([coreRelationshipSchema, customRelationshipSchema])
	.superRefine((value, ctx) => {
		if (!value.targetId && !value.sessionId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Relationship must include targetId or sessionId.',
				path: ['targetId'],
			});
		}
	});

export const abilityScoresSchema = z
	.object({
		str: z.number().int().min(1).max(30).optional(),
		dex: z.number().int().min(1).max(30).optional(),
		con: z.number().int().min(1).max(30).optional(),
		int: z.number().int().min(1).max(30).optional(),
		wis: z.number().int().min(1).max(30).optional(),
		cha: z.number().int().min(1).max(30).optional(),
	})
	.strict()
	.optional()
	.default({});

export const statBlockEntrySchema = z
	.object({
		name: z.string().min(1),
		description: z.string().min(1),
	})
	.strict();

export const objectBaseSchema = {
	name: z.string().min(1).describe('Display name'),
	summary: z.string().optional().default('').describe('Short summary used in embeds'),
	tags: z.array(z.string()).optional().default([]).describe('Tag list without #'),
	relationships: z
		.array(objectRelationshipSchema)
		.optional()
		.default([])
		.describe('Graph edges to other objects or sessions'),
};

export const statBlockDataSchema = z
	.object({
		size: z.string().optional(),
		creatureType: z.string().optional(),
		alignment: z.string().optional(),
		armorClass: z.number().int().optional(),
		hitPoints: z.string().optional(),
		speed: z.string().optional(),
		challengeRating: z.string().optional(),
		abilities: abilityScoresSchema,
		traits: z.array(statBlockEntrySchema).optional().default([]),
		actions: z.array(statBlockEntrySchema).optional().default([]),
		reactions: z.array(statBlockEntrySchema).optional().default([]),
		legendaryActions: z.array(statBlockEntrySchema).optional().default([]),
	})
	.strict();

export const characterDataSchema = z
	.object({
		ancestry: z.string().optional(),
		className: z.string().optional(),
		level: z.number().int().min(1).max(20).optional(),
		background: z.string().optional(),
		alignment: z.string().optional(),
		armorClass: z.number().int().optional(),
		hitPoints: z.number().int().optional(),
		speed: z.string().optional(),
		proficiencyBonus: z.string().optional(),
		abilities: abilityScoresSchema.optional(),
		goals: z.array(z.string()).optional().default([]),
		bonds: z.array(z.string()).optional().default([]),
		flaws: z.array(z.string()).optional().default([]),
		notes: z.string().optional(),
	})
	.strict();

export const imageDataSchema = z
	.object({
		url: z.string().min(1),
		alt: z.string().optional(),
		caption: z.string().optional(),
		credit: z.string().optional(),
		width: z.number().int().min(1).optional(),
		height: z.number().int().min(1).optional(),
	})
	.strict();

export const npcDataSchema = z
	.object({
		role: z.string().optional(),
		ancestry: z.string().optional(),
		alignment: z.string().optional(),
		disposition: z.string().optional(),
		armorClass: z.number().int().optional(),
		hitPoints: z.number().int().optional(),
		goals: z.array(z.string()).optional().default([]),
		secrets: z.array(z.string()).optional().default([]),
		notes: z.string().optional(),
	})
	.strict();

export const locationDataSchema = z
	.object({
		locationType: z.string().optional(),
		region: z.string().optional(),
		population: z.string().optional(),
		climate: z.string().optional(),
		dangerLevel: z.string().optional(),
		features: z.array(z.string()).optional().default([]),
		notableNpcIds: z.array(z.string()).optional().default([]),
	})
	.strict();

export const factionDataSchema = z
	.object({
		factionType: z.string().optional(),
		alignment: z.string().optional(),
		influence: z.string().optional(),
		leader: z.string().optional(),
		goals: z.array(z.string()).optional().default([]),
		resources: z.array(z.string()).optional().default([]),
		headquartersId: z.string().optional(),
	})
	.strict();

export const questDataSchema = z
	.object({
		status: z.string().optional(),
		giverId: z.string().optional(),
		objective: z.string().optional(),
		reward: z.string().optional(),
		dueSession: z.string().optional(),
		steps: z.array(z.string()).optional().default([]),
		relatedLocationIds: z.array(z.string()).optional().default([]),
	})
	.strict();

export const itemDataSchema = z
	.object({
		itemType: z.string().optional(),
		rarity: z.string().optional(),
		attunement: z.boolean().optional(),
		ownerId: z.string().optional(),
		value: z.string().optional(),
		properties: z.array(z.string()).optional().default([]),
	})
	.strict();

export const encounterDataSchema = z
	.object({
		encounterType: z.string().optional(),
		challengeRating: z.string().optional(),
		environment: z.string().optional(),
		objective: z.string().optional(),
		participants: z.array(z.string()).optional().default([]),
		rewards: z.array(z.string()).optional().default([]),
	})
	.strict();

export const timelineEventDataSchema = z
	.object({
		date: z.string().optional(),
		era: z.string().optional(),
		significance: z.string().optional(),
		summary: z.string().optional(),
		involvedObjectIds: z.array(z.string()).optional().default([]),
		consequences: z.array(z.string()).optional().default([]),
	})
	.strict();

export const objectDataSchemaByType = {
	stat_block: statBlockDataSchema,
	character: characterDataSchema,
	image: imageDataSchema,
	npc: npcDataSchema,
	location: locationDataSchema,
	faction: factionDataSchema,
	quest: questDataSchema,
	item: itemDataSchema,
	encounter: encounterDataSchema,
	timeline_event: timelineEventDataSchema,
} as const;

const objectRecordBase = {
	id: z.string().min(1),
	name: z.string().min(1),
	summary: z.string(),
	tags: z.array(z.string()).default([]),
	relationships: z.array(objectRelationshipSchema).default([]),
	createdAt: z.string().min(1),
	updatedAt: z.string().min(1),
};

export const vaultObjectRecordSchema = z.discriminatedUnion('type', [
	z.object({ ...objectRecordBase, type: z.literal('stat_block'), data: statBlockDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('character'), data: characterDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('image'), data: imageDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('npc'), data: npcDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('location'), data: locationDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('faction'), data: factionDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('quest'), data: questDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('item'), data: itemDataSchema }).strict(),
	z.object({ ...objectRecordBase, type: z.literal('encounter'), data: encounterDataSchema }).strict(),
	z
		.object({ ...objectRecordBase, type: z.literal('timeline_event'), data: timelineEventDataSchema })
		.strict(),
]);
