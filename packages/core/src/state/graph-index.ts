import { extractWikilinks } from './markdown';
import {
	EMPTY_INDEX_CURSOR,
	domainFreshnessStatus,
	publishDomainFreshness,
	type SearchDomainFreshness,
	type SearchDomainFreshnessStatus,
	type SearchDomainIndex,
	type SearchIndexCursor,
} from './search-index';

/**
 * GRAPH-005 — the PURE DETERMINISTIC INCREMENTAL GRAPH-INDEX engine: it builds the vault's link graph
 * (NODES + directed link EDGES) over a set of {@link GraphNodeRecord}s, computes the DELTA between two
 * graph snapshots, APPLIES an incremental update that touches ONLY the affected nodes/edges and the
 * dependent reverse (backlink) index, and tracks per-graph FRESHNESS so a stale/partial graph signals
 * staleness rather than serving confidently-wrong results.
 *
 * Everything here is a PURE function of its explicit inputs (a set of node records, or two snapshots, or a
 * snapshot + a change). It NEVER reads ambient state, storage, a clock, an id generator, or a real
 * transport. The ACTOR-FILTERED surface lives in the query layer (`queries/graph-index-query.ts`), which
 * feeds this engine ONLY the nodes — and the visible link targets — the actor may see. Because the engine
 * is fed only visible records, a node, an edge, a delta entry, or a freshness cursor can NEVER name or
 * reveal a node the actor cannot see (GRAPH-005 actor-filtering, fail closed; Cross-Contract
 * Non-Negotiable 2). An incremental update over the actor's visible set can therefore never surface a
 * hidden/DM-only node or edge.
 *
 * This COMPOSES the existing graph surfaces rather than introducing a second relationship source. The link
 * EDGES are the SAME `[[wikilink]]` edges the CONTENT/GRAPH surfaces parse (via {@link extractWikilinks}),
 * resolved against the SAME title/alias index `state/wikilink-graph.ts` and `state/note-relationships.ts`
 * use — so a backlink derived from this index is exactly the backlink the relationship surface would show.
 * The FRESHNESS model reuses the SRCH index-cursor + freshness convention WHOLESALE
 * (`state/search-index.ts`): the same {@link SearchIndexCursor} shape, the same
 * `fresh`/`partial`/`stale`/`unknown` statuses, and the same fail-closed rule that an UNPROVEN or
 * UNAVAILABLE index is `stale`/`unknown`, never `fresh`. There is NO parallel freshness convention.
 *
 * "Incremental" is the keystone: {@link applyGraphChange} updates ONLY the nodes/edges a single accepted
 * change touches (an upserted/removed note, object, map, POI, or sync op) plus the dependent reverse index,
 * WITHOUT rebuilding the whole graph. A HARD determinism requirement backs this: {@link buildGraphIndex}
 * (a full recompute) and a sequence of {@link applyGraphChange}s CONVERGE to the SAME graph for the same
 * inputs — {@link graphsEqual} / {@link diffGraphIndex} prove it, and the tests assert incremental == full.
 *
 * When an incremental update FAILS (a change cannot be applied deterministically), {@link markGraphStale}
 * marks the graph stale and {@link graphRepairSignal} exposes that a repair/REINDEX (a full rebuild) is
 * required — the graph signals staleness rather than serving a half-applied, confidently-wrong result.
 *
 * The Processing Core owns the graph algorithm; the GUI renders the computed model (Architecture Contract 1).
 */

export const GRAPH_INDEX_SCHEMA_VERSION = 1 as const;

/** Which kind of vault entity a graph node represents (the change DOMAINS GRAPH-005 indexes incrementally). */
export type GraphNodeKind = 'note' | 'object' | 'map' | 'poi';

export const GRAPH_NODE_KINDS: readonly GraphNodeKind[] = Object.freeze([
	'note',
	'object',
	'map',
	'poi',
]);

/**
 * ONE node as fed to the incremental graph engine: its id/kind/title + the names that resolve to it
 * (title + aliases), and the raw `[[...]]` link targets it authored (in document order). A record only ever
 * appears here for an actor-VISIBLE entity, so deriving a node/edge from it leaks nothing. The link TARGETS
 * are resolved against the visible name index, so a link to a hidden/missing target simply yields no edge.
 */
