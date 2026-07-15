import type { ZodType } from 'zod';
import type { CoreCommand, CoreStateSlice } from '../commands/types';
import { buildInverseMapEditCommand } from '../commands/map-editing';
import {
	addMapFeaturesInputSchema,
	appendMapFogInputSchema,
	configureMapOverlayInputSchema,
	createMapLayerInputSchema,
	createMapPoiInputSchema,
	createMapRegionInputSchema,
	createMapRouteInputSchema,
	createMapTokenInputSchema,
	deleteMapLayerInputSchema,
	deleteMapPoiInputSchema,
	deleteMapRegionInputSchema,
	deleteMapRouteInputSchema,
	deleteMapTokenInputSchema,
	deriveMapFeaturesInputSchema,
	duplicateMapLayerInputSchema,
	editMapLayerInputSchema,
	generateMapInputSchema,
	lockMapLayerInputSchema,
	moveMapTokenInputSchema,
	removeMapFeaturesInputSchema,
	removeMapFogInputSchema,
	renameMapLayerInputSchema,
	reorderMapLayerInputSchema,
	setMapLayerEnabledInputSchema,
	setMapLayerOpacityInputSchema,
	setMapLayerTagsInputSchema,
	setMapLayerVisibilityInputSchema,
	setMapOverlayModeInputSchema,
	setMapProjectionInputSchema,
	setMapScaleInputSchema,
	updateMapFeaturesInputSchema,
	updateMapMetadataInputSchema,
	updateMapPoiInputSchema,
	updateMapRegionInputSchema,
	updateMapRouteInputSchema,
	updateMapTokenInputSchema,
} from '../schemas/commands';
import type { MapEntity, MapFeature, MapLayer } from '../state/map-state';
import { MODE_PREREQUISITES } from '../state/map-overlay-modes';
import { createRngStreams } from '../state/prng';
import { getGenerator } from '../generation/registry';
import { resolveParams } from '../generation/types';

/**
 * MAP-021 — PURE INVERSE BUILDERS for every mutating map command.
 *
 * THE UNDO STACK IS NOT IN HERE, AND THAT IS THE DESIGN.
 *
 * Undo history is LOCAL, EPHEMERAL, and APP-SIDE. It is not durable and it is not synced, for two
 * reasons that are not negotiable:
 *
 *   - a co-DM must never be able to undo your brush stroke from across the table. Undo is a property of
 *     one person's editing session, not of the campaign. A synced undo stack would make "undo" mean
 *     "undo whatever anyone did most recently", which is not what any editor has ever meant by it.
 *   - undo state must never enter the op log. The op log is the durable, replayable history of what the
 *     campaign IS; a stack of things someone might take back is not part of that, and putting it there
 *     would make every device replay another device's editing indecision.
 *
 * So `packages/core` exports exactly this: a pure function from (an ACCEPTED command, the state BEFORE
 * it applied) to the command that exactly undoes it. The app keeps the stack, dispatches the returned
 * command through the normal `dispatchCommand` path (so the undo is itself an ordinary, authorized,
 * durably-logged mutation — never a back-door state write), and renders `label` in its History panel.
 *
 * WHY `stateBefore` AND NOT `stateAfter`: the inverse of `map.update-features` needs the features'
 * PRIOR values, and the inverse of `map.delete-layer` needs the deleted layer's whole content. Those
 * exist only in the state before. The consequence is the one asymmetry in this module: a `create-*`
 * command mints its new id inside the handler, so an inverse built from the state before cannot know
 * that id. Every map `create-*` command therefore accepts an OPTIONAL EXPLICIT `id`; the editor supplies
 * it (which it wants anyway, so that undo→redo does not mint a fresh id on every cycle), and a create
 * that omits it is honestly reported as NOT undoable (`null`) rather than being given a wrong inverse.
 */

export interface UndoableMapCommand {
	command: CoreCommand;
	/** Human text for the History panel — describes the FORWARD action ("Painted 12 features"). */
	label: string;
}

