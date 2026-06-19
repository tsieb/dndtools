import type { MapAsset } from './map-assets';
import { buildMapAsset, nativeAssetKind, type AssetValidationError } from './map-assets';
import type { MapEntity, MapLayer, MapState } from './map-state';
import { normalizeMapEntity, normalizeMapLayer } from './map-state';

/**
 * MAP-002 / MAP-020 — external map-format adapter registry + safe (transactional) import staging.
 *
 * Two ideas live here, both pure Processing-Core policy:
 *
 *  1. ADAPTER REGISTRY (MAP-002). Native imports (image/SVG) need no adapter. Any OTHER external
 *     scene format (e.g. a VTT/Foundry/Roll20-style bundle) requires a DECLARED ADAPTER before use.
 *     With no declared adapter for a format, import is REJECTED fail-closed — not silently
 *     best-effort. An adapter is a TYPED CAPABILITY DESCRIPTOR (modeled like the platform capability
 *     descriptors): it declares which scene elements it can map and which it cannot. The registry is
 *     built once and is immutable; registering an unknown/duplicate format fails closed at
 *     construction.
 *
 *  2. SAFE IMPORT STAGING (MAP-020). An import is a TRANSACTION. The DM first gets a PREVIEW: an
 *     adapter capability summary plus per-element DIAGNOSTICS classifying each declared element as
 *     `importable` / `lossy` / `unsupported` / `blocked`. Nothing is written during preview. The
 *     import is only ever applied through a STAGED-THEN-COMMIT reducer: staging produces a candidate
 *     `MapState` patch; committing applies it atomically; aborting/failing applies NOTHING, so the
 *     prior state stays byte-identical (no partial commit). This is the same write-ahead / safety
 *     snapshot discipline the migration recovery uses, expressed as a pure reducer.
 *
 * Diagnostics are NON-LEAKING: they describe element kinds and reasons, never raw external payload
 * contents, so a rejected import cannot exfiltrate untrusted file internals into the UI.
 */

export const MAP_IMPORT_SCHEMA_VERSION = 1 as const;

/** The scene-element kinds an external map format may carry, that an adapter declares support for. */
export type MapImportElementKind =
	| 'dimensions'
	| 'grid'
	| 'background-image'
	| 'walls'
	| 'lights'
	| 'notes'
	| 'layers'
	| 'tokens';

/** How an adapter handles a given element kind. The classification surfaced in the preview. */
export type MapImportElementSupport =
	// Fully mapped to canonical map state with no loss.
	| 'importable'
	// Mapped, but with declared loss of fidelity (the DM is told what is approximated).
	| 'lossy'
	// The adapter cannot map this element; it will be DROPPED and REPORTED (never silently lost).
	| 'unsupported'
	// The adapter explicitly refuses this element (e.g. security policy, executable content).
	// Like unsupported it is DROPPED and REPORTED, but the diagnostic identifies the refusal as
	// a deliberate policy block rather than a capability gap.
	| 'blocked';

/**
 * A typed adapter capability descriptor (modeled on the platform capability descriptors). It declares
 * the external `formatId` it handles, the native asset kinds it can emit, and a per-element-kind
 * support map. Immutable.
 */
export interface MapImportAdapterDescriptor {
	/** Stable format identifier, e.g. `vtt-scene`. Matched against the import request's `formatId`. */
	formatId: string;
	displayName: string;
	version: string;
	/** Per-element support classification. Any element kind ABSENT here is treated as `unsupported`. */
	elementSupport: Readonly<Partial<Record<MapImportElementKind, MapImportElementSupport>>>;
}

export interface MapImportAdapterRegistry {
	get(formatId: string): MapImportAdapterDescriptor | undefined;
	has(formatId: string): boolean;
	formats(): string[];
}

/**
 * Build an immutable adapter registry. Throws if a descriptor is missing a `formatId` or a format is
 * declared twice — wiring errors fail closed at construction, not at import time.
 */
export function createMapImportAdapterRegistry(
	descriptors: readonly MapImportAdapterDescriptor[],
): MapImportAdapterRegistry {
	const byFormat = new Map<string, MapImportAdapterDescriptor>();
	for (const descriptor of descriptors) {
		if (!descriptor.formatId || descriptor.formatId.trim().length === 0) {
			throw new Error('Map import adapter descriptor is missing a formatId.');
		}
		if (byFormat.has(descriptor.formatId)) {
			throw new Error(
				`Map import adapter for format "${descriptor.formatId}" is registered twice.`,
			);
		}
		byFormat.set(descriptor.formatId, descriptor);
	}
	return {
		get: (formatId) => byFormat.get(formatId),
		has: (formatId) => byFormat.has(formatId),
		formats: () => [...byFormat.keys()],
	};
}

