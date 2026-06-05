import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import { parseMarkdownNote } from '../state/markdown';
import type { GraphEdge, GraphNode, GraphNodeKind } from '../state/graph-index';
import { GRAPH_NODE_KINDS } from '../state/graph-index';
import type { GraphSourceKind } from '../state/graph-source-index';
import { getContentItemsForActor } from './content-query';
import {
	getSourceGraphIndexForActor,
	type SourceGraphAvailability,
} from './graph-source-index-query';
import { getSourceGraphDiagnosticsForActor } from './graph-source-index-query';
import type { GraphSourceDiagnostic } from '../state/graph-source-index';

/**
 * GRAPH-004 — the ACTOR-FILTERED GRAPH-VISUALIZATION view model: the single computed model a graph
 * visualization renders. A user filters the visible link graph by FOLDER, TAG, ENTITY TYPE, SOURCE,
 * RELATIONSHIP TYPE, and visibility-safe SEARCH TEXT, and receives the matching VISIBLE nodes + the
 * VISIBLE edges between them, plus the filter FACETS derived from the visible graph only.
 *
 * This does NOT compute a second graph. It COMPOSES the graph the prior GRAPH epics already build,
 * adding only the presentation-facing folder/tag enrichment and the deterministic filter pass on top
 * (Architecture Contract 1 — the Processing Core owns the graph algorithm; the GUI renders this computed,
 * actor-filtered model and navigates via existing links/commands only):
 *
 *   - The NODES + directed link EDGES + per-node SOURCE provenance come from
 *     {@link getSourceGraphIndexForActor} (GRAPH-001/008), which is itself built on the SAME
 *     visibility-and-tombstone content/map reads every GRAPH surface uses. A `dm-only` /
 *     `shared`-but-undelivered / soft-deleted / hidden node is never in that index, so it can never be a
 *     visualized node, an edge endpoint, a facet entry, or a count here (GRAPH-004 actor-filtering, fail
 *     closed; Cross-Contract Non-Negotiable 2). An unknown/unauthenticated actor receives the EMPTY model.
 *   - The FOLDER + TAGS of a note/object node are derived the SAME way the SRCH filter surface derives them
 *     (the `dndtools.folder` field and the parsed frontmatter `tags` + inline `#hashtags`), from the SAME
 *     actor-filtered {@link getContentItemsForActor} read — so a folder/tag facet only ever names content the
 *     actor can already see. Maps and POIs are unfiled and untagged.
 *   - The SOURCE filter reuses the GRAPH source taxonomy carried on each node's {@link GraphSourceRef}
 *     (`local-vault` / `obsidian-vault` / `google-docs` / future) — there is no parallel source enumeration.
 *   - The RELATIONSHIP-TYPE filter classifies each edge from its endpoints: a `poi-link` edge originates at a
 *     POI node (a POI pinning a visible entity); every other edge is a `wikilink`. Both endpoints are always
 *     visible nodes, so an edge never reveals a hidden node.
 *
 * THE FAIL-CLOSED FACET GUARANTEE (GRAPH-004): every facet option (folders, tags, sources, entity types,
 * relationship types) and every count is computed over the actor's VISIBLE graph ONLY. A player therefore
 * never sees a folder/tag/source/count that exists only because of hidden content — the facets are
 * indistinguishable from a vault that simply does not contain the hidden material.
 *
 * Pure + deterministic: the same (content, maps, session, permissions, actor, filter, availability) always
 * produces the same model; every list is sorted by a stable, total key so it is reproducible across fixtures.
 */

/** The `dndtools.folder` field a note/object is filed under (mirrors the SRCH filter derivation). */
const FOLDER_FIELD = 'dndtools.folder' as const;

/** The kind of relationship an edge represents in the visualization. */
export type GraphRelationshipKind = 'wikilink' | 'poi-link';

/** The relationship kinds the visualization can filter by, in stable order. */
export const GRAPH_RELATIONSHIP_KINDS: readonly GraphRelationshipKind[] = Object.freeze([
	'wikilink',
	'poi-link',
]);

