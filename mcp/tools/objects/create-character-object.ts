import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { CharacterObject } from '../../../src/lib/types/object.js';
import { generateVaultObjectId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	normalizeAbilityScores,
	normalizeCharacterData,
	normalizeObjectRelationships,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import { abilityScoresSchema, objectBaseSchema } from '../shared/object-schema.js';
import { jsonResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';

export function registerCreateCharacterObjectTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'create_character_object',
		'Create a reusable character sheet note for embedding into other notes.',
		{
			...objectBaseSchema,
			ancestry: z.string().optional(),
			className: z.string().optional(),
			level: z.number().int().min(1).max(20).optional(),
			background: z.string().optional(),
			alignment: z.string().optional(),
			armorClass: z.number().int().optional(),
			hitPoints: z.number().int().optional(),
			speed: z.string().optional(),
			proficiencyBonus: z.string().optional(),
			abilities: abilityScoresSchema,
			goals: z.array(z.string()).optional().default([]),
			bonds: z.array(z.string()).optional().default([]),
			flaws: z.array(z.string()).optional().default([]),
			notes: z.string().optional(),
			dmNotes: z.string().optional(),
		},
		async (input) => {
			const now = nowISO();
			const object: CharacterObject = {
				id: generateVaultObjectId(),
				type: 'character',
				name: input.name,
				summary: input.summary,
				tags: input.tags,
				visibility: input.visibility,
				relationships: normalizeObjectRelationships(input.relationships),
				data: normalizeCharacterData({
					ancestry: input.ancestry,
					className: input.className,
					level: input.level,
					background: input.background,
					alignment: input.alignment,
					armorClass: input.armorClass,
					hitPoints: input.hitPoints,
					speed: input.speed,
					proficiencyBonus: input.proficiencyBonus,
					abilities: input.abilities ? normalizeAbilityScores(input.abilities) : undefined,
					goals: input.goals,
					bonds: input.bonds,
					flaws: input.flaws,
					notes: input.notes,
					dmNotes: input.dmNotes,
				}),
				createdAt: now,
				updatedAt: now,
			};

			if (!object.summary.trim()) {
				object.summary = summarizeVaultObject(object);
			}

			await storage.saveObject(object);
			const persisted = (await storage.getObject(object.id)) ?? object;
			return jsonResult({
				...objectSummary(persisted),
				embed: formatNoteEmbed({ id: persisted.id }, persisted.name, { view: 'card' }),
			});
		},
	);
}