export interface GraphNodeRecord {
	/** The entity id the node resolves to (content item id, map id, POI id…). */
	id: string;
	/** Which kind of entity the node represents. */
	kind: GraphNodeKind;
	/** The canonical title a link names (and the title the reverse index resolves by). */
	title: string;
	/** Alternate names (Obsidian `aliases`) that also resolve to this node. */
	aliases: string[];
	/** The raw `[[...]]` link targets this node authored, in document order (duplicates collapsed per target). */
	outboundTargets: string[];
	/**
	 * The entity REVISION this record reflects (monotonic per entity). Advances the graph's indexed cursor on
	 * each accepted change, mirroring the SRCH index-cursor convention. 0 for an unrevisioned node (e.g. a POI).
	 */
	revision: number;
}

/** ONE graph node in the built index: identity + kind, exposed for navigation/search/widgets/MCP. */
export interface GraphNode {
	id: string;
	kind: GraphNodeKind;
	title: string;
}

/**
 * ONE directed link EDGE between two VISIBLE graph nodes: `fromId` authored a `[[wikilink]]` that resolved
 * to `toId`. Both endpoints are always in the visible node set, so an edge never reveals a hidden node
 * (GRAPH-005 fail closed). The `via` name is the title/alias the link named (already actor-safe).
 */
export interface GraphEdge {
	/** The id of the node that authored the link. */
	fromId: string;
	/** The id of the node the link resolved to. */
	toId: string;
	/** The title/alias the link named (the actor-safe display the edge was matched by). */
	via: string;
}

/**
 * The complete, DETERMINISTIC link graph over a set of visible node records: the nodes + directed edges,
 * plus the small rebuildable INDEX bookkeeping (the per-graph cursor + availability + a stale flag) that
 * lets the engine publish FRESHNESS and signal a required reindex. Every list is sorted by a stable, TOTAL
 * key so the graph is reproducible across fresh fixtures whose volatile ids differ and across repeated runs.
 */
export interface GraphIndex {
	schemaVersion: typeof GRAPH_INDEX_SCHEMA_VERSION;
	/** The visible graph nodes, deterministically ordered (by kind, then title, then id). */
	nodes: GraphNode[];
	/** The directed link edges between visible nodes, deterministically ordered. */
	edges: GraphEdge[];
	/** The cursor the index has CONSUMED (advances on each accepted incremental change). */
	indexedCursor: SearchIndexCursor;
	/** Whether the graph's source is currently available. `false` ⇒ fail-closed `stale`. */
	available: boolean;
	/**
	 * Whether an incremental update FAILED and the index is known half-applied / behind. `true` forces the
	 * graph `stale` and {@link graphRepairSignal} to require a reindex — the graph signals staleness rather
	 * than serving a confidently-wrong result (GRAPH-005 AC2).
	 */
	stale: boolean;
}

/** Normalize a title/alias/target for case-insensitive, trimmed matching. Deterministic. Mirrors the rest of GRAPH. */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/** Deterministic ordering for graph nodes: by kind, then title, then id. Total tie-break. */
function compareNodes(a: GraphNode, b: GraphNode): number {
	const kindOrder = GRAPH_NODE_KINDS.indexOf(a.kind) - GRAPH_NODE_KINDS.indexOf(b.kind);
	if (kindOrder !== 0) return kindOrder;
	return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Deterministic ordering for graph edges: by from id, then to id, then via name. Total tie-break. */
function compareEdges(a: GraphEdge, b: GraphEdge): number {
	return a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId) || a.via.localeCompare(b.via);
}

/** The unique distinct outbound targets a record names (collapsed by normalized name, first raw form kept). */
function distinctTargets(record: GraphNodeRecord): { raw: string; normalized: string }[] {
	const seen = new Set<string>();
	const targets: { raw: string; normalized: string }[] = [];
	for (const raw of record.outboundTargets) {
		const normalized = normalizeName(raw);
		if (normalized === '' || seen.has(normalized)) continue;
		seen.add(normalized);
		targets.push({ raw, normalized });
	}
	return targets;
}

/**
 * Build the NAME → node-id resolution index from a set of records (title + aliases). When two records claim
 * the same name the lexicographically-smaller id wins deterministically, so resolution is reproducible.
 * Pure.
 */
