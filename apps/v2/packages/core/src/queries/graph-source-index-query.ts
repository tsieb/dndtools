import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import type { MapState } from '../state/map-state';
import type { SessionState } from '../state/session-state';
import { parseMarkdownNote } from '../state/markdown';
import { outboundTargetsFromBody } from '../state/graph-index';
import {
	buildSourceGraphIndex,
	configuredSourceFromRecords,
	emptySourceGraphIndex,
	isSourceGraphPartial,
	sourceGraphDiagnostics,
	sourceGraphNodes,
	sourceRefForNode,
	unknownGraphSourceRef,
	type ConfiguredGraphSource,
	type GraphSourceDiagnostic,
	type GraphSourceKind,
	type GraphSourceRef,
	type SourceGraphIndex,
	type SourceGraphNode,
	type SourceGraphNodeRecord,
} from '../state/graph-source-index';
import { getContentItemsForActor, type ContentItemView } from './content-query';
import { getMapViewForActor, deliveredMapIdsForActor } from './map-query';

/**
 * GRAPH-001 / GRAPH-008 — the ACTOR-FILTERED SOURCE-INDEXING surface: it builds the actor's VISIBLE link
 * graph FROM the content sources (notes, objects, maps, POIs) ACROSS all configured sync sources, PRESERVES
 * each node's source-specific identifiers + revision metadata to reconcile the node back to its source, and
 * exposes the per-source FRESHNESS + the PARTIAL/STALE source-metadata DIAGNOSTICS.
 *
 * This is the single choke-point that feeds the pure {@link buildSourceGraphIndex} engine ONLY the nodes —
 * and the visible link targets — the actor may see. It is built ENTIRELY on the EXISTING actor-filtered
 * reads, NOT a second relationship source and NOT a second source layer:
 *
 *   - The NOTE / OBJECT nodes come from {@link getContentItemsForActor} (CONTENT-011) — the SAME
 *     visibility-and-tombstone choke-point every CONTENT/SRCH/GRAPH surface uses. A `dm-only` /
 *     `shared`-but-undelivered / soft-deleted item never enters the set, so it can never be a node, an edge
 *     endpoint, a source ref, or a diagnostic (GRAPH-001 AC2 actor-filtering, fail closed; Cross-Contract
 *     Non-Negotiable 2).
 *   - The MAP / POI nodes come from {@link getMapViewForActor} — the SAME map→layer→annotation precedence
 *     read MAP surfaces use. A hidden map/POI is filtered there, so it can never be a node.
 *   - The link EDGES + structural graph are built by the SAME {@link buildSourceGraphIndex} → GRAPH-005
 *     engine over the visible records, so the source graph's nodes/edges are IDENTICAL to the structural
 *     graph the rest of the app sees — there is exactly one graph.
 *   - The SOURCE PROVENANCE for each node is derived from the SAME content-item fields the SOURCE ADAPTERS /
 *     import already record (the import `sourcePath`, the `dndtools.*` namespaced source metadata, the env
 *     source id). Reading provenance NEVER mutates the item and NEVER overwrites user frontmatter — aliases
 *     come from the already-parsed `aliases` list, isolated from user properties (GRAPH-008 AC2).
 *
 * OFFLINE / PARTIAL (GRAPH-001 AC1/AC3 + GRAPH-008 AC3): the index is built ENTIRELY from local cached state
 * with zero network (Contract 2 Local-First Invariant). A configured source whose content is not cached /
 * not reachable on this device is marked UNAVAILABLE, so its slice — and the overall index — is `partial` /
 * `stale` (its cached metadata is shown stale, never silently recomputed) WITHOUT blocking the cached
 * relationships that DID index from the available sources.
 *
 * Pure + deterministic: the same (content, maps, session, permissions, actor, source availability) always
 * produce the same source graph (the reindex-reproducibility + source-change-consistency proof). The
 * Processing Core owns the algorithm; the GUI renders the computed model (Architecture Contract 1).
 */

