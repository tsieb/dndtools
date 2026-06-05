import {
	buildGraphIndex,
	type GraphIndex,
	type GraphNode,
	type GraphNodeKind,
	type GraphNodeRecord,
} from './graph-index';
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
 * GRAPH-001 / GRAPH-008 — the PURE DETERMINISTIC SOURCE-INDEXING engine: it builds the vault link graph FROM
 * the CONTENT SOURCES (local files, Obsidian notes, Google Docs documents) ACROSS all configured sync
 * sources, and PRESERVES the per-node SOURCE-SPECIFIC IDENTIFIERS + REVISION METADATA needed to reconcile a
 * graph node back to the exact source artifact it came from. It also tracks PER-SOURCE FRESHNESS so a source
 * that is not cached / unavailable offline marks the graph PARTIAL (and its cached metadata STALE) rather
 * than blocking the cached relationships that ARE available or serving stale-as-fresh results.
 *
 * Everything here is a PURE function of its explicit inputs (a set of {@link SourceGraphNodeRecord}s + the
 * configured-source set). It NEVER reads ambient state, storage, a clock, an id generator, or a real
 * transport. The ACTOR-FILTERED surface lives in the query layer (`queries/graph-source-index-query.ts`),
 * which feeds this engine ONLY the nodes — and the visible link targets — the actor may see. Because the
 * engine is fed only visible records, a node, an edge, a source ref, a diagnostic, or a freshness cursor can
 * NEVER name or reveal a node the actor cannot see (GRAPH-001 AC2 actor-filtering, fail closed; Cross-Contract
 * Non-Negotiable 2).
 *
 * This COMPOSES the existing GRAPH surfaces rather than introducing a second graph or a second source layer:
 *
 *   - The NODES + directed link EDGES are built by the SAME {@link buildGraphIndex} engine GRAPH-005 uses —
 *     same `[[wikilink]]` resolution, same deterministic ordering, same fail-closed "no edge to a target
 *     outside the visible set". A {@link SourceGraphNodeRecord} IS a {@link GraphNodeRecord} plus its
 *     {@link GraphSourceRef}, so there is exactly ONE structural graph; the source detail rides alongside it.
 *   - The SOURCE-KIND taxonomy reuses the SYNC source-adapter kinds (`local-vault` / `obsidian-vault` /
 *     `google-docs` / future) — there is no parallel source enumeration.
 *   - The FRESHNESS / PARTIAL model reuses the SRCH index-cursor + freshness convention WHOLESALE
 *     (`state/search-index.ts`): the same {@link SearchIndexCursor} shape, the same
 *     `fresh`/`partial`/`stale`/`unknown` statuses, and the same fail-closed rule that an UNPROVEN or
 *     UNAVAILABLE source is `stale`/`unknown`, never `fresh`. There is NO parallel freshness convention.
 *
 * "Source indexing" is the keystone (GRAPH-001): the graph is built FROM the sources and tagged with the
 * provenance to RECONCILE each node back to its source file/document. A HARD determinism requirement backs
 * this: identical sources produce identical indexes — {@link buildSourceGraphIndex} is a pure recompute, and
 * the tests assert reindex reproducibility and source-change consistency.
 *
 * The Processing Core owns the source-indexing algorithm; the GUI renders the computed model + the source
 * provenance/diagnostics (Architecture Contract 1, Contract 2 Sync Source Contract).
 */

export const GRAPH_SOURCE_INDEX_SCHEMA_VERSION = 1 as const;

/**
 * Which content SOURCE a graph node was indexed FROM. Reuses the SYNC source-adapter kinds so there is one
 * source taxonomy across the app (Contract 2 Sync Source Contract). The union is OPEN (`string`) so a FUTURE
 * source needs no core change — an unknown kind is tolerated and simply carries no special handling.
 */
export type GraphSourceKind = 'local-vault' | 'obsidian-vault' | 'google-docs' | (string & {});

export const GRAPH_SOURCE_KINDS: readonly GraphSourceKind[] = Object.freeze([
	'local-vault',
	'obsidian-vault',
	'google-docs',
]);