/** An empty registry: NO external format is declared, so every external import fails closed. */
export const EMPTY_MAP_IMPORT_ADAPTER_REGISTRY: MapImportAdapterRegistry =
	createMapImportAdapterRegistry([]);

/** One element's preview classification for a specific external import. */
export interface MapImportElementDiagnostic {
	kind: MapImportElementKind;
	support: MapImportElementSupport;
	/** Whether this element is present in the import request's declared element set. */
	present: boolean;
	/** Non-leaking explanation (element kind + reason; never raw payload contents). */
	message: string;
}

/** The capability summary the DM sees in the preview (what the adapter can / can't do). */
export interface MapImportAdapterCapabilitySummary {
	formatId: string;
	displayName: string;
	version: string;
	importable: MapImportElementKind[];
	lossy: MapImportElementKind[];
	unsupported: MapImportElementKind[];
	/** Elements the adapter explicitly refuses on policy grounds (distinct from capability gaps). */
	blocked: MapImportElementKind[];
}

export type MapImportRejectionReason =
	| 'unsupported-format'
	| 'invalid-asset'
	| 'empty-import'
	| 'no-importable-elements';

/**
 * The result of PREVIEWING an import. It is read-only — no state is mutated. When `ok` is false the
 * import is rejected fail-closed (e.g. no declared adapter); when true the DM may proceed to commit
 * the returned staged plan. The preview ALWAYS carries the per-element diagnostics so unsupported
 * elements are REPORTED, never silently dropped.
 */
export type MapImportPreview =
	| {
			ok: false;
			reason: MapImportRejectionReason;
			message: string;
			diagnostics: MapImportElementDiagnostic[];
			capabilitySummary: MapImportAdapterCapabilitySummary | null;
	  }
	| {
			ok: true;
			/** `native` for image/SVG; `adapter` for a declared external format. */
			mode: 'native' | 'adapter';
			capabilitySummary: MapImportAdapterCapabilitySummary | null;
			diagnostics: MapImportElementDiagnostic[];
			/** Elements that WILL import (importable or lossy). Drives what the staged plan creates. */
			importedElements: MapImportElementKind[];
			/** Elements present in the request that the adapter cannot map (reported, then dropped). */
			droppedElements: MapImportElementKind[];
			/** The validated native asset to create, when the import carries asset bytes. */
			asset: MapAsset | null;
	  };

/** The bytes + metadata for a native asset the import carries (image/SVG). Optional for pure-scene
 *  external imports that declare elements but no native background asset. */
export interface MapImportAssetInput {
	bytes: Uint8Array;
	mimeType: string;
	fileName: string;
	dimensions?: { width: number; height: number } | null;
	maxBytes?: number;
}

export interface MapImportRequest {
	/** `null`/absent ⇒ a NATIVE import (image/SVG). Otherwise the external format id to look up. */
	formatId?: string | null;
	/** The native asset bytes, when the import carries an image/SVG. */
	asset?: MapImportAssetInput | null;
	/** The element kinds the external file declares (the adapter classifies each). */
	declaredElements?: MapImportElementKind[];
	importedBy: string;
	importedAt: string;
}

/** Build the adapter capability summary from a descriptor (what it can / can't do). */
export function summarizeAdapterCapabilities(
	descriptor: MapImportAdapterDescriptor,
): MapImportAdapterCapabilitySummary {
	const importable: MapImportElementKind[] = [];
	const lossy: MapImportElementKind[] = [];
	const unsupported: MapImportElementKind[] = [];
	const blocked: MapImportElementKind[] = [];
	for (const [kind, support] of Object.entries(descriptor.elementSupport) as Array<
		[MapImportElementKind, MapImportElementSupport]
	>) {
		if (support === 'importable') importable.push(kind);
		else if (support === 'lossy') lossy.push(kind);
		else if (support === 'blocked') blocked.push(kind);
		else unsupported.push(kind);
	}
	return {
		formatId: descriptor.formatId,
		displayName: descriptor.displayName,
		version: descriptor.version,
		importable: importable.sort(),
		lossy: lossy.sort(),
		unsupported: unsupported.sort(),
		blocked: blocked.sort(),
	};
}

const SUPPORT_MESSAGE: Record<MapImportElementSupport, string> = {
	importable: 'Imports cleanly.',
	lossy: 'Imports with reduced fidelity.',
	unsupported: 'Not supported by this adapter; it will be dropped and reported.',
	blocked: 'Refused by adapter policy (e.g. security constraint); it will be dropped and reported.',
};

function assetErrorReason(error: AssetValidationError): {
	reason: MapImportRejectionReason;
	message: string;
} {
	return { reason: 'invalid-asset', message: error.message };
}