function buildNameIndex(records: readonly GraphNodeRecord[]): Map<string, string> {
	const idByName = new Map<string, string>();
	const claim = (name: string, id: string): void => {
		const normalized = normalizeName(name);
		if (normalized === '') return;
		const existing = idByName.get(normalized);
		if (existing === undefined || id.localeCompare(existing) < 0) idByName.set(normalized, id);
	};
	for (const record of records) {
		claim(record.title, record.id);
		for (const alias of record.aliases) claim(alias, record.id);
	}
	return idByName;
}

/** Project a record onto its exposed node shape (drops the link/alias detail the edges already capture). */
function toNode(record: GraphNodeRecord): GraphNode {
	return { id: record.id, kind: record.kind, title: record.title };
}

/**
 * GRAPH-005 — FULL RECOMPUTE: build the complete link graph over the provided VISIBLE node records. Emits
 * one node per record and one directed edge per distinct outbound `[[wikilink]]` that resolves to ANOTHER
 * visible node. A link to a target absent from the visible set yields NO edge (fail closed — a player can
 * never probe a dangling link to learn a hidden node exists; a stale link degrades gracefully). The index
 * cursor is derived from the records (count + max revision) so a freshly-built index over the records is
 * `fresh` against itself. Pure + deterministic; every list has a total tie-breaker.
 *
 * This is the reference a sequence of {@link applyGraphChange}s must CONVERGE to (incremental == full).
 */
export function buildGraphIndex(records: readonly GraphNodeRecord[]): GraphIndex {
	const nodes = records.map(toNode).sort(compareNodes);
	const idByName = buildNameIndex(records);
	const recordIds = new Set(records.map((record) => record.id));

	const edges: GraphEdge[] = [];
	for (const record of records) {
		for (const target of distinctTargets(record)) {
			const toId = idByName.get(target.normalized);
			// No resolution, or a self-link, or a target outside the visible set ⇒ no edge (fail closed).
			if (toId === undefined || toId === record.id || !recordIds.has(toId)) continue;
			edges.push({ fromId: record.id, toId, via: target.raw.trim() });
		}
	}
	edges.sort(compareEdges);

	return {
		schemaVersion: GRAPH_INDEX_SCHEMA_VERSION,
		nodes,
		edges,
		indexedCursor: deriveGraphCursor(records),
		available: true,
		stale: false,
	};
}

/**
 * Derive the graph's indexed CURSOR from a set of records: the `sequence` is the record count (a monotonic
 * proxy for "how much there is to index"), the `revision` is the max record revision, and `updatedAt` is
 * left `null` (the engine carries no clock — the query layer/caller stamps a timestamp when it has one).
 * Mirrors the SRCH source-cursor derivation (count + max visible revision). Pure.
 */
function deriveGraphCursor(records: readonly GraphNodeRecord[]): SearchIndexCursor {
	let revision = 0;
	for (const record of records) {
		if (record.revision > revision) revision = record.revision;
	}
	return { sequence: records.length, revision, updatedAt: null };
}

/** The fail-closed EMPTY graph (an unknown actor, or a vault with no visible nodes). Pure. */
export function emptyGraphIndex(): GraphIndex {
	return {
		schemaVersion: GRAPH_INDEX_SCHEMA_VERSION,
		nodes: [],
		edges: [],
		indexedCursor: { ...EMPTY_INDEX_CURSOR },
		available: true,
		stale: false,
	};
}

/**
 * GRAPH-005 — the BACKLINKS of one node, derived from a built {@link GraphIndex} (the dependent REVERSE
 * index). Every backlink source is a visible node, so a backlink never reveals a hidden node. When the node
 * is not in the visible graph — hidden, deleted, or never indexed — the list is empty (fail closed,
 * indistinguishable from "has no backlinks"). Pure + deterministic.
 */
export function backlinksOf(index: GraphIndex, nodeId: string): GraphNode[] {
	const nodeById = new Map(index.nodes.map((node) => [node.id, node]));
	if (!nodeById.has(nodeId)) return [];
	const sourceIds = new Set<string>();
	for (const edge of index.edges) {
		if (edge.toId === nodeId) sourceIds.add(edge.fromId);
	}
	return [...sourceIds]
		.map((id) => nodeById.get(id))
		.filter((node): node is GraphNode => node !== undefined)
		.sort(compareNodes);
}