/**
 * GRAPH-008 — the SOURCE-SPECIFIC IDENTIFIERS + REVISION METADATA preserved for ONE graph node, enough to
 * RECONCILE the node back to the exact source artifact (a local file, an Obsidian note, or a Google Docs
 * document). It is the graph-side projection of the provenance the SOURCE ADAPTERS / IMPORT already record;
 * it carries NO content body and NO secrets — only the IDS and the REVISION that locate the artifact — so it
 * is safe to expose to any actor who can already see the node.
 *
 *   - `sourceId`     — the configured sync-source registration this node came from (e.g. `local-vault`).
 *   - `sourceKind`   — which kind of source (so the consumer knows how to reconcile).
 *   - `externalId`   — the source-native id: the Drive FILE ID (Google Docs), the vault-relative PATH
 *                      (local/Obsidian), or `null` when the source did not record one.
 *   - `documentId`   — the source DOCUMENT id when distinct from `externalId` (e.g. a Google Docs document
 *                      id); `null` otherwise. Surfaced separately so GRAPH-008 AC1 (source id + document id)
 *                      is explicit.
 *   - `revisionId`   — the source REVISION the node reflects (e.g. a Drive revision id), or `null` when the
 *                      source exposes no revision metadata (a bare local file).
 */
export interface GraphSourceRef {
	sourceId: string;
	sourceKind: GraphSourceKind;
	externalId: string | null;
	documentId: string | null;
	revisionId: string | null;
}

/** The fail-closed UNKNOWN-source ref for a node with no recorded provenance (local, un-imported). */
export function unknownGraphSourceRef(sourceId: string): GraphSourceRef {
	return {
		sourceId,
		sourceKind: 'local-vault',
		externalId: null,
		documentId: null,
		revisionId: null,
	};
}

/**
 * ONE node fed to the source-indexing engine: a {@link GraphNodeRecord} (id/kind/title/aliases/outbound
 * targets/revision — the SAME shape GRAPH-005 indexes) PLUS its {@link GraphSourceRef} provenance. A record
 * only ever appears here for an actor-VISIBLE entity, so deriving a node/edge/source-ref from it leaks
 * nothing.
 */
export interface SourceGraphNodeRecord extends GraphNodeRecord {
	/** The source-specific identifiers + revision metadata to reconcile this node (GRAPH-008). */
	source: GraphSourceRef;
}

/**
 * ONE indexed source-graph node: the structural {@link GraphNode} (id/kind/title) PLUS the {@link GraphSourceRef}
 * provenance. This is what a node-inspection / diagnostics surface reads to reconcile the node back to its
 * source (GRAPH-008 AC1). The provenance is carried for every node, regardless of source kind.
 */
export interface SourceGraphNode extends GraphNode {
	source: GraphSourceRef;
}

/**
 * ONE configured SYNC SOURCE the graph indexes across (GRAPH-001 "across all configured sync sources"). It
 * declares the source's identity, kind, OFFLINE availability of its cached content, and the CURSOR the index
 * reflects vs the cursor the source has been observed to reach — so a source whose cache is behind / whose
 * content is not cached offline is marked PARTIAL without blocking the other sources' cached relationships.
 */
export interface ConfiguredGraphSource {
	sourceId: string;
	kind: GraphSourceKind;
	/**
	 * Whether this source's content is CACHED + reachable for indexing right now. `false` ⇒ the source is
	 * unavailable (e.g. a remote source not cached on this offline device) and its slice of the graph is
	 * PARTIAL / its cached metadata STALE — never silently recomputed (GRAPH-001 AC3 / GRAPH-008 AC3).
	 */
	available: boolean;
	/** The cursor the local index has CONSUMED for this source (what is reflected in the built graph). */
	indexedCursor: SearchIndexCursor;
	/** The cursor the source has been OBSERVED to reach (what indexing must catch up to). */
	sourceCursor: SearchIndexCursor;
}