/**
 * ONE node in the visualization view model: the structural {@link GraphNode} (id/kind/title) joined with the
 * presentation-facing FOLDER + TAGS (note/object only) and the SOURCE the node was indexed from. Every node
 * here is actor-visible. `folder`/`tags`/source are derived from the SAME actor-filtered reads, so they leak
 * nothing.
 */
export interface GraphVizNode {
	id: string;
	kind: GraphNodeKind;
	title: string;
	/** The folder the node is filed under (`dndtools.folder`), or `null` for unfiled/maps/POIs. */
	folder: string | null;
	/** The node's tags (lowercased, deduped). Maps/POIs carry none. */
	tags: string[];
	/** Which source the node was indexed from (`local-vault` / `obsidian-vault` / `google-docs` / future). */
	source: GraphSourceKind;
	/** The number of visible edges incident to this node WITHIN the filtered result (degree). */
	degree: number;
}

/** ONE edge in the visualization view model: the directed link edge + its classified relationship kind. */
export interface GraphVizEdge {
	fromId: string;
	toId: string;
	/** The title/alias the link named (already actor-safe). */
	via: string;
	/** The relationship kind: a POI-origin edge is a `poi-link`; everything else is a `wikilink`. */
	relationship: GraphRelationshipKind;
}

/**
 * The visibility-safe FILTER the user applies to the graph. EVERY facet is intersective (a node must satisfy
 * ALL provided facets to survive) and matched only against the actor's VISIBLE graph. An empty filter matches
 * the whole visible graph. Unknown facet values simply match nothing (fail closed — never a hidden node).
 */
export interface GraphVizFilter {
	/** Restrict to a single folder (exact match against the node's `dndtools.folder`). */
	folder?: string;
	/** Require ALL of these tags (lowercased) to be present on the node. */
	tags?: readonly string[];
	/** Restrict to these entity types (note/object/map/poi). */
	kinds?: readonly GraphNodeKind[];
	/** Restrict to these sources (`local-vault` / `obsidian-vault` / `google-docs` / future). */
	sources?: readonly GraphSourceKind[];
	/** Restrict the EDGES shown to these relationship kinds (`wikilink` / `poi-link`). */
	relationships?: readonly GraphRelationshipKind[];
	/** Free text matched (case-insensitive, trimmed) against a node's title, folder, or a tag. */
	text?: string;
}

/** The available filter FACETS, computed over the actor's VISIBLE graph only (never reveals hidden content). */
export interface GraphVizFacets {
	/** The distinct folders among visible nodes, sorted. */
	folders: string[];
	/** The distinct tags among visible nodes, sorted. */
	tags: string[];
	/** The distinct entity types present among visible nodes, in canonical kind order. */
	kinds: GraphNodeKind[];
	/** The distinct sources present among visible nodes, sorted. */
	sources: GraphSourceKind[];
	/** The relationship kinds present among visible edges, in canonical order. */
	relationships: GraphRelationshipKind[];
}

/**
 * The complete GRAPH-004 visualization view model: the FILTERED visible nodes + the visible edges between
 * them, the facets to drive the filter controls, the total visible-node count (before the filter, for the
 * "showing X of Y" affordance — both counts are over visible content only), and the source-metadata
 * diagnostics + a partial flag so the GUI can signal "some sources are behind" without blocking the cached
 * relationships that DID index (GRAPH-001 AC3). Every list is deterministically ordered.
 */
export interface GraphVisualization {
	/** The nodes that survive the filter, deterministically ordered (by kind, then title, then id). */
	nodes: GraphVizNode[];
	/** The directed edges whose BOTH endpoints survive the filter AND whose relationship kind is allowed. */
	edges: GraphVizEdge[];
	/** The filter facets, computed over the actor's VISIBLE (unfiltered) graph. */
	facets: GraphVizFacets;
	/** The number of visible nodes BEFORE the filter (the denominator for "showing X of Y"). */
	totalVisibleNodes: number;
	/** Whether the cached graph is partial because a configured source is not fully cached/available. */
	partial: boolean;
	/** Per-source metadata diagnostics (stale/partial sources), for a non-leaking status surface. */
	sourceDiagnostics: GraphSourceDiagnostic[];
}