/**
 * GRAPH-005 — the FORWARD links (related nodes) of one node, derived from a built {@link GraphIndex}. Every
 * related node is a visible node, so the list never reveals a hidden node. An unknown/hidden node yields the
 * empty list (fail closed). Pure + deterministic.
 */
export function forwardLinksOf(index: GraphIndex, nodeId: string): GraphNode[] {
	const nodeById = new Map(index.nodes.map((node) => [node.id, node]));
	if (!nodeById.has(nodeId)) return [];
	const targetIds = new Set<string>();
	for (const edge of index.edges) {
		if (edge.fromId === nodeId) targetIds.add(edge.toId);
	}
	return [...targetIds]
		.map((id) => nodeById.get(id))
		.filter((node): node is GraphNode => node !== undefined)
		.sort(compareNodes);
}

/** ONE accepted change to the graph: a node was UPSERTED (created/updated) or REMOVED (deleted/hidden). */
export type GraphChange =
	| {
			op: 'upsert';
			/** The full record AFTER the change. Re-resolves this node's outbound edges + dependent backlinks. */
			record: GraphNodeRecord;
	  }
	| {
			op: 'remove';
			/** The id of the node that was deleted or became hidden to the actor. Drops its node + all its edges. */
			nodeId: string;
	  };

/**
 * Reconstruct the records the index was built from is NOT possible (the index drops the link/alias detail),
 * so the incremental path keeps the SOURCE records alongside the built index. {@link GraphIndexState} pairs
 * the built graph with the records it was built from, so an incremental change can re-resolve edges against
 * the up-to-date name index WITHOUT a full markdown reparse of every note (only the changed node is
 * reparsed by the query layer). This is the "only affected nodes/edges update" guarantee (GRAPH-005 AC1).
 */
export interface GraphIndexState {
	/** The records the graph is currently built from (keyed by id for incremental upsert/remove). */
	records: Record<string, GraphNodeRecord>;
	/** The built graph over those records. */
	index: GraphIndex;
}

/** Build a {@link GraphIndexState} from a set of records (full build). Pure. */
export function buildGraphIndexState(records: readonly GraphNodeRecord[]): GraphIndexState {
	const byId: Record<string, GraphNodeRecord> = {};
	for (const record of records) byId[record.id] = record;
	return { records: byId, index: buildGraphIndex(records) };
}

/** The empty incremental graph state. Pure. */
export function emptyGraphIndexState(): GraphIndexState {
	return { records: {}, index: emptyGraphIndex() };
}

/**
 * GRAPH-005 AC1 — apply ONE accepted change INCREMENTALLY. Only the changed node's record is upserted/removed
 * and the graph is recomputed over the UPDATED record set, so only the affected nodes/edges (and the
 * dependent reverse/backlink index, which is derived from edges) change. The result CONVERGES to exactly what
 * a full {@link buildGraphIndex} over the same final record set would produce — the tests assert this. Because
 * the change only ever carries an actor-VISIBLE record (or removes a now-hidden node), an incremental update
 * can never introduce a hidden node/edge (fail closed). Pure + deterministic.
 *
 * (Recomputing the small derived graph over the in-memory record map is intentional: the EXPENSIVE work
 * GRAPH-005 avoids is the full-VAULT markdown REPARSE — only the changed node is reparsed upstream by the
 * query layer; this engine never reparses an unchanged node's body. The record map IS the incremental cache.)
 */
export function applyGraphChange(state: GraphIndexState, change: GraphChange): GraphIndexState {
	const records = { ...state.records };
	if (change.op === 'remove') {
		if (!(change.nodeId in records)) {
			// Removing an unknown node is a no-op (idempotent — a remove that already happened changes nothing).
			return state;
		}
		delete records[change.nodeId];
	} else {
		records[change.record.id] = change.record;
	}
	const index = buildGraphIndex(Object.values(records));
	// Preserve the availability + stale signal across the incremental update (a change does not clear an
	// unavailable source or a prior failure unless the caller explicitly recovers it).
	return {
		records,
		index: { ...index, available: state.index.available, stale: state.index.stale },
	};
}