/**
 * MAP-002 / MAP-020 — PREVIEW an import without mutating anything. Decision order (fail-closed):
 *
 *  1. If the request names an external `formatId`, require a DECLARED adapter; with none, reject
 *     `unsupported-format` (no partial state, NO asset built).
 *  2. Validate the native asset bytes (size/MIME) when present — a too-large or non-native asset is
 *     rejected here, before any staging.
 *  3. Classify every declared element against the adapter (importable / lossy / unsupported). An
 *     unsupported element is reported in diagnostics; it is never silently dropped.
 *  4. An import that would write nothing at all (no asset and no importable elements) is rejected so
 *     the DM is never left with an empty no-op "map".
 */
export function previewMapImport(
	registry: MapImportAdapterRegistry,
	request: MapImportRequest,
): MapImportPreview {
	const isExternal = Boolean(request.formatId);
	const declared = request.declaredElements ?? [];

	// (1) External format gating — fail closed when no adapter is declared.
	let descriptor: MapImportAdapterDescriptor | undefined;
	if (isExternal) {
		descriptor = registry.get(request.formatId!);
		if (!descriptor) {
			return {
				ok: false,
				reason: 'unsupported-format',
				message: `No declared adapter for external map format "${request.formatId}". Declare an adapter before importing this format.`,
				diagnostics: [],
				capabilitySummary: null,
			};
		}
	}

	const capabilitySummary = descriptor ? summarizeAdapterCapabilities(descriptor) : null;

	// (2) Validate the native asset bytes when present.
	let asset: MapAsset | null = null;
	if (request.asset) {
		// A native (non-external) import MUST carry an image/SVG; reject non-native MIME up front so
		// the caller is steered to the adapter path.
		if (!isExternal && nativeAssetKind(request.asset.mimeType) === null) {
			return {
				ok: false,
				reason: 'unsupported-format',
				message: `MIME type "${request.asset.mimeType}" is not a native map asset; a declared adapter is required to import this format.`,
				diagnostics: [],
				capabilitySummary,
			};
		}
		const built = buildMapAsset({
			bytes: request.asset.bytes,
			mimeType: request.asset.mimeType,
			fileName: request.asset.fileName,
			dimensions: request.asset.dimensions ?? null,
			importedBy: request.importedBy,
			importedAt: request.importedAt,
			maxBytes: request.asset.maxBytes,
		});
		if ('error' in built) {
			const { reason, message } = assetErrorReason(built.error);
			return { ok: false, reason, message, diagnostics: [], capabilitySummary };
		}
		asset = built;
	}

	// (3) Classify declared elements against the adapter (native imports declare none).
	const diagnostics: MapImportElementDiagnostic[] = [];
	const importedElements: MapImportElementKind[] = [];
	const droppedElements: MapImportElementKind[] = [];
	for (const kind of declared) {
		const support: MapImportElementSupport = descriptor?.elementSupport[kind] ?? 'unsupported';
		diagnostics.push({ kind, support, present: true, message: SUPPORT_MESSAGE[support] });
		// Both 'unsupported' (capability gap) and 'blocked' (policy refusal) result in the element
		// being dropped and reported — neither is ever silently committed.
		if (support === 'unsupported' || support === 'blocked') droppedElements.push(kind);
		else importedElements.push(kind);
	}

	// (4) An import that writes nothing is rejected.
	if (!asset && importedElements.length === 0) {
		const empty = declared.length === 0;
		return {
			ok: false,
			reason: empty ? 'empty-import' : 'no-importable-elements',
			message: empty
				? 'Import carries no asset and no declared elements; nothing to import.'
				: 'Every declared element is unsupported by this adapter; nothing would import.',
			diagnostics,
			capabilitySummary,
		};
	}

	return {
		ok: true,
		mode: isExternal ? 'adapter' : 'native',
		capabilitySummary,
		diagnostics,
		importedElements,
		droppedElements,
		asset,
	};
}

/**
 * The staged result of a committable import: a candidate `MapState` plus the records describing what
 * changed. STAGING IS PURE — it returns a NEW MapState and never mutates the input, so a caller that
 * discards the staged result leaves the prior state byte-identical (MAP-020 rollback). The command
 * handler either appends the durable op and adopts `nextState`, or drops it entirely on any later
 * failure.
 */
export interface StagedMapImport {
	nextState: MapState;
	/** The map the import targeted (created or updated). */
	mapId: string;
	mapCreated: boolean;
	/** The asset that was added, or null when none / a dedupe of an existing asset. */
	assetAdded: MapAsset | null;
	/** True when the asset's bytes matched an asset already in the store (content-addressed dedupe). */
	assetDeduped: boolean;
	/** Element kinds reported as dropped (unsupported) — surfaced for the audit, never silently lost. */
	droppedElements: MapImportElementKind[];
}