/** The namespaced `dndtools.*` keys a content item carries source provenance under (GRAPH-008). */
const SOURCE_ID_KEYS = ['dndtools.sourceId', 'dndtools.source-id'] as const;
const SOURCE_KIND_KEYS = ['dndtools.sourceKind', 'dndtools.source-kind'] as const;
const DOCUMENT_ID_KEYS = ['dndtools.documentId', 'dndtools.document-id', 'dndtools.fileId'] as const;
const REVISION_ID_KEYS = ['dndtools.revisionId', 'dndtools.revision-id'] as const;
const SOURCE_PATH_KEYS = ['sourcePath', 'dndtools.sourcePath'] as const;

/** Read a string field from a content item's open `fields` map, trying each key in order. Pure. */
function readStringField(
	fields: Record<string, unknown>,
	keys: readonly string[],
): string | null {
	for (const key of keys) {
		const value = fields[key];
		if (typeof value === 'string' && value.trim() !== '') return value.trim();
	}
	return null;
}

/**
 * Normalize a recorded source-kind string to a {@link GraphSourceKind}. An unrecognized kind is preserved
 * verbatim (the union is open) so a FUTURE source needs no change here. Pure.
 */
function normalizeSourceKind(raw: string | null, fallback: GraphSourceKind): GraphSourceKind {
	if (raw === null) return fallback;
	return raw as GraphSourceKind;
}

/**
 * GRAPH-008 — derive ONE content item's preserved {@link GraphSourceRef} from the source metadata the source
 * adapters / import already recorded in its `fields`. It NEVER mutates the item and NEVER overwrites user
 * frontmatter. When no explicit provenance is recorded the ref falls back to the configured/env source id +
 * the path (if any) — the fail-closed unknown ref otherwise. Pure + deterministic.
 *
 *  - `sourceId`   — explicit `dndtools.sourceId`, else the env/default configured source.
 *  - `sourceKind` — explicit `dndtools.sourceKind`, inferred from the default source kind otherwise.
 *  - `externalId` — explicit document/file id, else the import `sourcePath`, else `null`.
 *  - `documentId` — explicit `dndtools.documentId`/`dndtools.fileId` (e.g. a Google Docs document id), else
 *                   `null` — surfaced separately so GRAPH-008 AC1 (source id + document id) is explicit.
 *  - `revisionId` — explicit `dndtools.revisionId` (e.g. a Drive revision id), else `null`.
 */
function sourceRefForContentItem(
	view: ContentItemView,
	defaultSourceId: string,
	defaultSourceKind: GraphSourceKind,
): GraphSourceRef {
	const fields = view.fields;
	const sourceId = readStringField(fields, SOURCE_ID_KEYS) ?? defaultSourceId;
	const sourceKind = normalizeSourceKind(readStringField(fields, SOURCE_KIND_KEYS), defaultSourceKind);
	const documentId = readStringField(fields, DOCUMENT_ID_KEYS);
	const revisionId = readStringField(fields, REVISION_ID_KEYS);
	const sourcePath = readStringField(fields, SOURCE_PATH_KEYS);
	// The external (source-native) id is the document/file id when present, else the source-relative path.
	const externalId = documentId ?? sourcePath;
	return { sourceId, sourceKind, externalId, documentId, revisionId };
}

/** A node record built from a visible note/object content item, carrying its source provenance (GRAPH-008). */
function contentSourceNodeRecord(
	view: ContentItemView,
	defaultSourceId: string,
	defaultSourceKind: GraphSourceKind,
): SourceGraphNodeRecord {
	const parsed = parseMarkdownNote(view.body);
	return {
		id: view.id,
		kind: view.kind === 'object' ? 'object' : 'note',
		title: view.title,
		// Aliases come from the already-parsed `aliases` list — reading them never overwrites user
		// frontmatter (GRAPH-008 AC2): the parse is read-only and the user properties are untouched.
		aliases: parsed.aliases,
		outboundTargets: outboundTargetsFromBody(parsed.body),
		revision: view.revision,
		source: sourceRefForContentItem(view, defaultSourceId, defaultSourceKind),
	};
}

/**
 * GRAPH-001 — the DEFAULT/local source the maps + un-provenanced notes are indexed under. Maps + POIs are
 * always LOCAL-vault entities (they are not external-source content), so they carry the local-vault ref.
 */
const LOCAL_SOURCE_KIND: GraphSourceKind = 'local-vault';