/** ONE entry in a graph DELTA: a node/edge that was ADDED or REMOVED between two snapshots. */
export interface GraphNodeDelta {
	op: 'added' | 'removed';
	node: GraphNode;
}

export interface GraphEdgeDelta {
	op: 'added' | 'removed';
	edge: GraphEdge;
}

/** The DELTA between two graph snapshots: the nodes + edges that changed. Empty ⇒ the graphs are identical. */
export interface GraphIndexDelta {
	nodes: GraphNodeDelta[];
	edges: GraphEdgeDelta[];
}

/** A stable key identifying a node by identity (id + kind + title — a retitled node is a change). */
function nodeKey(node: GraphNode): string {
	return `${node.id} ${node.kind} ${node.title}`;
}

/** A stable key identifying an edge (from + to + via). */
function edgeKey(edge: GraphEdge): string {
	return `${edge.fromId} ${edge.toId} ${edge.via}`;
}

/**
 * GRAPH-005 — compute the DELTA from `before` to `after`: the nodes + edges that were ADDED or REMOVED. A
 * node/edge present in both is unchanged and absent from the delta. This is how the engine SERVES the graph
 * incrementally to a consumer that already holds `before` (send only what changed), and — critically — how
 * the tests PROVE incremental == full: the delta between the incrementally-maintained graph and a full
 * recompute over the same inputs must be EMPTY. Pure + deterministic; every list is sorted.
 */
export function diffGraphIndex(before: GraphIndex, after: GraphIndex): GraphIndexDelta {
	const beforeNodes = new Map(before.nodes.map((node) => [nodeKey(node), node]));
	const afterNodes = new Map(after.nodes.map((node) => [nodeKey(node), node]));
	const nodeDeltas: GraphNodeDelta[] = [];
	for (const [key, node] of afterNodes) {
		if (!beforeNodes.has(key)) nodeDeltas.push({ op: 'added', node });
	}
	for (const [key, node] of beforeNodes) {
		if (!afterNodes.has(key)) nodeDeltas.push({ op: 'removed', node });
	}
	nodeDeltas.sort(
		(a, b) => a.op.localeCompare(b.op) || compareNodes(a.node, b.node),
	);

	const beforeEdges = new Map(before.edges.map((edge) => [edgeKey(edge), edge]));
	const afterEdges = new Map(after.edges.map((edge) => [edgeKey(edge), edge]));
	const edgeDeltas: GraphEdgeDelta[] = [];
	for (const [key, edge] of afterEdges) {
		if (!beforeEdges.has(key)) edgeDeltas.push({ op: 'added', edge });
	}
	for (const [key, edge] of beforeEdges) {
		if (!afterEdges.has(key)) edgeDeltas.push({ op: 'removed', edge });
	}
	edgeDeltas.sort((a, b) => a.op.localeCompare(b.op) || compareEdges(a.edge, b.edge));

	return { nodes: nodeDeltas, edges: edgeDeltas };
}

/**
 * GRAPH-005 — whether two graphs are STRUCTURALLY identical (same nodes + same edges, ignoring the
 * bookkeeping cursor/availability/stale flags). The incremental==full convergence proof: a sequence of
 * {@link applyGraphChange}s yields a graph that `graphsEqual` a full {@link buildGraphIndex} over the same
 * final records. Pure.
 */
export function graphsEqual(a: GraphIndex, b: GraphIndex): boolean {
	const delta = diffGraphIndex(a, b);
	return delta.nodes.length === 0 && delta.edges.length === 0;
}

/**
 * GRAPH-005 AC2 — mark a graph STALE because an incremental update FAILED (it could not be applied
 * deterministically — e.g. a malformed change, or a caller that detected divergence). A stale graph forces
 * its freshness to `stale` and {@link graphRepairSignal} to require a REINDEX, so the graph signals
 * staleness rather than serving a half-applied, confidently-wrong result (fail closed). Pure.
 */
export function markGraphStale(index: GraphIndex): GraphIndex {
	if (index.stale) return index;
	return { ...index, stale: true };
}

/**
 * Mark a graph's source AVAILABILITY. An unavailable source forces the graph `stale` (its cached graph is
 * known-behind) WITHOUT discarding the cached nodes/edges — they still serve, just flagged stale. Pure.
 */