/** Build a configured-source descriptor from a node-count + max-revision over the source's visible records. */
export function configuredSourceFromRecords(
	sourceId: string,
	kind: GraphSourceKind,
	records: readonly SourceGraphNodeRecord[],
	available: boolean,
): ConfiguredGraphSource {
	let revision = 0;
	for (const record of records) {
		if (record.revision > revision) revision = record.revision;
	}
	const cursor: SearchIndexCursor = { sequence: records.length, revision, updatedAt: null };
	return {
		sourceId,
		kind,
		available,
		indexedCursor: { ...cursor },
		// When the source is available its index reflects the source (the local cache IS the source of truth
		// for already-cached content, local-first); when unavailable the source cursor is pushed one ahead so
		// the shared freshness function grades the slice `stale`/`partial` (its cache is known-behind).
		sourceCursor: available
			? { ...cursor }
			: { sequence: cursor.sequence + 1, revision: cursor.revision, updatedAt: cursor.updatedAt },
	};
}

/** The PUBLISHED freshness of ONE configured source (status + cursors + behind-by). Reuses SRCH publisher. */
export interface GraphSourceFreshness extends SearchDomainFreshness {
	sourceId: string;
	kind: GraphSourceKind;
	available: boolean;
}

/** Project a configured source onto the SRCH {@link SearchDomainIndex} so its freshness reuses the shared rule. */
function asDomainIndex(source: ConfiguredGraphSource): SearchDomainIndex {
	return {
		domain: 'note',
		indexedCursor: { ...source.indexedCursor },
		sourceCursor: { ...source.sourceCursor },
		available: source.available,
	};
}

/**
 * GRAPH-001 AC3 / GRAPH-008 AC3 — the FRESHNESS status of ONE configured source (`fresh` | `partial` |
 * `stale` | `unknown`), computed by the SAME shared SRCH freshness function. Fail-closed: an unavailable /
 * not-cached source is never `fresh`. Pure.
 */
export function sourceFreshnessStatus(source: ConfiguredGraphSource): SearchDomainFreshnessStatus {
	return domainFreshnessStatus(asDomainIndex(source));
}

/** Publish ONE configured source's freshness record (status + cursors + behind-by + availability). Pure. */
export function publishSourceFreshness(source: ConfiguredGraphSource): GraphSourceFreshness {
	const published = publishDomainFreshness(asDomainIndex(source));
	return { ...published, sourceId: source.sourceId, kind: source.kind, available: source.available };
}

/**
 * The complete, DETERMINISTIC SOURCE-AWARE link graph: the structural {@link GraphIndex} (nodes + edges +
 * cursor) the GRAPH-005 engine builds, PLUS the per-node {@link GraphSourceRef} provenance (GRAPH-008) and
 * the PER-SOURCE freshness over all configured sources (GRAPH-001). The whole graph is `partial` when ANY
 * configured source is not fully cached/available, so the GUI can signal "some sources are behind" WITHOUT
 * blocking the cached relationships that DID index (GRAPH-001 AC3). Every list is deterministically ordered.
 */
export interface SourceGraphIndex {
	schemaVersion: typeof GRAPH_SOURCE_INDEX_SCHEMA_VERSION;
	/** The structural graph (nodes + edges + bookkeeping) — the SAME GRAPH-005 index. */
	graph: GraphIndex;
	/** The per-node source provenance, keyed by node id (GRAPH-008). Every visible node has an entry. */
	sourceRefs: Record<string, GraphSourceRef>;
	/** The configured sources the graph indexed across, in stable id order (GRAPH-001). */
	sources: ConfiguredGraphSource[];
	/**
	 * The overall index freshness: `partial`/`stale` when ANY configured source is behind/unavailable, else
	 * `fresh`; `unknown` when nothing has been observed. Never `fresh` while a source is unavailable (fail
	 * closed). This is the single status the GUI keys "cached graph is partial" on (GRAPH-001 AC3).
	 */
	status: SearchDomainFreshnessStatus;
}

