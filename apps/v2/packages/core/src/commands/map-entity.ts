import {
	commitMapImportInputSchema,
	createMapInputSchema,
	importMapAssetInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import { normalizeMapEntity, normalizeMapLayer } from '../state/map-state';
import {
	previewMapImport,
	stageMapImport,
	type MapImportAdapterRegistry,
	type MapImportElementKind,
	type MapImportRejectionReason,
	type MapImportRequest,
} from '../state/map-import';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';
import type { CommandResult, CoreEnvironment, CoreStateSlice } from './types';

/**
 * MAP-001 / MAP-002 / MAP-020 — durable map-entity + asset import command handlers.
 *
 * `map.create` (MAP-001): create a map entity with name, scale, projection metadata, default
 * visibility, and an initial layer set. DM-only. Default visibility FAILS CLOSED to `dm-only`. Inputs
 * are validated fail-closed by the schema (bad scale/projection rejected) BEFORE any mutation. A fresh
 * map always gets at least one layer (a default base layer when the initial set is empty).
 *
 * `map.import-asset` (MAP-002): import an image/SVG into a map as a CONTENT-ADDRESSED asset — the asset
 * id is the hash of its bytes, so identical bytes dedupe to one asset and the hash is the integrity
 * check. Size/MIME are validated fail-closed before any storage mutation.
 *
 * `map.commit-import` (MAP-020): commit a previewed import as a TRANSACTION. The handler re-runs the
 * pure preview + staging; an external format with no declared adapter is rejected fail-closed and the
 * state is left byte-identical (no partial commit). Unsupported elements are reported on the durable op
 * for audit, never silently dropped.
 *
 * All three are DM-only Processing-Core commands; the GUI dispatches intents and never reaches storage.
 */

/** Require DM authority; shared preamble for every map-entity command. */
function requireMapDm(state: CoreStateSlice, actorId: string): { actorId: string } | CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);
	return { actorId: actor.id };
}

/**
 * MAP-001: create a map entity. Validation is fail-closed (the schema rejects a non-positive scale or
 * an unknown projection); default visibility fails closed to `dm-only`. Rejects a duplicate map id.
 */