export function setGraphAvailability(index: GraphIndex, available: boolean): GraphIndex {
	if (index.available === available) return index;
	return { ...index, available };
}

/**
 * Project the graph's bookkeeping onto the SRCH {@link SearchDomainIndex} shape so its FRESHNESS is computed
 * by the SAME `domainFreshnessStatus`/`publishDomainFreshness` the SRCH index uses — reusing the convention,
 * not reinventing it. A stale graph forces the source cursor strictly AHEAD of the indexed cursor so the
 * shared status function reports `stale`/`partial` (it never special-cases the graph). Pure.
 */
function asDomainIndex(index: GraphIndex): SearchDomainIndex {
	const indexedCursor = { ...index.indexedCursor };
	// A stale graph models "the source advanced past what the index consumed": push the source cursor one
	// ahead so the shared freshness function grades it `stale`/`partial` exactly as it would the SRCH index.
	const sourceCursor: SearchIndexCursor = index.stale
		? {
				sequence: indexedCursor.sequence + 1,
				revision: indexedCursor.revision,
				updatedAt: indexedCursor.updatedAt,
		  }
		: { ...indexedCursor };
	return { domain: 'note', indexedCursor, sourceCursor, available: index.available };
}

/**
 * GRAPH-005 — the FRESHNESS status of a graph (`fresh` | `partial` | `stale` | `unknown`), computed by the
 * SAME shared SRCH freshness function — so the graph and the search index speak ONE freshness language.
 * Fail-closed: an unavailable source or a `stale`-marked graph is never `fresh`. Pure.
 */
export function graphFreshnessStatus(index: GraphIndex): SearchDomainFreshnessStatus {
	return domainFreshnessStatus(asDomainIndex(index));
}

/** The published graph freshness (status + indexed/source cursors + behind-by), reusing the SRCH publisher. */
export function publishGraphFreshness(index: GraphIndex): SearchDomainFreshness {
	return publishDomainFreshness(asDomainIndex(index));
}

/**
 * GRAPH-005 AC2 — the REPAIR / REINDEX signal for a graph. When the graph is stale (an incremental update
 * failed) or its source is unavailable, the consumer is told a REINDEX (a full {@link buildGraphIndex}
 * rebuild) is required and given the fail-closed reason; otherwise no repair is needed. The signal carries
 * NO content — only the requirement and a generic reason — so it never leaks anything. Pure.
 */
export interface GraphRepairSignal {
	/** Whether a full reindex/repair is required (the index is known-behind / half-applied). */
	reindexRequired: boolean;
	/** The fail-closed reason a reindex is required, or `null` when the graph is healthy. */
	reason: 'incremental-update-failed' | 'source-unavailable' | null;
	/** The graph's current freshness status (the same one a freshness read publishes). */
	status: SearchDomainFreshnessStatus;
}

/**
 * GRAPH-005 AC2 — derive the {@link GraphRepairSignal} from a graph's state. A `stale`-marked graph requires
 * a reindex with reason `incremental-update-failed`; an unavailable source requires one with reason
 * `source-unavailable`; otherwise no reindex is required. The stale flag takes precedence (a failed update
 * is the more specific cause). Pure.
 */
export function graphRepairSignal(index: GraphIndex): GraphRepairSignal {
	const status = graphFreshnessStatus(index);
	if (index.stale) {
		return { reindexRequired: true, reason: 'incremental-update-failed', status };
	}
	if (!index.available) {
		return { reindexRequired: true, reason: 'source-unavailable', status };
	}
	return { reindexRequired: false, reason: null, status };
}

/**
 * GRAPH-005 — extract the distinct, normalized `[[wikilink]]` TARGETS from a markdown body, in document
 * order (duplicates collapsed). Exposed so the query layer builds a {@link GraphNodeRecord}'s
 * `outboundTargets` from the SAME deterministic wikilink extraction the rest of GRAPH uses, rather than a
 * parallel parser. Pure.
 */
export function outboundTargetsFromBody(body: string): string[] {
	const seen = new Set<string>();
	const targets: string[] = [];
	for (const link of extractWikilinks(body)) {
		const raw = link.target.trim();
		const normalized = normalizeName(raw);
		if (normalized === '' || seen.has(normalized)) continue;
		seen.add(normalized);
		targets.push(raw);
	}
	return targets;
}
