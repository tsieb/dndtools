import { z } from 'zod';

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
		.array(
			z.object({
				type: z.enum(['parent', 'child', 'ally', 'enemy', 'appears_in_session']),
				targetId: z.string().optional(),
				sessionId: z.string().optional(),
				description: z.string().optional(),
			}),
		)
		.optional()
		.default([])
		.describe('Graph edges to other objects or sessions'),
};
