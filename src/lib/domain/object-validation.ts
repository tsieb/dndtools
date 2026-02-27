import type { ObjectLintIssue, VaultObject } from '$lib/types/object.js';

function issue(
	object: VaultObject,
	code: string,
	message: string,
	severity: 'error' | 'warning',
	field?: string,
): ObjectLintIssue {
	return {
		objectId: object.id,
		code,
		message,
		severity,
		field,
	};
}

export function lintVaultObjects(objects: VaultObject[]): ObjectLintIssue[] {
	const byId = new Set(objects.map((object) => String(object.id)));
	const lint: ObjectLintIssue[] = [];

	for (const object of objects) {
		if (!object.name.trim()) {
			lint.push(issue(object, 'object.name_required', 'Object name is required.', 'error', 'name'));
		}

		for (const [index, relationship] of object.relationships.entries()) {
			if (!relationship.targetId && !relationship.sessionId) {
				lint.push(
					issue(
						object,
						'object.relationship_target_required',
						'Relationship must include a target object id or session id.',
						'error',
						`relationships[${index}]`,
					),
				);
				continue;
			}
			if (relationship.targetId && !byId.has(String(relationship.targetId))) {
				lint.push(
					issue(
						object,
						'object.relationship_broken_reference',
						`Relationship target "${String(relationship.targetId)}" does not exist.`,
						'error',
						`relationships[${index}].targetId`,
					),
				);
			}
		}

		switch (object.type) {
			case 'stat_block':
				if (!object.data.creatureType?.trim()) {
					lint.push(
						issue(
							object,
							'stat_block.creature_type_required',
							'Creature type is required for stat blocks.',
							'error',
							'data.creatureType',
						),
					);
				}
				if (!object.data.hitPoints?.trim()) {
					lint.push(
						issue(
							object,
							'stat_block.hp_required',
							'Hit points are required for stat blocks.',
							'warning',
							'data.hitPoints',
						),
					);
				}
				break;
			case 'character':
				if (!object.data.className?.trim() && !object.data.ancestry?.trim()) {
					lint.push(
						issue(
							object,
							'character.identity_recommended',
							'Add ancestry or class to improve character card quality.',
							'warning',
						),
					);
				}
				break;
			case 'image':
				if (!object.data.url.trim()) {
					lint.push(
						issue(
							object,
							'image.url_required',
							'Image URL is required for image objects.',
							'error',
							'data.url',
						),
					);
				}
				break;
			case 'npc':
				if (!object.data.role?.trim()) {
					lint.push(
						issue(object, 'npc.role_required', 'NPC role is required.', 'error', 'data.role'),
					);
				}
				break;
			case 'location':
				if (!object.data.locationType?.trim()) {
					lint.push(
						issue(
							object,
							'location.type_required',
							'Location type is required.',
							'error',
							'data.locationType',
						),
					);
				}
				break;
			case 'faction':
				if (!object.data.factionType?.trim()) {
					lint.push(
						issue(
							object,
							'faction.type_required',
							'Faction type is required.',
							'error',
							'data.factionType',
						),
					);
				}
				break;
			case 'quest':
				if (!object.data.objective?.trim()) {
					lint.push(
						issue(
							object,
							'quest.objective_required',
							'Quest objective is required.',
							'error',
							'data.objective',
						),
					);
				}
				break;
			case 'item':
				if (!object.data.itemType?.trim()) {
					lint.push(
						issue(object, 'item.type_required', 'Item type is required.', 'error', 'data.itemType'),
					);
				}
				break;
			case 'encounter':
				if (!object.data.objective?.trim()) {
					lint.push(
						issue(
							object,
							'encounter.objective_required',
							'Encounter objective is required.',
							'error',
							'data.objective',
						),
					);
				}
				break;
			case 'timeline_event':
				if (!object.data.date?.trim()) {
					lint.push(
						issue(
							object,
							'timeline_event.date_required',
							'Timeline event date is required.',
							'error',
							'data.date',
						),
					);
				}
				if (!object.data.summary?.trim()) {
					lint.push(
						issue(
							object,
							'timeline_event.summary_required',
							'Timeline event summary is required.',
							'error',
							'data.summary',
						),
					);
				}
				break;
		}
	}

	return lint.sort((a, b) => {
		const severity = a.severity.localeCompare(b.severity);
		if (severity !== 0) return severity;
		return a.code.localeCompare(b.code);
	});
}
