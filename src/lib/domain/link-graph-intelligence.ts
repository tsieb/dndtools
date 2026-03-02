import { extractWikilinks } from '$lib/domain/link-extractor.js';
import {
	extractAliasesFromFrontmatter,
	resolveLinkCandidates,
	type LinkResolutionEntry,
} from '$lib/domain/link-resolution.js';
import type { Note, NoteId } from '$lib/types/note.js';

export interface DeadLinkInsight {
	sourceId: NoteId;
	sourceTitle: string;
	targetLabel: string;
	count: number;
}

export interface HighCentralityInsight {
	noteId: NoteId;
	title: string;
	inbound: number;
	outbound: number;
	degree: number;
	betweenness: number;
}

export interface LinkLoopInsight {
	fromId: NoteId;
	fromTitle: string;
	toId: NoteId;
	toTitle: string;
}

export interface AliasMatchedLinkInsight {
	sourceId: NoteId;
	sourceTitle: string;
	targetId: NoteId;
	targetTitle: string;
	alias: string;
	count: number;
}

export interface CrossFolderLinkInsight {
	sourceId: NoteId;
	sourceTitle: string;
	sourceFolder: string;
	targetId: NoteId;
	targetTitle: string;
	targetFolder: string;
	count: number;
}

export interface LinkQualityTotals {
	totalLinks: number;
	brokenLinks: number;
	aliasMatchedLinks: number;
	loops: number;
	crossFolderLinkDensity: number;
}

export interface LinkQualityDrilldown {
	brokenLinkNoteIds: NoteId[];
	aliasMatchedNoteIds: NoteId[];
	loopNoteIds: NoteId[];
	crossFolderNoteIds: NoteId[];
}

export interface GraphStructureEdge {
	sourceId: string;
	targetId: string;
}

export interface GraphStructureHubInsight {
	noteId: string;
	inbound: number;
	outbound: number;
	degree: number;
	betweenness: number;
}

export interface GraphStructureInsights {
	orphanNoteIds: string[];
	hubNotes: GraphStructureHubInsight[];
	inboundById: Map<string, number>;
	outboundById: Map<string, number>;
}

export interface LinkGraphQualityReport {
	orphanNoteIds: NoteId[];
	deadLinks: DeadLinkInsight[];
	highCentrality: HighCentralityInsight[];
	totals: LinkQualityTotals;
	loops: LinkLoopInsight[];
	aliasMatchedLinks: AliasMatchedLinkInsight[];
	crossFolderLinks: CrossFolderLinkInsight[];
	drilldown: LinkQualityDrilldown;
}

function roundMetric(value: number): number {
	return Number.parseFloat(value.toFixed(3));
}

function normalizeEdgeKey(sourceId: string, targetId: string): string {
	return `${sourceId}->${targetId}`;
}

function buildBetweennessCentrality(
	nodeIds: string[],
	adjacency: Map<string, string[]>,
): Map<string, number> {
	const scores = new Map<string, number>();
	const predecessorMap = new Map<string, string[]>();
	const sigma = new Map<string, number>();
	const distance = new Map<string, number>();
	const delta = new Map<string, number>();
	for (const nodeId of nodeIds) {
		scores.set(nodeId, 0);
	}

	for (const source of nodeIds) {
		const stack: string[] = [];
		const queue: string[] = [source];

		predecessorMap.clear();
		sigma.clear();
		distance.clear();
		delta.clear();

		for (const nodeId of nodeIds) {
			predecessorMap.set(nodeId, []);
			sigma.set(nodeId, 0);
			distance.set(nodeId, -1);
			delta.set(nodeId, 0);
		}

		sigma.set(source, 1);
		distance.set(source, 0);

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;
			stack.push(current);
			const currentDistance = distance.get(current) ?? -1;
			const currentSigma = sigma.get(current) ?? 0;
			const neighbors = adjacency.get(current) ?? [];
			for (const neighbor of neighbors) {
				const neighborDistance = distance.get(neighbor) ?? -1;
				if (neighborDistance < 0) {
					distance.set(neighbor, currentDistance + 1);
					queue.push(neighbor);
				}
				if ((distance.get(neighbor) ?? -1) === currentDistance + 1) {
					sigma.set(neighbor, (sigma.get(neighbor) ?? 0) + currentSigma);
					predecessorMap.get(neighbor)?.push(current);
				}
			}
		}

		while (stack.length > 0) {
			const nodeId = stack.pop();
			if (!nodeId) continue;
			const nodeSigma = sigma.get(nodeId) ?? 0;
			if (nodeSigma <= 0) continue;
			const predecessors = predecessorMap.get(nodeId) ?? [];
			for (const predecessor of predecessors) {
				const predecessorSigma = sigma.get(predecessor) ?? 0;
				if (predecessorSigma <= 0) continue;
				const value = (predecessorSigma / nodeSigma) * (1 + (delta.get(nodeId) ?? 0));
				delta.set(predecessor, (delta.get(predecessor) ?? 0) + value);
			}
			if (nodeId !== source) {
				scores.set(nodeId, (scores.get(nodeId) ?? 0) + (delta.get(nodeId) ?? 0));
			}
		}
	}

	return scores;
}

