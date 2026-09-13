import type { GraphVisualization } from '@dndtools/core';

/** Index only the current actor-filtered read, including its search/facet limits. */
export function indexConnections(viz: Pick<GraphVisualization, 'nodes' | 'edges'>) {
	const index = new Map(
		viz.nodes.map((n) => [
			n.id,
			{
				neighbors: new Set<string>(),
				edges: [] as GraphVisualization['edges'],
			},
		]),
	);
	for (const edge of viz.edges) {
		const from = index.get(edge.fromId);
		const to = index.get(edge.toId);
		if (!from || !to) continue;
		from.neighbors.add(edge.toId);
		to.neighbors.add(edge.fromId);
		from.edges.push(edge);
		if (from !== to) to.edges.push(edge);
	}
	return index;
}

export function walkNode(ids: string[], current: string, key: string): string | undefined {
	if (!ids.length) return undefined;
	if (key === 'Home') return ids[0];
	if (key === 'End') return ids[ids.length - 1];
	const step =
		key === 'ArrowRight' || key === 'ArrowDown'
			? 1
			: key === 'ArrowLeft' || key === 'ArrowUp'
				? -1
				: 0;
	if (!step) return undefined;
	return ids[(Math.max(0, ids.indexOf(current)) + step + ids.length) % ids.length];
}

export function showNodeLabel(count: number, phone: boolean, emphasized: boolean) {
	return emphasized || count <= (phone ? 12 : 24);
}
