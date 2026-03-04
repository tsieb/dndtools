import type { ObjectLintIssue, VaultObject } from '$lib/types/object.js';

function issue(
	object: VaultObject,
	code: string,
	message: string,
	severity: 'error' | 'warning',
	field?: string,
	suggestedFix?: string,
): ObjectLintIssue {
	return {
		objectId: object.id,
		code,
		message,
		severity,
		field,
		suggestedFix,
	};
}

function canonicalName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hierarchyAdjacency(objects: VaultObject[]): Map<string, Set<string>> {
	const ids = new Set(objects.map((object) => String(object.id)));
	const adjacency = new Map<string, Set<string>>();

	for (const object of objects) {
		const fromId = String(object.id);
		if (!adjacency.has(fromId)) adjacency.set(fromId, new Set());

		for (const relationship of object.relationships) {
			if (!relationship.targetId) continue;
			const targetId = String(relationship.targetId);
			if (!ids.has(targetId)) continue;

			if (relationship.type === 'child') {
				(adjacency.get(fromId) ?? new Set()).add(targetId);
				continue;
			}
			if (relationship.type === 'parent') {
				if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
				(adjacency.get(targetId) ?? new Set()).add(fromId);
			}
		}
	}

	return adjacency;
}

function detectHierarchyCycles(objects: VaultObject[]): Set<string> {
	const adjacency = hierarchyAdjacency(objects);
	const state = new Map<string, 0 | 1 | 2>();
	const stack: string[] = [];
	const cycleIds = new Set<string>();

	const visit = (id: string): void => {
		state.set(id, 1);
		stack.push(id);

		for (const next of adjacency.get(id) ?? []) {
			const nextState = state.get(next) ?? 0;
			if (nextState === 0) {
				visit(next);
				continue;
			}
			if (nextState === 1) {
				const start = stack.lastIndexOf(next);
				const cyclePath = start >= 0 ? stack.slice(start) : [next];
				for (const cycleId of cyclePath) {
					cycleIds.add(cycleId);
				}
			}
		}

		stack.pop();
		state.set(id, 2);
	};

	for (const object of objects) {
		const id = String(object.id);
		if ((state.get(id) ?? 0) === 0) {
			visit(id);
		}
	}

	return cycleIds;
}

export function lintVaultObjects(objects: VaultObject[]): ObjectLintIssue[] {
	const byId = new Set(objects.map((object) => String(object.id)));
	const lint: ObjectLintIssue[] = [];
	const names = new Map<string, VaultObject[]>();
	const cyclicHierarchyObjectIds = detectHierarchyCycles(objects);

	for (const object of objects) {
		const key = canonicalName(object.name);
		if (!key) continue;
		const bucket = names.get(key) ?? [];
		bucket.push(object);
		names.set(key, bucket);
	}

	for (const object of objects) {
		if (!object.name.trim()) {
			lint.push(
				issue(
					object,
					'object.name_required',
					'Object name is required.',
					'error',
					'name',
					'Set a unique display name.',
				),
			);
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
						'Set a valid target id/session id or remove this relationship.',
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
						'Remove the broken relationship or select a valid target object.',
					),
				);
			}
		}

		if (cyclicHierarchyObjectIds.has(String(object.id))) {
			lint.push(
				issue(
					object,
					'object.parent_child_cycle',
					'Parent/child hierarchy contains a cycle.',
					'error',
					'relationships',
					'Remove at least one parent/child edge in this chain.',
				),
			);
		}

		const duplicateBucket = names.get(canonicalName(object.name));
		if (duplicateBucket && duplicateBucket.length > 1) {
			lint.push(
				issue(
					object,
					'object.duplicate_canonical_name',
					`Another object has the same canonical name "${object.name.trim()}".`,
					'warning',
					'name',
					'Rename this object to a unique canonical name.',
				),
			);
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
							'Provide creature type.',
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
							'Provide hit points.',
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
							undefined,
							'Add ancestry and/or class.',
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
							'Provide an image URL or file URI.',
						),
					);
				}
				break;
			case 'map':
				if (!object.data.filePath?.trim()) {
					lint.push(
						issue(
							object,
							'map.file_path_required',
							'Map file path is required.',
							'error',
							'data.filePath',
							'Import a map image or provide a valid map asset path.',
						),
					);
				}
				if (object.data.scale && !object.data.scale.unitLabel?.trim()) {
					lint.push(
						issue(
							object,
							'map.scale_unit_required',
							'Scale unit label is required when map scale is set.',
							'warning',
							'data.scale.unitLabel',
							'Set a unit label (for example: ft, m, mi).',
						),
					);
				}
				if (object.data.grid && object.data.grid.cellSize <= 0) {
					lint.push(
						issue(
							object,
							'map.grid_cell_size_invalid',
							'Grid cell size must be greater than zero.',
							'error',
							'data.grid.cellSize',
							'Set a positive grid cell size.',
						),
					);
				}
				break;
			case 'npc':
				if (!object.data.role?.trim()) {
					lint.push(
						issue(
							object,
							'npc.role_required',
							'NPC role is required.',
							'error',
							'data.role',
							'Provide role (for example: ally, rival, merchant).',
						),
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
							'Provide a location type.',
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
							'Provide a faction type.',
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
							'Provide a quest objective.',
						),
					);
				}
				break;
			case 'item':
				if (!object.data.itemType?.trim()) {
					lint.push(
						issue(
							object,
							'item.type_required',
							'Item type is required.',
							'error',
							'data.itemType',
							'Provide an item type.',
						),
					);
				}
				break;
			case 'handout':
				if (!object.data.title?.trim()) {
					lint.push(
						issue(
							object,
							'handout.title_required',
							'Handout title is required.',
							'error',
							'data.title',
							'Provide a handout title.',
						),
					);
				}
				if (!object.data.content?.trim()) {
					lint.push(
						issue(
							object,
							'handout.content_required',
							'Handout content is required.',
							'error',
							'data.content',
							'Provide markdown content for this handout.',
						),
					);
				}
				if (object.data.handoutType === 'cipher') {
					if (!object.data.cipher?.decodedContent?.trim()) {
						lint.push(
							issue(
								object,
								'handout.cipher_decoded_required',
								'Cipher handouts require decoded text.',
								'error',
								'data.cipher.decodedContent',
								'Provide decoded text for DM reveal.',
							),
						);
					}
					if (!object.data.cipher?.substitutionKey?.trim()) {
						lint.push(
							issue(
								object,
								'handout.cipher_key_required',
								'Cipher handouts require a substitution key.',
								'warning',
								'data.cipher.substitutionKey',
								'Generate a substitution key before delivery.',
							),
						);
					}
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
							'Provide an encounter objective.',
						),
					);
				}
				break;
			case 'timeline_event':
				if (
					!object.data.date?.trim() &&
					(typeof object.data.worldDateOffset !== 'number' ||
						!Number.isFinite(object.data.worldDateOffset))
				) {
					lint.push(
						issue(
							object,
							'timeline_event.date_required',
							'Timeline event date is required.',
							'error',
							'data.date',
							'Provide an in-world date.',
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
							'Provide a concise event summary.',
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