export function computeGraphStructureInsights(input: {
	nodeIds: string[];
	edges: GraphStructureEdge[];
	hubLimit?: number;
}): GraphStructureInsights {
	const hubLimit = input.hubLimit ?? 8;
	const nodeIdSet = new Set(input.nodeIds);
	const inboundById = new Map<string, number>();
	const outboundById = new Map<string, number>();
	const adjacency = new Map<string, Set<string>>();
	for (const nodeId of input.nodeIds) {
		inboundById.set(nodeId, 0);
		outboundById.set(nodeId, 0);
		adjacency.set(nodeId, new Set());
	}

	for (const edge of input.edges) {
		if (!nodeIdSet.has(edge.sourceId) || !nodeIdSet.has(edge.targetId)) continue;
		const neighbors = adjacency.get(edge.sourceId);
		if (!neighbors || neighbors.has(edge.targetId)) continue;
		neighbors.add(edge.targetId);
		outboundById.set(edge.sourceId, (outboundById.get(edge.sourceId) ?? 0) + 1);
		inboundById.set(edge.targetId, (inboundById.get(edge.targetId) ?? 0) + 1);
	}

	const orphanNoteIds = input.nodeIds
		.filter((nodeId) => (inboundById.get(nodeId) ?? 0) + (outboundById.get(nodeId) ?? 0) === 0)
		.sort((a, b) => a.localeCompare(b));

	const adjacencyList = new Map<string, string[]>();
	for (const [nodeId, neighbors] of adjacency.entries()) {
		adjacencyList.set(nodeId, [...neighbors]);
	}
	const betweenness = buildBetweennessCentrality(input.nodeIds, adjacencyList);
	const hubNotes = input.nodeIds
		.map((nodeId) => {
			const inbound = inboundById.get(nodeId) ?? 0;
			const outbound = outboundById.get(nodeId) ?? 0;
			const degree = inbound + outbound;
			const score = betweenness.get(nodeId) ?? 0;
			return {
				noteId: nodeId,
				inbound,
				outbound,
				degree,
				betweenness: roundMetric(score),
			};
		})
		.filter((entry) => entry.betweenness > 0)
		.sort((a, b) => {
			if (a.betweenness !== b.betweenness) return b.betweenness - a.betweenness;
			if (a.degree !== b.degree) return b.degree - a.degree;
			if (a.inbound !== b.inbound) return b.inbound - a.inbound;
			if (a.outbound !== b.outbound) return b.outbound - a.outbound;
			return a.noteId.localeCompare(b.noteId);
		})
		.slice(0, hubLimit);

	return {
		orphanNoteIds,
		hubNotes,
		inboundById,
		outboundById,
	};
}