export interface StageMapImportInput {
	preview: Extract<MapImportPreview, { ok: true }>;
	/** Existing map id to attach to, or null to create a fresh imported map. */
	mapId: string | null;
	/** Name for a freshly created imported map (required when `mapId` is null). */
	mapName?: string;
	importedBy: string;
	importedAt: string;
}

/** Build a default base layer for a freshly imported map so it always has at least one layer. */
function importedBaseLayer(importedBy: string, importedAt: string): MapLayer {
	return normalizeMapLayer(
		{
			id: 'layer-imported-base',
			name: 'Imported Base',
			category: 'base',
			// Fail closed: an imported map's base layer is dm-only until the DM reveals it.
			visibility: 'dm-only',
			enabled: true,
			opacity: 1,
			updatedBy: importedBy,
			updatedAt: importedAt,
		},
		0,
	);
}

/**
 * MAP-020 — STAGE a previewed import into a candidate `MapState`. Pure and transactional:
 *
 *  - The input state is never mutated; a new `MapState` is returned.
 *  - The asset (when present) is content-addressed: if its id already exists in `state.assets` the
 *    bytes are a DEDUPE (no new record, `assetDeduped: true`); otherwise it is added.
 *  - When `mapId` is null a fresh imported map is created with a default base layer; otherwise the
 *    asset is attached to the existing map and its `assetIds` set (no duplicate ids).
 *  - Dropped (unsupported) elements are carried through for the audit; they are NOT written.
 *
 * Because staging is a pure function returning a fresh value, "rollback" is simply NOT adopting the
 * returned `nextState` — the prior state is guaranteed byte-identical.
 */
export function stageMapImport(state: MapState, input: StageMapImportInput): StagedMapImport {
	const { preview } = input;
	const asset = preview.asset;

	// Content-addressed dedupe: identical bytes ⇒ identical id ⇒ a single asset record.
	const assetDeduped = asset ? asset.id in state.assets : false;
	const nextAssets = asset && !assetDeduped ? { ...state.assets, [asset.id]: asset } : state.assets;

	// Resolve the target map id: an explicit existing map, else the deterministic content-addressed id
	// (asset checksum) or name slug, so two imports of the SAME file resolve to the SAME id.
	const targetMapId =
		input.mapId && state.maps[input.mapId]
			? input.mapId
			: asset
				? `map-import-${asset.checksum}`
				: `map-import-${(input.mapName ?? 'imported').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	const existing = state.maps[targetMapId];

	let mapId: string;
	let mapCreated: boolean;
	let nextMaps: Record<string, MapEntity>;

	if (existing) {
		// Attach to an EXISTING map — whether the caller named it explicitly OR a re-import of the same
		// file resolved to the same deterministic id. NEVER clobber the map's annotations: add the
		// (deduped) asset reference and bump the revision. This makes re-importing the same file
		// idempotent instead of wiping the existing layers/POIs/routes/fog/tokens (data loss).
		mapId = existing.id;
		mapCreated = false;
		const assetIds =
			asset && !existing.assetIds.includes(asset.id)
				? [...existing.assetIds, asset.id]
				: existing.assetIds;
		const updated: MapEntity = {
			...existing,
			assetIds,
			updatedAt: input.importedAt,
			revision: existing.revision + 1,
		};
		nextMaps = { ...state.maps, [mapId]: updated };
	} else {
		// Create a fresh imported map at the resolved deterministic id.
		mapId = targetMapId;
		mapCreated = true;
		// `normalizeMapEntity` fills the annotation lists (empty) + overlay defaults so a freshly imported
		// map starts with no POIs/routes/fog/tokens (MAP-010..019) without hand-rolling those fields.
		const created: MapEntity = normalizeMapEntity({
			id: mapId,
			name: input.mapName ?? 'Imported Map',
			description: 'Imported map.',
			// Fail closed: an imported map is dm-only until the DM reveals it.
			visibility: 'dm-only',
			scale: null,
			projection: { kind: 'flat', rotationDegrees: 0 },
			layers: [importedBaseLayer(input.importedBy, input.importedAt)],
			regions: [],
			assetIds: asset ? [asset.id] : [],
			// MAP-008: a freshly imported map embeds nothing until the DM nests it.
			embeds: [],
			defaultRegionId: null,
			updatedAt: input.importedAt,
			revision: 1,
		});
		nextMaps = { ...state.maps, [mapId]: created };
	}

	return {
		nextState: { ...state, maps: nextMaps, assets: nextAssets },
		mapId,
		mapCreated,
		assetAdded: asset && !assetDeduped ? asset : null,
		assetDeduped,
		droppedElements: [...preview.droppedElements],
	};
}
