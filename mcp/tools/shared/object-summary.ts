import type { VaultObject } from '../../../src/lib/types/object.js';

export function objectSummary(object: VaultObject): {
	id: string;
	type: VaultObject['type'];
	name: string;
	summary: string;
	tags: string[];
	visibility: VaultObject['visibility'];
	updatedAt: string;
} {
	return {
		id: object.id,
		type: object.type,
		name: object.name,
		summary: object.summary,
		tags: object.tags,
		visibility: object.visibility,
		updatedAt: object.updatedAt,
	};
}