/** Deterministic ordering for source-graph nodes (by kind, then title, then id). Total tie-break. */
function compareSourceNodes(a: SourceGraphNode, b: SourceGraphNode): number {
	const kindOrder = GRAPH_NODE_KIND_ORDER(a.kind) - GRAPH_NODE_KIND_ORDER(b.kind);
	if (kindOrder !== 0) return kindOrder;
	return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** The stable kind ordering used by the structural graph (note < object < map < poi). */
function GRAPH_NODE_KIND_ORDER(kind: GraphNodeKind): number {
	const order: Record<GraphNodeKind, number> = { note: 0, object: 1, map: 2, poi: 3 };
	return order[kind];
}

/**
 * Combine the per-source statuses into ONE overall status, fail-closed. The overall status is the WORST of
 * the source statuses by severity (`unknown`/`stale` worst, then `partial`, then `fresh`), so a single
 * not-cached source marks the whole index `partial`/`stale` while the cached sources still serve. An EMPTY
 * source set is `fresh` (nothing to be behind). Pure.
 */
export function combineSourceStatuses(
	statuses: readonly SearchDomainFreshnessStatus[],
): SearchDomainFreshnessStatus {
	if (statuses.length === 0) return 'fresh';
	// Severity: a stale/unknown source dominates partial, which dominates fresh.
	const severity: Record<SearchDomainFreshnessStatus, number> = {
		fresh: 0,
		partial: 1,
		unknown: 2,
		stale: 3,
	};
	let worst: SearchDomainFreshnessStatus = 'fresh';
	for (const status of statuses) {
		if (severity[status] > severity[worst]) worst = status;
	}
	// A vault with at least one healthy source but a behind source is `partial`, never silently `stale`,
	// when the behind source is merely not-yet-caught-up (partial) — but a hard-unavailable/unknown source
	// surfaces its own worse status so the GUI does not present a not-cached source as merely "in progress".
	return worst;
}

/**
 * GRAPH-001 / GRAPH-008 — FULL RECOMPUTE: build the complete SOURCE-AWARE link graph over the provided
 * VISIBLE node records ACROSS the configured sources. It builds the structural graph with the SAME
 * {@link buildGraphIndex} engine GRAPH-005 uses (so the nodes/edges are identical to the structural graph),
 * tags every node with its {@link GraphSourceRef} provenance (GRAPH-008), and computes the per-source +
 * overall freshness (GRAPH-001). A source whose cache is unavailable marks its slice — and therefore the
 * overall index — `partial`/`stale`, WITHOUT dropping the nodes/edges that DID index from the cached
 * sources (GRAPH-001 AC3). Pure + deterministic: identical (records, sources) always produce identical
 * indexes — the reindex-reproducibility proof.
 */
export function buildSourceGraphIndex(
	records: readonly SourceGraphNodeRecord[],
	sources: readonly ConfiguredGraphSource[],
): SourceGraphIndex {
	// The structural graph is built by the SAME GRAPH-005 engine — one graph, not a parallel one.
	const graph = buildGraphIndex(records);

	const sourceRefs: Record<string, GraphSourceRef> = {};
	for (const record of records) {
		sourceRefs[record.id] = { ...record.source };
	}

	const orderedSources = [...sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
	const status = combineSourceStatuses(orderedSources.map(sourceFreshnessStatus));

	return {
		schemaVersion: GRAPH_SOURCE_INDEX_SCHEMA_VERSION,
		graph,
		sourceRefs,
		sources: orderedSources,
		status,
	};
}

/** The fail-closed EMPTY source graph (an unknown actor, or a vault with no visible nodes/sources). Pure. */
export function emptySourceGraphIndex(): SourceGraphIndex {
	return {
		schemaVersion: GRAPH_SOURCE_INDEX_SCHEMA_VERSION,
		graph: {
			schemaVersion: 1,
			nodes: [],
			edges: [],
			indexedCursor: { ...EMPTY_INDEX_CURSOR },
			available: true,
			stale: false,
		},
		sourceRefs: {},
		sources: [],
		status: 'fresh',
	};
}

/**
 * GRAPH-008 AC1 — the SOURCE-AWARE NODES of a built index: each structural node joined with its preserved
 * {@link GraphSourceRef} provenance, deterministically ordered. This is what a node-inspection surface reads
 * to reconcile a node back to its source id + document id + revision. A node with no recorded provenance
 * carries the fail-closed unknown ref (never a guessed source). Pure + deterministic.
 */
export function sourceGraphNodes(index: SourceGraphIndex): SourceGraphNode[] {
	return index.graph.nodes
		.map((node) => ({
			...node,
			source: index.sourceRefs[node.id] ?? unknownGraphSourceRef('local-vault'),
		}))
		.sort(compareSourceNodes);
}

/**
 * GRAPH-008 AC1 — the preserved {@link GraphSourceRef} for ONE node, or `null` when the node is not in the
 * visible index (hidden / deleted / never indexed). Fail-closed: a node the actor cannot see is
 * indistinguishable from a node that does not exist (no provenance leaks the existence of a hidden node).
 * Pure.
 */
export function sourceRefForNode(index: SourceGraphIndex, nodeId: string): GraphSourceRef | null {
	const present = index.graph.nodes.some((node) => node.id === nodeId);
	if (!present) return null;
	return index.sourceRefs[nodeId] ?? null;
}

/**
 * GRAPH-008 AC3 — ONE source-metadata DIAGNOSTIC row for a configured source: its freshness + whether its
 * cached metadata is STALE/PARTIAL (its content is not cached/available offline) rather than silently
 * recomputed. The diagnostic carries NO content — only the source id/kind + status — so it never leaks. This
 * is the "graph diagnostics show cached metadata as stale or partial" surface (GRAPH-008 AC3 / GRAPH-001 AC3).
 */
export interface GraphSourceDiagnostic {
	sourceId: string;
	kind: GraphSourceKind;
	status: SearchDomainFreshnessStatus;
	available: boolean;
	/** How many accepted mutations this source's index is behind the source by (0 ⇒ caught up). */
	behindBy: number;
	/** A generic, non-leaking explanation of the source's metadata state. */
	message: string;
}

/** The fail-closed, non-leaking message for a source diagnostic, by status. */
function sourceDiagnosticMessage(
	kind: GraphSourceKind,
	status: SearchDomainFreshnessStatus,
	available: boolean,
): string {
	if (!available) {
		return `The ${kind} source is not cached or reachable; its graph metadata is shown as stale and is not silently recomputed.`;
	}
	switch (status) {
		case 'fresh':
			return `The ${kind} source is fully indexed; its cached graph metadata is current.`;
		case 'partial':
			return `The ${kind} source is partially indexed; some cached graph metadata may be behind the source.`;
		case 'stale':
			return `The ${kind} source has advanced past the local index; its cached graph metadata is stale.`;
		case 'unknown':
		default:
			return `The ${kind} source has not been observed yet; its graph metadata freshness is unproven.`;
	}
}

/**
 * GRAPH-008 AC3 / GRAPH-001 AC3 — the SOURCE-METADATA DIAGNOSTICS for a built index: one
 * {@link GraphSourceDiagnostic} per configured source, in stable id order. A source whose content is not
 * cached/available offline is reported `stale`/`partial` (cached metadata is shown as stale, not silently
 * recomputed). The diagnostics carry no content, so they never leak. Pure + deterministic.
 */
export function sourceGraphDiagnostics(index: SourceGraphIndex): GraphSourceDiagnostic[] {
	return index.sources.map((source) => {
		const freshness = publishSourceFreshness(source);
		return {
			sourceId: source.sourceId,
			kind: source.kind,
			status: freshness.status,
			available: source.available,
			behindBy: freshness.behindBy,
			message: sourceDiagnosticMessage(source.kind, freshness.status, source.available),
		};
	});
}

/**
 * GRAPH-001 AC3 — whether the cached graph is PARTIAL because at least one configured source is not fully
 * cached/available. `true` ⇒ the GUI signals "some sources are behind" while still serving the cached
 * relationships that DID index. Pure.
 */
export function isSourceGraphPartial(index: SourceGraphIndex): boolean {
	return index.status === 'partial' || index.status === 'stale' || index.status === 'unknown';
}