export function handleCreateMap(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const parsed = parseInput(createMapInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const dm = requireMapDm(state, actorId);
	if ('status' in dm) return dm;

	const now = env.clock();
	const mapId = env.ids();
	if (state.maps.maps[mapId]) {
		return reject({ code: 'invalid-state', message: `Map ${mapId} already exists.` }, state);
	}

	// Build the initial layer set. An empty request seeds a single default base layer so the map always
	// has at least one layer (the layer reducers enforce "a map keeps at least one layer").
	const requested = parsed.data.initialLayers;
	const sourceLayers =
		requested.length > 0
			? requested
			: [
					{
						name: 'Base',
						category: 'base' as const,
						visibility: 'dm-only' as const,
						enabled: true,
						opacity: 1,
						tags: [] as string[],
						query: {} as Record<string, string>,
					},
				];
	const layers: MapLayer[] = sourceLayers.map((layer, index) =>
		normalizeMapLayer(
			{
				id: `${mapId}-layer-${index}`,
				name: layer.name,
				category: layer.category,
				visibility: layer.visibility,
				enabled: layer.enabled,
				opacity: layer.opacity,
				tags: layer.tags,
				query: layer.query,
				updatedBy: dm.actorId,
				updatedAt: now,
			},
			index,
		),
	);

	// `normalizeMapEntity` fills the MAP-010/011/012/013/019 annotation lists (empty) and the MAP-014
	// overlay defaults, so a freshly created map starts with no POIs/routes/fog/tokens and the default
	// overlay settings without the handler hand-rolling those fields.
	const map: MapEntity = normalizeMapEntity({
		id: mapId,
		name: parsed.data.name,
		description: parsed.data.description,
		visibility: parsed.data.visibility,
		scale: parsed.data.scale,
		projection: parsed.data.projection,
		layers,
		regions: [],
		assetIds: [],
		// MAP-008: a freshly created map embeds no child until the DM nests one (map.embed-child).
		embeds: [],
		defaultRegionId: null,
		updatedAt: now,
		revision: 1,
	});

	const nextMaps: MapState = { ...state.maps, maps: { ...state.maps.maps, [mapId]: map } };
	const { log: nextLog, op } = appendOperationDraft(env, state.sync, dm.actorId, {
		entityType: 'map',
		entityId: mapId,
		opType: 'map.create',
		path: '',
		value: {
			name: map.name,
			visibility: map.visibility,
			scale: map.scale,
			projection: map.projection,
			layerIds: layers.map((layer) => layer.id),
		},
		afterRevision: map.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, maps: nextMaps, sync: nextLog },
		events: [{ kind: 'map.created', mapId, actorId: dm.actorId }],
		operationIds: [op.id],
	};
}

/**
 * MAP-002: import a native image/SVG asset into a map as a content-addressed asset. Reuses the import
 * preview/staging transaction so the same fail-closed validation (size/MIME, before any mutation) and
 * content-addressed dedupe apply. The asset is attached to the named existing map.
 */
export function handleImportMapAsset(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
	registry: MapImportAdapterRegistry,
): CommandResult {
	const parsed = parseInput(importMapAssetInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const dm = requireMapDm(state, actorId);
	if ('status' in dm) return dm;

	if (!state.maps.maps[parsed.data.mapId]) {
		return reject(
			{ code: 'map-not-found', message: `Map ${parsed.data.mapId} does not exist.` },
			state,
		);
	}

	const now = env.clock();
	const request: MapImportRequest = {
		formatId: null,
		asset: {
			bytes: Uint8Array.from(parsed.data.bytes),
			mimeType: parsed.data.asset.mimeType,
			fileName: parsed.data.asset.fileName,
			dimensions: parsed.data.asset.dimensions,
			maxBytes: parsed.data.asset.maxBytes,
		},
		declaredElements: [],
		importedBy: dm.actorId,
		importedAt: now,
	};

	const preview = previewMapImport(registry, request);
	if (!preview.ok) {
		return reject({ code: importRejectionCode(preview.reason), message: preview.message }, state);
	}

	return commitStagedImport(state, env, dm.actorId, preview, parsed.data.mapId, undefined);
}

/**
 * MAP-020: commit a previewed import as a transaction. Re-runs the pure preview; on rejection NOTHING
 * is written (the prior state is byte-identical). On success the staged `MapState` is adopted and a
 * durable op records what imported + what was dropped (reported for audit).
 */
export function handleCommitMapImport(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
	registry: MapImportAdapterRegistry,
): CommandResult {
	const parsed = parseInput(commitMapImportInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const dm = requireMapDm(state, actorId);
	if ('status' in dm) return dm;

	if (parsed.data.mapId && !state.maps.maps[parsed.data.mapId]) {
		return reject(
			{ code: 'map-not-found', message: `Map ${parsed.data.mapId} does not exist.` },
			state,
		);
	}

	const now = env.clock();
	const request: MapImportRequest = {
		formatId: parsed.data.formatId,
		asset:
			parsed.data.bytes && parsed.data.asset
				? {
						bytes: Uint8Array.from(parsed.data.bytes),
						mimeType: parsed.data.asset.mimeType,
						fileName: parsed.data.asset.fileName,
						dimensions: parsed.data.asset.dimensions,
						maxBytes: parsed.data.asset.maxBytes,
					}
				: null,
		declaredElements: parsed.data.declaredElements as MapImportElementKind[],
		importedBy: dm.actorId,
		importedAt: now,
	};

	const preview = previewMapImport(registry, request);
	if (!preview.ok) {
		// Fail closed: no partial state. The prior state is returned untouched (no partial commit).
		return reject({ code: importRejectionCode(preview.reason), message: preview.message }, state);
	}

	return commitStagedImport(
		state,
		env,
		dm.actorId,
		preview,
		parsed.data.mapId,
		parsed.data.mapName,
	);
}

/** Shared commit tail for both asset import and full import: stage, append the op, emit the event. */
function commitStagedImport(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	preview: Extract<ReturnType<typeof previewMapImport>, { ok: true }>,
	mapId: string | null,
	mapName: string | undefined,
): CommandResult {
	const now = env.clock();
	const staged = stageMapImport(state.maps, {
		preview,
		mapId,
		mapName,
		importedBy: actorId,
		importedAt: now,
	});

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actorId, {
		entityType: 'map',
		entityId: staged.mapId,
		opType: staged.mapCreated ? 'map.import.create' : 'map.import.attach',
		path: staged.assetAdded ? `assets/${staged.assetAdded.id}` : 'assets',
		value: {
			mode: preview.mode,
			assetId: staged.assetAdded?.id ?? null,
			assetDeduped: staged.assetDeduped,
			importedElements: preview.importedElements,
			// Reported, NEVER silently dropped: the durable op records which elements the adapter
			// could not map so the audit trail is complete.
			droppedElements: staged.droppedElements,
		},
		afterRevision: staged.nextState.maps[staged.mapId]?.revision,
	});

	return {
		status: 'accepted',
		nextState: { ...state, maps: staged.nextState, sync: nextLog },
		events: [
			{
				kind: 'map.import-committed',
				mapId: staged.mapId,
				mapCreated: staged.mapCreated,
				assetId: staged.assetAdded?.id ?? null,
				assetDeduped: staged.assetDeduped,
				droppedElementCount: staged.droppedElements.length,
				actorId,
			},
		],
		operationIds: [op.id],
	};
}

/** Map a pure import rejection reason onto a command rejection code. */
function importRejectionCode(
	reason: MapImportRejectionReason,
): 'invalid-payload' | 'invalid-state' {
	return reason === 'unsupported-format' || reason === 'invalid-asset'
		? 'invalid-payload'
		: 'invalid-state';
}