/**
 * GRAPH-001 / GRAPH-008 — build the ACTOR-FILTERED source-graph node records over the actor's VISIBLE notes,
 * objects, maps, and POIs, each tagged with its source provenance. Notes/objects carry the provenance
 * derived from their fields; maps/POIs carry the local-vault ref. Hidden entities never enter the set
 * (fail closed). Pure.
 */
function buildSourceGraphRecordsForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	defaultSourceId: string,
): SourceGraphNodeRecord[] {
	const records: SourceGraphNodeRecord[] = [];
	const visibleIds = new Set<string>();
	const titleById = new Map<string, string>();
	const addRecord = (record: SourceGraphNodeRecord): void => {
		records.push(record);
		visibleIds.add(record.id);
		titleById.set(record.id, record.title);
	};

	// NOTE + OBJECT nodes (the wikilink-bearing, externally-sourced entities).
	for (const view of getContentItemsForActor(content, permissions, actorId)) {
		addRecord(contentSourceNodeRecord(view, defaultSourceId, LOCAL_SOURCE_KIND));
	}

	// MAP nodes + POI nodes (local-vault entities). A POI links its target entity only when that target is
	// itself a VISIBLE node — so a visible POI pinning a hidden note yields no edge (fail closed). Mirrors
	// the GRAPH-005 actor-filtered record build exactly.
	const localRef = (id: string): GraphSourceRef => ({
		sourceId: defaultSourceId,
		sourceKind: LOCAL_SOURCE_KIND,
		externalId: id,
		documentId: null,
		revisionId: null,
	});
	const deliveredMapIds = deliveredMapIdsForActor(session, actorId);
	const poiLinks: { poiId: string; linkedEntityId: string }[] = [];
	for (const mapId of Object.keys(maps.maps)) {
		const view = getMapViewForActor(maps, permissions, actorId, mapId, { deliveredMapIds });
		if (view.kind !== 'available') continue;
		addRecord({
			id: view.mapId,
			kind: 'map',
			title: view.name,
			aliases: [],
			outboundTargets: [],
			revision: 0,
			source: localRef(view.mapId),
		});
		for (const poi of view.pois) {
			addRecord({
				id: poi.id,
				kind: 'poi',
				title: poi.label,
				aliases: [],
				outboundTargets: [],
				revision: 0,
				source: localRef(poi.id),
			});
			if (poi.linkedEntityId !== null) poiLinks.push({ poiId: poi.id, linkedEntityId: poi.linkedEntityId });
		}
	}

	// POI→linked-entity edges encoded as the linked entity's TITLE so the SAME name index resolves them. A
	// POI whose linked entity is not in the visible set contributes NO edge (fail closed).
	const recordById = new Map<string, SourceGraphNodeRecord>(records.map((record) => [record.id, record]));
	for (const { poiId, linkedEntityId } of poiLinks) {
		if (!visibleIds.has(linkedEntityId)) continue;
		const linkedTitle = titleById.get(linkedEntityId);
		const record = recordById.get(poiId);
		if (linkedTitle !== undefined && record) record.outboundTargets = [linkedTitle];
	}

	return records;
}

/**
 * GRAPH-001 — declare how a configured source's availability is supplied per build. The graph indexes over
 * ALL configured sources; a source absent from `availability` (or explicitly `false`) is treated as
 * UNAVAILABLE/not-cached only when listed — the DEFAULT source the records came from is always available
 * (its content is, by definition, cached locally because the records exist).
 */
export interface SourceGraphAvailability {
	/** The configured sources to index across (beyond the default the records came from), by id. */
	configuredSources?: readonly { sourceId: string; kind: GraphSourceKind; available: boolean }[];
}

/**
 * GRAPH-001 / GRAPH-008 — the ACTOR-FILTERED SOURCE GRAPH INDEX: the visible structural graph + the per-node
 * source provenance + the per-source freshness, built across all configured sources. An unknown/
 * unauthenticated actor receives the EMPTY index (fail closed). A configured source whose content is not
 * cached/available is marked `partial`/`stale` WITHOUT blocking the cached relationships (GRAPH-001 AC3).
 * Pure + deterministic.
 *
 * @param defaultSourceId the source the local records came from (always available — its content is cached).
 * @param availability    additional configured sources to index across, with their cache availability.
 */