/** Deterministic ordering for visualization nodes: by kind, then title, then id. Total tie-break. */
function compareNodes(a: GraphVizNode, b: GraphVizNode): number {
	const kindOrder = GRAPH_NODE_KINDS.indexOf(a.kind) - GRAPH_NODE_KINDS.indexOf(b.kind);
	if (kindOrder !== 0) return kindOrder;
	return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Deterministic ordering for visualization edges: by from id, then to id, then via. Total tie-break. */
function compareEdges(a: GraphVizEdge, b: GraphVizEdge): number {
	return a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId) || a.via.localeCompare(b.via);
}

/** The folder a content item is filed under (its `dndtools.folder` field), or `null` when unfiled. Pure. */
function itemFolder(fields: Record<string, unknown>): string | null {
	const raw = fields[FOLDER_FIELD];
	return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** Classify an edge from its endpoints: a POI-origin edge is a `poi-link`; everything else a `wikilink`. */
function classifyEdge(edge: GraphEdge, kindById: ReadonlyMap<string, GraphNodeKind>): GraphRelationshipKind {
	return kindById.get(edge.fromId) === 'poi' ? 'poi-link' : 'wikilink';
}

/**
 * GRAPH-004 — build the ACTOR-FILTERED visualization view model. Composes the GRAPH-001/008 source graph
 * (nodes + edges + provenance), enriches note/object nodes with folder + tags from the SAME actor-filtered
 * content read, then applies the visibility-safe filter (folder, tag, entity type, source, relationship type,
 * search text). An unknown/unauthenticated actor receives the EMPTY model (fail closed). Pure + deterministic.
 *
 * @param defaultSourceId the source the local records came from (always available — its content is cached).
 * @param filter          the visibility-safe filter; an empty filter shows the whole visible graph.
 * @param availability    additional configured sources to index across, with their cache availability.
 */
export function getGraphVisualizationForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	defaultSourceId: string,
	filter: GraphVizFilter = {},
	availability: SourceGraphAvailability = {},
): GraphVisualization {
	if (!permissions.actors[actorId]) return emptyGraphVisualization();

	// The actor's VISIBLE source graph (nodes + edges + per-node provenance). One graph, already filtered.
	const sourceIndex = getSourceGraphIndexForActor(
		content,
		maps,
		session,
		permissions,
		actorId,
		defaultSourceId,
		availability,
	);
	const graph = sourceIndex.graph;

	// The folder + tags for each note/object node come from the SAME actor-filtered content read the rest of
	// CONTENT/SRCH/GRAPH uses, so they can only ever name content the actor already sees (fail closed).
	const folderById = new Map<string, string | null>();
	const tagsById = new Map<string, string[]>();
	for (const view of getContentItemsForActor(content, permissions, actorId)) {
		folderById.set(view.id, itemFolder(view.fields));
		tagsById.set(
			view.id,
			parseMarkdownNote(view.body).tags.map((tag) => tag.toLowerCase()),
		);
	}

	// The structural kind of each node, used to classify edges and enrich nodes.
	const kindById = new Map<string, GraphNodeKind>(graph.nodes.map((node) => [node.id, node.kind]));

	// Project every visible node onto the view-model node (degree is filled in after the edge pass).
	const allNodes: GraphVizNode[] = graph.nodes.map((node: GraphNode) => ({
		id: node.id,
		kind: node.kind,
		title: node.title,
		folder: folderById.get(node.id) ?? null,
		tags: tagsById.get(node.id) ?? [],
		source: sourceIndex.sourceRefs[node.id]?.sourceKind ?? 'local-vault',
		degree: 0,
	}));

	// FACETS over the unfiltered visible graph (so a facet never reveals hidden content). Computed BEFORE the
	// filter is applied — the facets describe what the actor COULD filter by, not the current result.
	const facets = buildFacets(allNodes, graph.edges, kindById);
	const totalVisibleNodes = allNodes.length;

	// Apply the per-node facets (folder, tags, entity type, source, text). A node must satisfy ALL provided
	// facets to survive. The text needle matches a node's title, folder, or a tag — never hidden content.
	const needle = filter.text?.trim().toLowerCase() ?? '';
	const tagFilter = (filter.tags ?? []).map((tag) => tag.toLowerCase()).filter((tag) => tag !== '');
	const kindFilter = filter.kinds ? new Set(filter.kinds) : null;
	const sourceFilter = filter.sources ? new Set(filter.sources) : null;
	const survivors = allNodes.filter((node) => {
		if (filter.folder !== undefined && node.folder !== filter.folder) return false;
		if (tagFilter.length > 0 && !tagFilter.every((tag) => node.tags.includes(tag))) return false;
		if (kindFilter && !kindFilter.has(node.kind)) return false;
		if (sourceFilter && !sourceFilter.has(node.source)) return false;
		if (needle !== '' && !nodeMatchesText(node, needle)) return false;
		return true;
	});
	const survivorIds = new Set(survivors.map((node) => node.id));

	// Keep only the edges whose BOTH endpoints survived AND whose relationship kind is allowed (so filtering
	// by `map` shows only the visible map nodes and THEIR visible edges — GRAPH-004 AC1). A relationship-kind
	// filter narrows the edges WITHOUT dropping the nodes themselves.
	const relationshipFilter = filter.relationships ? new Set(filter.relationships) : null;
	const edges: GraphVizEdge[] = [];
	const degreeById = new Map<string, number>();
	for (const edge of graph.edges) {
		if (!survivorIds.has(edge.fromId) || !survivorIds.has(edge.toId)) continue;
		const relationship = classifyEdge(edge, kindById);
		if (relationshipFilter && !relationshipFilter.has(relationship)) continue;
		edges.push({ fromId: edge.fromId, toId: edge.toId, via: edge.via, relationship });
		degreeById.set(edge.fromId, (degreeById.get(edge.fromId) ?? 0) + 1);
		degreeById.set(edge.toId, (degreeById.get(edge.toId) ?? 0) + 1);
	}
	edges.sort(compareEdges);

	const nodes = survivors
		.map((node) => ({ ...node, degree: degreeById.get(node.id) ?? 0 }))
		.sort(compareNodes);

	return {
		nodes,
		edges,
		facets,
		totalVisibleNodes,
		partial:
			sourceIndex.status === 'partial' ||
			sourceIndex.status === 'stale' ||
			sourceIndex.status === 'unknown',
		sourceDiagnostics: getSourceGraphDiagnosticsForActor(sourceIndex),
	};
}