function parse<TSchema extends ZodType>(
	schema: TSchema,
	payload: unknown,
): ReturnType<TSchema['parse']> | null {
	const result = schema.safeParse(payload);
	return result.success ? (result.data as ReturnType<TSchema['parse']>) : null;
}

function mapOf(state: CoreStateSlice, mapId: string): MapEntity | null {
	return state.maps.maps[mapId] ?? null;
}

function layerOf(map: MapEntity, layerId: string): MapLayer | null {
	return map.layers.find((layer) => layer.id === layerId) ?? null;
}

/** The complete `layerId → order` map of the state BEFORE, so an order repack can be put back exactly. */
function orderMapOf(map: MapEntity): Record<string, number> {
	return Object.fromEntries(map.layers.map((layer) => [layer.id, layer.order]));
}

/** A plain, deep-cloned snapshot of a layer — the payload `map.restore-layers` writes back verbatim. */
function layerSnapshot(layer: MapLayer): MapLayer {
	return {
		...layer,
		tags: [...layer.tags],
		query: { ...layer.query },
		content: layer.content.map((feature) => ({
			...feature,
			points: feature.points.map((point) => ({ ...point })),
			...(feature.props ? { props: { ...feature.props } } : {}),
		})),
	};
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function undoable(command: CoreCommand, label: string): UndoableMapCommand {
	return { command, label };
}

/**
 * Build the command that exactly undoes `command`, or `null` when it is not undoable.
 *
 * `command` MUST be one the core ACCEPTED, and `stateBefore` MUST be the state it was dispatched
 * against. Pure: no clock, no ids, no state mutation. The returned command is dispatched by the caller.
 */
export function buildMapInverse(
	command: CoreCommand,
	stateBefore: CoreStateSlice,
): UndoableMapCommand | null {
	const actorId = command.actorId;

	switch (command.type) {
		// -------------------------------------------------------------------------------------------
		// Incremental feature editing (MAP-021) — the delta commands are each other's inverses.
		// -------------------------------------------------------------------------------------------
		case 'map.add-features': {
			const payload = parse(addMapFeaturesInputSchema, command.payload);
			if (!payload) return null;
			return undoable(
				{
					type: 'map.remove-features',
					actorId,
					payload: {
						mapId: payload.mapId,
						layerId: payload.layerId,
						featureIds: payload.features.map((feature) => feature.id),
					},
				},
				`Painted ${plural(payload.features.length, 'feature')}`,
			);
		}

		case 'map.update-features': {
			const payload = parse(updateMapFeaturesInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			// The PRIOR values, read out of the state before. A feature the layer did not hold means the
			// forward command could not have been accepted against this state — refuse rather than guess.
			const previous: MapFeature[] = [];
			for (const feature of payload.features) {
				const prior = layer.content.find((candidate) => candidate.id === feature.id);
				if (!prior) return null;
				previous.push(prior);
			}
			return undoable(
				{
					type: 'map.update-features',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, features: previous },
				},
				`Edited ${plural(previous.length, 'feature')}`,
			);
		}

		case 'map.remove-features': {
			const payload = parse(removeMapFeaturesInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			const features: MapFeature[] = [];
			const indices: number[] = [];
			for (const featureId of payload.featureIds) {
				const index = layer.content.findIndex((candidate) => candidate.id === featureId);
				if (index < 0) return null;
				features.push(layer.content[index]!);
				// The INDEX matters: re-adding at the original index restores the exact array (and so the
				// exact render order), where a plain append would silently reorder the stack.
				indices.push(index);
			}
			return undoable(
				{
					type: 'map.add-features',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, features, indices },
				},
				`Erased ${plural(features.length, 'feature')}`,
			);
		}

		// MAP-003 — the shipped wholesale paint edit: its inverse is itself with before/after swapped.
		case 'map.edit-layer': {
			const payload = parse(editMapLayerInputSchema, command.payload);
			if (!payload) return null;
			return undoable(
				{ type: 'map.edit-layer', actorId, payload: buildInverseMapEditCommand(payload) },
				'Painted layer',
			);
		}

		// -------------------------------------------------------------------------------------------
		// Generation + derivation — undone at LAYER granularity (they create layers, and POIs with them).
		// -------------------------------------------------------------------------------------------
		case 'map.generate': {
			const payload = parse(generateMapInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			const definition = getGenerator(payload.generatorId);
			if (!definition) return null;
			const resolved = resolveParams(definition, payload.params);
			if ('error' in resolved) return null;

			// RE-RUN the generator to learn which ids it produced. This is sound precisely because
			// generation is deterministic (Contract 2): the same `{generatorId, seed, params, idPrefix}`
			// produces the same layer/POI ids, every time, on every device. It is also the ONLY way to know
			// them from the state BEFORE — which is the same property that lets the durable op carry the
			// parameters instead of the geometry.
			const output = definition.run({
				params: resolved.params,
				rng: createRngStreams(payload.seed),
				idPrefix: payload.idPrefix,
				visibility: payload.visibility,
				stamp: { actorId, now: map.updatedAt },
			});

			const targetLayerIds = payload.targetLayerIds ?? [];
			const replaced = targetLayerIds
				.map((layerId) => layerOf(map, layerId))
				.filter((layer): layer is MapLayer => layer !== null);
			if (replaced.length !== targetLayerIds.length) return null;

			return undoable(
				{
					type: 'map.restore-layers',
					actorId,
					payload: {
						mapId: payload.mapId,
						removeLayerIds: output.layers.map((layer) => layer.id),
						restoreLayers: replaced.map(layerSnapshot),
						removePoiIds: (output.pois ?? []).map((poi) => poi.id),
						restorePois: [],
						order: orderMapOf(map),
					},
				},
				`Generated ${definition.label.toLowerCase()}`,
			);
		}

		case 'map.derive-features': {
			const payload = parse(deriveMapFeaturesInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			const label = 'Derived walls, doors and lights';

			if (payload.targetLayerId) {
				// The derived features were APPENDED to an existing layer: put that layer back as it was.
				const target = layerOf(map, payload.targetLayerId);
				if (!target) return null;
				return undoable(
					{
						type: 'map.restore-layers',
						actorId,
						payload: {
							mapId: payload.mapId,
							removeLayerIds: [],
							restoreLayers: [layerSnapshot(target)],
							order: orderMapOf(map),
						},
					},
					label,
				);
			}
			// No target: the handler created `<idPrefix>-derived` (a deterministic id, so the inverse knows
			// it without having to re-derive a single wall).
			return undoable(
				{
					type: 'map.restore-layers',
					actorId,
					payload: {
						mapId: payload.mapId,
						removeLayerIds: [`${payload.idPrefix}-derived`],
						restoreLayers: [],
						order: orderMapOf(map),
					},
				},
				label,
			);
		}

		// -------------------------------------------------------------------------------------------
		// Layer lifecycle + presentation axes.
		// -------------------------------------------------------------------------------------------
		case 'map.create-layer': {
			const payload = parse(createMapLayerInputSchema, command.payload);
			// Without an explicit id the minted id is unknowable from the state before — say so.
			if (!payload?.id) return null;
			return undoable(
				{
					type: 'map.delete-layer',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.id },
				},
				`Created layer "${payload.name}"`,
			);
		}

		case 'map.duplicate-layer': {
			const payload = parse(duplicateMapLayerInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{
					type: 'map.delete-layer',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.id },
				},
				'Duplicated layer',
			);
		}

		case 'map.delete-layer': {
			const payload = parse(deleteMapLayerInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!map || !layer) return null;
			// A delete REPACKS every other layer's order, so the inverse restores the layer's whole content
			// AND re-applies the prior order map. Restoring the layer alone would collide two layers on one
			// order value.
			return undoable(
				{
					type: 'map.restore-layers',
					actorId,
					payload: {
						mapId: payload.mapId,
						removeLayerIds: [],
						restoreLayers: [layerSnapshot(layer)],
						order: orderMapOf(map),
					},
				},
				`Deleted layer "${layer.name}"`,
			);
		}

		case 'map.rename-layer': {
			const payload = parse(renameMapLayerInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.rename-layer',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, name: layer.name },
				},
				`Renamed layer to "${payload.name}"`,
			);
		}

		case 'map.reorder-layer': {
			const payload = parse(reorderMapLayerInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.reorder-layer',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, toOrder: layer.order },
				},
				`Reordered layer "${layer.name}"`,
			);
		}

		case 'map.lock-layer': {
			const payload = parse(lockMapLayerInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.lock-layer',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, locked: layer.locked },
				},
				payload.locked ? `Locked layer "${layer.name}"` : `Unlocked layer "${layer.name}"`,
			);
		}

		case 'map.set-layer-visibility': {
			const payload = parse(setMapLayerVisibilityInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.set-layer-visibility',
					actorId,
					payload: {
						mapId: payload.mapId,
						layerId: payload.layerId,
						visibility: layer.visibility,
					},
				},
				`Set layer "${layer.name}" to ${payload.visibility}`,
			);
		}

		case 'map.set-layer-enabled': {
			const payload = parse(setMapLayerEnabledInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.set-layer-enabled',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, enabled: layer.enabled },
				},
				payload.enabled ? `Showed layer "${layer.name}"` : `Hid layer "${layer.name}"`,
			);
		}

		case 'map.set-layer-opacity': {
			const payload = parse(setMapLayerOpacityInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.set-layer-opacity',
					actorId,
					payload: { mapId: payload.mapId, layerId: payload.layerId, opacity: layer.opacity },
				},
				`Set layer "${layer.name}" opacity`,
			);
		}

		case 'map.set-layer-tags': {
			const payload = parse(setMapLayerTagsInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const layer = map ? layerOf(map, payload.layerId) : null;
			if (!layer) return null;
			return undoable(
				{
					type: 'map.set-layer-tags',
					actorId,
					payload: {
						mapId: payload.mapId,
						layerId: payload.layerId,
						tags: [...layer.tags],
						query: { ...layer.query },
					},
				},
				`Retagged layer "${layer.name}"`,
			);
		}

		// -------------------------------------------------------------------------------------------
		// POIs / routes / tokens / fog.
		// -------------------------------------------------------------------------------------------
		case 'map.create-poi': {
			const payload = parse(createMapPoiInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{ type: 'map.delete-poi', actorId, payload: { mapId: payload.mapId, poiId: payload.id } },
				`Created POI "${payload.label}"`,
			);
		}

		case 'map.update-poi': {
			const payload = parse(updateMapPoiInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const poi = map?.pois.find((candidate) => candidate.id === payload.poiId);
			if (!poi) return null;
			return undoable(
				{
					type: 'map.update-poi',
					actorId,
					payload: {
						mapId: payload.mapId,
						poiId: poi.id,
						label: poi.label,
						category: poi.category,
						position: { ...poi.position },
						visibility: poi.visibility,
						notes: poi.notes,
						layerId: poi.layerId,
						linkedEntityType: poi.linkedEntityType,
						linkedEntityId: poi.linkedEntityId,
					},
				},
				`Edited POI "${poi.label}"`,
			);
		}

		case 'map.delete-poi': {
			const payload = parse(deleteMapPoiInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const poi = map?.pois.find((candidate) => candidate.id === payload.poiId);
			if (!poi) return null;
			return undoable(
				{
					type: 'map.create-poi',
					actorId,
					payload: {
						mapId: payload.mapId,
						id: poi.id,
						layerId: poi.layerId,
						label: poi.label,
						category: poi.category,
						position: { ...poi.position },
						visibility: poi.visibility,
						notes: poi.notes,
						linkedEntityType: poi.linkedEntityType,
						linkedEntityId: poi.linkedEntityId,
					},
				},
				`Deleted POI "${poi.label}"`,
			);
		}

		case 'map.create-route': {
			const payload = parse(createMapRouteInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{
					type: 'map.delete-route',
					actorId,
					payload: { mapId: payload.mapId, routeId: payload.id },
				},
				`Created route "${payload.label}"`,
			);
		}

		case 'map.update-route': {
			const payload = parse(updateMapRouteInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const route = map?.routes.find((candidate) => candidate.id === payload.routeId);
			if (!route) return null;
			return undoable(
				{
					type: 'map.update-route',
					actorId,
					payload: {
						mapId: payload.mapId,
						routeId: route.id,
						label: route.label,
						visibility: route.visibility,
						waypoints: route.waypoints.map((waypoint) => ({
							...waypoint,
							position: { ...waypoint.position },
						})),
					},
				},
				`Edited route "${route.label}"`,
			);
		}

		case 'map.delete-route': {
			const payload = parse(deleteMapRouteInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const route = map?.routes.find((candidate) => candidate.id === payload.routeId);
			if (!route) return null;
			return undoable(
				{
					type: 'map.create-route',
					actorId,
					payload: {
						mapId: payload.mapId,
						id: route.id,
						layerId: route.layerId,
						label: route.label,
						visibility: route.visibility,
						waypoints: route.waypoints.map((waypoint) => ({
							...waypoint,
							position: { ...waypoint.position },
						})),
					},
				},
				`Deleted route "${route.label}"`,
			);
		}

		case 'map.create-token': {
			const payload = parse(createMapTokenInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{
					type: 'map.delete-token',
					actorId,
					payload: { mapId: payload.mapId, tokenId: payload.id },
				},
				`Placed token "${payload.label}"`,
			);
		}

		case 'map.move-token': {
			const payload = parse(moveMapTokenInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const token = map?.tokens.find((candidate) => candidate.id === payload.tokenId);
			if (!token) return null;
			return undoable(
				{
					type: 'map.move-token',
					actorId,
					payload: {
						mapId: payload.mapId,
						tokenId: token.id,
						position: { ...token.position },
					},
				},
				`Moved token "${token.label}"`,
			);
		}

		case 'map.update-token': {
			const payload = parse(updateMapTokenInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const token = map?.tokens.find((candidate) => candidate.id === payload.tokenId);
			if (!token) return null;
			return undoable(
				{
					type: 'map.update-token',
					actorId,
					payload: {
						mapId: payload.mapId,
						tokenId: token.id,
						label: token.label,
						visibility: token.visibility,
						size: token.size,
						controllerActorId: token.controllerActorId,
						linkedActorId: token.linkedActorId,
					},
				},
				`Edited token "${token.label}"`,
			);
		}

		case 'map.delete-token': {
			const payload = parse(deleteMapTokenInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const token = map?.tokens.find((candidate) => candidate.id === payload.tokenId);
			if (!token) return null;
			return undoable(
				{
					type: 'map.create-token',
					actorId,
					payload: {
						mapId: payload.mapId,
						id: token.id,
						layerId: token.layerId,
						label: token.label,
						linkedActorId: token.linkedActorId,
						position: { ...token.position },
						size: token.size,
						visibility: token.visibility,
						controllerActorId: token.controllerActorId,
					},
				},
				`Removed token "${token.label}"`,
			);
		}

		case 'map.append-fog': {
			const payload = parse(appendMapFogInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{ type: 'map.remove-fog', actorId, payload: { mapId: payload.mapId, fogId: payload.id } },
				payload.kind === 'reveal' ? 'Revealed fog' : 'Concealed fog',
			);
		}

		case 'map.remove-fog': {
			const payload = parse(removeMapFogInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const fog = map?.fog.find((candidate) => candidate.id === payload.fogId);
			if (!fog) return null;
			return undoable(
				{
					type: 'map.append-fog',
					actorId,
					payload: {
						mapId: payload.mapId,
						id: fog.id,
						layerId: fog.layerId,
						kind: fog.kind,
						region: fog.region,
						...(fog.feather !== undefined ? { feather: fog.feather } : {}),
						visibility: fog.visibility,
					},
				},
				'Removed a fog operation',
			);
		}

		// -------------------------------------------------------------------------------------------
		// Overlay / regions / map metadata.
		// -------------------------------------------------------------------------------------------
		case 'map.set-overlay-mode': {
			const payload = parse(setMapOverlayModeInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			// A set-mode that AUTO-SATISFIED a prerequisite also flipped `gridVisible`/`tokensEnabled`, and a
			// mode change alone cannot put those back — one command cannot restore both axes. Rather than
			// hand back an inverse that silently leaves the grid switched on, report it as not undoable and
			// let the History panel say so.
			const autoSatisfied =
				payload.autoSatisfyPrerequisites &&
				MODE_PREREQUISITES[payload.mode].some((prerequisite) =>
					prerequisite === 'grid-visible' ? !map.overlay.gridVisible : !map.overlay.tokensEnabled,
				);
			if (autoSatisfied) return null;
			return undoable(
				{
					type: 'map.set-overlay-mode',
					actorId,
					payload: { mapId: payload.mapId, mode: map.overlay.mode },
				},
				`Entered ${payload.mode} overlay mode`,
			);
		}

		case 'map.configure-overlay': {
			const payload = parse(configureMapOverlayInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			return undoable(
				{
					type: 'map.configure-overlay',
					actorId,
					payload: {
						mapId: payload.mapId,
						gridVisible: map.overlay.gridVisible,
						gridSize: map.overlay.gridSize,
						tokensEnabled: map.overlay.tokensEnabled,
						unitsPerCell: map.overlay.unitsPerCell,
					},
				},
				'Configured the combat overlay',
			);
		}

		case 'map.create-region': {
			const payload = parse(createMapRegionInputSchema, command.payload);
			if (!payload?.id) return null;
			return undoable(
				{
					type: 'map.delete-region',
					actorId,
					payload: { mapId: payload.mapId, regionId: payload.id },
				},
				`Created region "${payload.name}"`,
			);
		}

		case 'map.update-region': {
			const payload = parse(updateMapRegionInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const region = map?.regions.find((candidate) => candidate.id === payload.regionId);
			if (!region) return null;
			return undoable(
				{
					type: 'map.update-region',
					actorId,
					payload: {
						mapId: payload.mapId,
						regionId: region.id,
						name: region.name,
						bounds: { ...region.bounds },
					},
				},
				`Edited region "${region.name}"`,
			);
		}

		case 'map.delete-region': {
			const payload = parse(deleteMapRegionInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			const region = map?.regions.find((candidate) => candidate.id === payload.regionId);
			if (!map || !region) return null;
			// `makeDefault` restores `defaultRegionId` too: deleting the default CLEARED it, so an undo that
			// only put the region back would leave the map opening on nothing.
			return undoable(
				{
					type: 'map.create-region',
					actorId,
					payload: {
						mapId: payload.mapId,
						id: region.id,
						name: region.name,
						bounds: { ...region.bounds },
						makeDefault: map.defaultRegionId === region.id,
					},
				},
				`Deleted region "${region.name}"`,
			);
		}

		case 'map.set-scale': {
			const payload = parse(setMapScaleInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			return undoable(
				{
					type: 'map.set-scale',
					actorId,
					payload: { mapId: payload.mapId, scale: map.scale ? { ...map.scale } : null },
				},
				'Changed the map scale',
			);
		}

		case 'map.set-projection': {
			const payload = parse(setMapProjectionInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			return undoable(
				{
					type: 'map.set-projection',
					actorId,
					payload: { mapId: payload.mapId, projection: { ...map.projection } },
				},
				'Changed the map projection',
			);
		}

		case 'map.update-metadata': {
			const payload = parse(updateMapMetadataInputSchema, command.payload);
			if (!payload) return null;
			const map = mapOf(stateBefore, payload.mapId);
			if (!map) return null;
			return undoable(
				{
					type: 'map.update-metadata',
					actorId,
					payload: {
						mapId: payload.mapId,
						// Only the fields the forward command actually touched are restored, so the inverse
						// cannot accidentally rewrite a field nobody changed.
						...(payload.name !== undefined ? { name: map.name } : {}),
						...(payload.description !== undefined ? { description: map.description } : {}),
					},
				},
				'Renamed the map',
			);
		}

		// Everything else is deliberately NOT undoable through this path: creating/deleting a MAP, an
		// import, an embed, and `map.restore-layers` itself (which IS an undo). Returning null is the
		// honest answer — the History panel greys the entry out rather than offering a wrong inverse.
		default:
			return null;
	}
}