export function getSourceGraphIndexForActor(
	content: VaultContentState,
	maps: MapState,
	session: SessionState | undefined,
	permissions: PermissionState,
	actorId: string,
	defaultSourceId: string,
	availability: SourceGraphAvailability = {},
): SourceGraphIndex {
	if (!permissions.actors[actorId]) return emptySourceGraphIndex();

	const records = buildSourceGraphRecordsForActor(
		content,
		maps,
		session,
		permissions,
		actorId,
		defaultSourceId,
	);

	// Partition the visible records by their source id so each configured source's freshness reflects ONLY
	// the nodes that came from it (its slice of the graph).
	const recordsBySource = new Map<string, SourceGraphNodeRecord[]>();
	for (const record of records) {
		const list = recordsBySource.get(record.source.sourceId) ?? [];
		list.push(record);
		recordsBySource.set(record.source.sourceId, list);
	}

	const configured: ConfiguredGraphSource[] = [];
	const seen = new Set<string>();

	// Every source that actually contributed visible records is AVAILABLE (its content is cached locally —
	// the records exist), unless the caller explicitly declares it unavailable below.
	const declaredUnavailable = new Map<string, GraphSourceKind>();
	for (const source of availability.configuredSources ?? []) {
		if (!source.available) declaredUnavailable.set(source.sourceId, source.kind);
	}

	for (const [sourceId, list] of [...recordsBySource.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		const kind = list[0]?.source.sourceKind ?? LOCAL_SOURCE_KIND;
		const available = !declaredUnavailable.has(sourceId);
		configured.push(configuredSourceFromRecords(sourceId, kind, list, available));
		seen.add(sourceId);
	}

	// A configured source with NO cached records (e.g. a remote source whose content was never cached on this
	// offline device) is indexed as an EMPTY, possibly-UNAVAILABLE slice — so it marks the graph partial
	// without blocking the cached relationships (GRAPH-001 AC3).
	for (const source of availability.configuredSources ?? []) {
		if (seen.has(source.sourceId)) continue;
		configured.push(configuredSourceFromRecords(source.sourceId, source.kind, [], source.available));
		seen.add(source.sourceId);
	}

	return buildSourceGraphIndex(records, configured);
}

/**
 * GRAPH-008 AC1 — the SOURCE-AWARE NODES of the actor's visible index: each node joined with its preserved
 * provenance (source id + document id + revision), deterministically ordered. A node with no recorded
 * provenance carries the fail-closed unknown ref. Every node here is actor-visible. Pure + deterministic.
 */
export function getSourceGraphNodesForActor(index: SourceGraphIndex): SourceGraphNode[] {
	return sourceGraphNodes(index);
}

/**
 * GRAPH-008 AC1 — the preserved {@link GraphSourceRef} for ONE node in the actor's visible index, or `null`
 * when the node is not visible (hidden / deleted / never indexed). Fail-closed: a node the actor cannot see
 * is indistinguishable from one that does not exist. Pure.
 */
export function getSourceRefForActor(index: SourceGraphIndex, nodeId: string): GraphSourceRef | null {
	return sourceRefForNode(index, nodeId);
}

/**
 * GRAPH-008 AC3 / GRAPH-001 AC3 — the SOURCE-METADATA DIAGNOSTICS for the actor's visible index: one row per
 * configured source, showing whether its cached metadata is stale/partial (its content is not
 * cached/reachable) rather than silently recomputed. The diagnostics carry no content, so they never leak.
 * Pure + deterministic.
 */
export function getSourceGraphDiagnosticsForActor(
	index: SourceGraphIndex,
): GraphSourceDiagnostic[] {
	return sourceGraphDiagnostics(index);
}

/**
 * GRAPH-001 AC3 — whether the actor's cached source graph is PARTIAL because at least one configured source
 * is not fully cached/available. `true` ⇒ the GUI signals "some sources are behind" while still serving the
 * cached relationships that DID index. Pure.
 */
export function isSourceGraphPartialForActor(index: SourceGraphIndex): boolean {
	return isSourceGraphPartial(index);
}

/** Re-export the fail-closed unknown ref builder for consumers that need a baseline ref. */
export { unknownGraphSourceRef };