export function buildLinkGraphQualityReport(input: {
	notes: Note[];
	resolveTitle?: (title: string) => NoteId | null;
	highCentralityLimit?: number;
}): LinkGraphQualityReport {
	const limit = input.highCentralityLimit ?? 8;
	const active = input.notes.filter((note) => !note.deleted);
	const activeIdSet = new Set(active.map((note) => String(note.id)));
	const noteById = new Map(active.map((note) => [String(note.id), note]));
	const resolutionEntries: LinkResolutionEntry[] = active.map((note) => ({
		id: String(note.id),
		title: note.title,
		updatedAt: note.updatedAt,
		aliases: extractAliasesFromFrontmatter(note.frontmatter),
		folder: String(note.folder),
	}));

	const seenEdges = new Set<string>();
	const deadBySourceAndTarget = new Map<string, DeadLinkInsight>();
	const edgeReferenceCounts = new Map<string, number>();
	const aliasMatches = new Map<string, AliasMatchedLinkInsight>();
	let totalLinks = 0;
	let brokenLinks = 0;
	let aliasMatchedLinks = 0;

	function addDeadLink(source: Note, targetLabel: string): void {
		const deadKey = `${source.id}::${targetLabel}`;
		const existing = deadBySourceAndTarget.get(deadKey);
		if (existing) {
			existing.count += 1;
		} else {
			deadBySourceAndTarget.set(deadKey, {
				sourceId: source.id,
				sourceTitle: source.title,
				targetLabel,
				count: 1,
			});
		}
		brokenLinks += 1;
	}

	for (const source of active) {
		for (const link of extractWikilinks(source.content)) {
			totalLinks += 1;

			let targetId: string | null;
			let resolvedBy: 'id' | 'title' | 'alias';
			let resolvedAlias: string | null = null;

			if (link.targetIdHint) {
				if (!activeIdSet.has(link.targetIdHint)) {
					addDeadLink(source, link.displayText || link.title);
					continue;
				}
				targetId = link.targetIdHint;
				resolvedBy = 'id';
			} else {
				const candidates = resolveLinkCandidates(link.title, resolutionEntries);
				if (candidates.length !== 1) {
					addDeadLink(source, link.title);
					continue;
				}
				const winner = candidates[0]!;
				targetId = winner.id;
				resolvedBy = winner.matchedBy;
				resolvedAlias = winner.matchedAlias ?? null;
			}

			if (!targetId || !activeIdSet.has(targetId)) {
				addDeadLink(source, link.displayText || link.title);
				continue;
			}

			const edgeKey = normalizeEdgeKey(String(source.id), String(targetId));
			edgeReferenceCounts.set(edgeKey, (edgeReferenceCounts.get(edgeKey) ?? 0) + 1);

			if (resolvedBy === 'alias') {
				aliasMatchedLinks += 1;
				const aliasKey = `${source.id}::${targetId}::${resolvedAlias ?? ''}`;
				const existing = aliasMatches.get(aliasKey);
				if (existing) {
					existing.count += 1;
				} else {
					const target = noteById.get(String(targetId));
					aliasMatches.set(aliasKey, {
						sourceId: source.id,
						sourceTitle: source.title,
						targetId: targetId as NoteId,
						targetTitle: target?.title ?? 'Unknown',
						alias: resolvedAlias ?? link.title,
						count: 1,
					});
				}
			}

			if (seenEdges.has(edgeKey)) continue;
			seenEdges.add(edgeKey);
		}
	}

	const uniqueEdges = [...seenEdges].map((edgeKey) => {
		const [sourceId, targetId] = edgeKey.split('->');
		return {
			sourceId: sourceId ?? '',
			targetId: targetId ?? '',
		};
	});
	const structure = computeGraphStructureInsights({
		nodeIds: active.map((note) => String(note.id)),
		edges: uniqueEdges,
		hubLimit: limit,
	});
	const orphanNoteIds = structure.orphanNoteIds.map((noteId) => noteId as NoteId);

	const deadLinks = [...deadBySourceAndTarget.values()].sort((a, b) => {
		if (a.count !== b.count) return b.count - a.count;
		const sourceDiff = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
			sensitivity: 'base',
		});
		if (sourceDiff !== 0) return sourceDiff;
		return a.targetLabel.localeCompare(b.targetLabel, undefined, { sensitivity: 'base' });
	});

	const highCentrality = structure.hubNotes
		.map((entry) => {
			const note = noteById.get(entry.noteId);
			return {
				noteId: entry.noteId as NoteId,
				title: note?.title ?? 'Unknown',
				inbound: entry.inbound,
				outbound: entry.outbound,
				degree: entry.degree,
				betweenness: entry.betweenness,
			};
		})
		.sort((a, b) => {
			if (a.betweenness !== b.betweenness) return b.betweenness - a.betweenness;
			if (a.inbound !== b.inbound) return b.inbound - a.inbound;
			if (a.outbound !== b.outbound) return b.outbound - a.outbound;
			return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
		})
		.slice(0, limit);

	const loopPairs: LinkLoopInsight[] = [];
	for (const edge of uniqueEdges) {
		const sourceId = edge.sourceId;
		const targetId = edge.targetId;
		if (!sourceId || !targetId) continue;
		if (sourceId >= targetId) continue;
		const forwardKey = normalizeEdgeKey(sourceId, targetId);
		const backwardKey = normalizeEdgeKey(targetId, sourceId);
		if (!seenEdges.has(forwardKey) || !seenEdges.has(backwardKey)) continue;
		const source = noteById.get(sourceId);
		const target = noteById.get(targetId);
		if (!source || !target) continue;
		loopPairs.push({
			fromId: source.id,
			fromTitle: source.title,
			toId: target.id,
			toTitle: target.title,
		});
	}
	loopPairs.sort((a, b) => {
		const first = a.fromTitle.localeCompare(b.fromTitle, undefined, { sensitivity: 'base' });
		if (first !== 0) return first;
		return a.toTitle.localeCompare(b.toTitle, undefined, { sensitivity: 'base' });
	});

	const crossFolderLinks: CrossFolderLinkInsight[] = [];
	let crossFolderReferenceCount = 0;
	for (const [edgeKey, count] of edgeReferenceCounts.entries()) {
		const [sourceId, targetId] = edgeKey.split('->');
		if (!sourceId || !targetId) continue;
		const source = noteById.get(sourceId);
		const target = noteById.get(targetId);
		if (!source || !target) continue;
		if (String(source.folder) === String(target.folder)) continue;
		crossFolderReferenceCount += count;
		crossFolderLinks.push({
			sourceId: source.id,
			sourceTitle: source.title,
			sourceFolder: String(source.folder),
			targetId: target.id,
			targetTitle: target.title,
			targetFolder: String(target.folder),
			count,
		});
	}
	crossFolderLinks.sort((a, b) => {
		if (a.count !== b.count) return b.count - a.count;
		const sourceDiff = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
			sensitivity: 'base',
		});
		if (sourceDiff !== 0) return sourceDiff;
		return a.targetTitle.localeCompare(b.targetTitle, undefined, { sensitivity: 'base' });
	});

	const aliasMatchedLinksDetails = [...aliasMatches.values()].sort((a, b) => {
		if (a.count !== b.count) return b.count - a.count;
		const sourceDiff = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
			sensitivity: 'base',
		});
		if (sourceDiff !== 0) return sourceDiff;
		const targetDiff = a.targetTitle.localeCompare(b.targetTitle, undefined, {
			sensitivity: 'base',
		});
		if (targetDiff !== 0) return targetDiff;
		return a.alias.localeCompare(b.alias, undefined, { sensitivity: 'base' });
	});

	const drilldown = {
		brokenLinkNoteIds: [...new Set(deadLinks.map((entry) => entry.sourceId))],
		aliasMatchedNoteIds: [
			...new Set(aliasMatchedLinksDetails.flatMap((entry) => [entry.sourceId, entry.targetId])),
		],
		loopNoteIds: [...new Set(loopPairs.flatMap((entry) => [entry.fromId, entry.toId]))],
		crossFolderNoteIds: [
			...new Set(crossFolderLinks.flatMap((entry) => [entry.sourceId, entry.targetId])),
		],
	};

	return {
		orphanNoteIds,
		deadLinks,
		highCentrality,
		totals: {
			totalLinks,
			brokenLinks,
			aliasMatchedLinks,
			loops: loopPairs.length,
			crossFolderLinkDensity:
				totalLinks === 0 ? 0 : roundMetric(crossFolderReferenceCount / totalLinks),
		},
		loops: loopPairs,
		aliasMatchedLinks: aliasMatchedLinksDetails,
		crossFolderLinks,
		drilldown,
	};
}
