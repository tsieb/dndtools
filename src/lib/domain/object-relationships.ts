import type { ObjectRelationshipGraph, VaultObject, VaultObjectId } from '$lib/types/object.js';

export function buildObjectRelationshipGraph(objects: VaultObject[]): ObjectRelationshipGraph {
	const byId = new Set(objects.map((object) => String(object.id)));
	const nodes = objects
		.map((object) => ({
			id: object.id,
			type: object.type,
			name: object.name,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	const edges = objects
		.flatMap((object) =>
			object.relationships.map((relationship) => ({
				fromId: object.id,
				type: relationship.type,
				label: relationship.label,
				toId: relationship.targetId,
				sessionId: relationship.sessionId,
				description: relationship.description,
				unresolved: relationship.targetId ? !byId.has(String(relationship.targetId)) : false,
			})),
		)
		.sort((a, b) => {
			const from = String(a.fromId).localeCompare(String(b.fromId));
			if (from !== 0) return from;
			return a.type.localeCompare(b.type);
		});

	return { nodes, edges };
}

export function getRelationshipNeighbors(
	graph: ObjectRelationshipGraph,
	id: VaultObjectId,
): VaultObjectId[] {
	const neighbors = new Set<string>();
	for (const edge of graph.edges) {
		if (String(edge.fromId) === String(id) && edge.toId) {
			neighbors.add(String(edge.toId));
		}
		if (edge.toId && String(edge.toId) === String(id)) {
			neighbors.add(String(edge.fromId));
		}
	}
	return [...neighbors] as VaultObjectId[];
}