/** Whether the free-text needle matches a node's title, folder, or one of its tags (case-insensitive). Pure. */
function nodeMatchesText(node: GraphVizNode, needle: string): boolean {
	if (node.title.toLowerCase().includes(needle)) return true;
	if (node.folder !== null && node.folder.toLowerCase().includes(needle)) return true;
	return node.tags.some((tag) => tag.includes(needle));
}

/** Build the filter facets from the visible (unfiltered) node + edge set. Every list is sorted/deduped. Pure. */
function buildFacets(
	nodes: readonly GraphVizNode[],
	edges: readonly GraphEdge[],
	kindById: ReadonlyMap<string, GraphNodeKind>,
): GraphVizFacets {
	const folders = new Set<string>();
	const tags = new Set<string>();
	const kinds = new Set<GraphNodeKind>();
	const sources = new Set<GraphSourceKind>();
	for (const node of nodes) {
		if (node.folder !== null) folders.add(node.folder);
		for (const tag of node.tags) tags.add(tag);
		kinds.add(node.kind);
		sources.add(node.source);
	}
	const relationships = new Set<GraphRelationshipKind>();
	for (const edge of edges) relationships.add(classifyEdge(edge, kindById));
	return {
		folders: [...folders].sort((a, b) => a.localeCompare(b)),
		tags: [...tags].sort((a, b) => a.localeCompare(b)),
		kinds: GRAPH_NODE_KINDS.filter((kind) => kinds.has(kind)),
		sources: [...sources].sort((a, b) => a.localeCompare(b)),
		relationships: GRAPH_RELATIONSHIP_KINDS.filter((relationship) => relationships.has(relationship)),
	};
}

/** The fail-closed EMPTY visualization (an unknown actor, or a vault with no visible nodes). Pure. */
export function emptyGraphVisualization(): GraphVisualization {
	return {
		nodes: [],
		edges: [],
		facets: { folders: [], tags: [], kinds: [], sources: [], relationships: [] },
		totalVisibleNodes: 0,
		partial: false,
		sourceDiagnostics: [],
	};
}
