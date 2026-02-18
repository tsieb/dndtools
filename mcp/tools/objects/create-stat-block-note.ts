import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import type { StatBlockObject } from '../../../src/lib/types/object.js';
import { generateVaultObjectId } from '../../../src/lib/utils/id.js';
import { nowISO } from '../../../src/lib/utils/date.js';
import {
	normalizeAbilityScores,
	normalizeStatBlockData,
	summarizeVaultObject,
} from '../../../src/lib/domain/objects.js';
import { formatNoteEmbed } from '../../../src/lib/domain/object-embeds.js';
import {
	abilityScoresSchema,
	objectBaseSchema,
	statBlockEntrySchema,
} from '../shared/object-schema.js';
import { jsonResult } from '../shared/response.js';
import { objectSummary } from '../shared/object-summary.js';

export function registerCreateStatBlockNoteTool(
	server: McpServer,
	storage: FileSystemAdapter,
): void {
	server.tool(
		'create_stat_block_note',
		'Create a dedicated stat block note (D&D 5e friendly, system-flexible).',
		{
			...objectBaseSchema,
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
		},
		async (input) => {
			const now = nowISO();
			const object: StatBlockObject = {
				id: generateVaultObjectId(),
				type: 'stat_block',
				name: input.name,
				summary: input.summary,
				tags: input.tags,
				data: normalizeStatBlockData({
					size: input.size,
					creatureType: input.creatureType,
					alignment: input.alignment,
					armorClass: input.armorClass,
					hitPoints: input.hitPoints,
					speed: input.speed,
					challengeRating: input.challengeRating,
					abilities: normalizeAbilityScores(input.abilities),
					traits: input.traits,
					actions: input.actions,
					reactions: input.reactions,
					legendaryActions: input.legendaryActions,
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

