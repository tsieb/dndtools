import {
	buildCharacterDataEnvironment,
	buildContentWidgetDataEnvironment,
	deliveredMapIdsForActor,
	entityBindingKey,
	evaluateVisibility,
	getMapViewForActor,
	getSceneForActor,
	normalizeVisibilityLevel,
	type ActorId,
	type CoreStateSlice,
	type WidgetBindingPayload,
	type WidgetDataEnvironment,
} from '@dndtools/core';
import { payloadIndex } from '../../app/board-helpers';

/**
 * RC-CAN-6.1 — the model behind the scene editor's "what player X sees" overlay.
 *
 * Every verdict comes from the ACTOR READ: `getSceneForActor` made AS the previewed actor, against the
 * preview-projected permission state the runtime serves while previewing, with a data environment
 * built by the core's own character + content builders, so a bound tile resolves hidden / missing /
 * conflicted for that actor exactly as the Processing Core decides it. The DM's raw scene only lists
 * which tiles to draw — the overlay has to know about a tile to dim it — and is never consulted for a
 * visibility decision.
 *
 * Two inputs the scene read does not cover get the core's own actor-scoped answer instead:
 * - a tile's authored visibility (`configuration.visibility`, the header's "DM only" / "Players"
 *   chip), which `getSceneForActor` ignores. It goes through the core policy engine
 *   (`evaluateVisibility`) for the same actor, failing closed to `dm-only` as `boardWidgetsOf` paints it;
 * - a map binding. The core's binding builders do not model maps, so a map tile's verdict comes from
 *   `getMapViewForActor` made as the previewed actor with the deliveries the Map tile itself passes —
 *   the read that decides whether that tile draws a map for them.
 *
 * Pure: (state, actorId, sceneId) in, verdicts out — so the e2e can import this module into the page
 * and prove the overlay rendered the previewed actor's read rather than the DM's.
 */

/** How a tile reaches the previewed actor: in full, as an honest placeholder, or not at all. */
export type PreviewTileTone = 'visible' | 'placeholder' | 'hidden';

/** Why. Each value names a `sceneEditor.preview.reason.*` message. */
export type PreviewTileReason =
	| 'visible'
	| 'degraded'
	| 'unbound'
	| 'missing'
	| 'conflicted'
	| 'disabled'
	| 'tileDmOnly'
	| 'tileNotShared'
	| 'bindingDmOnly'
	| 'bindingNotShared'
	| 'bindingFieldHidden'
	| 'bindingHidden'
	| 'sceneDmOnly'
	| 'sceneNotShared'
	| 'outsideSections';

export interface PreviewTileVerdict {
	widgetInstanceId: string;
	tone: PreviewTileTone;
	reason: PreviewTileReason;
}

export interface PlayerPreviewRead {
	/** The actor whose read produced every verdict — always the previewed actor, never the DM. */
	actorId: ActorId;
	/** False when the actor cannot open the scene at all; every tile then carries the scene's reason. */
	sceneDelivered: boolean;
	tiles: Record<string, PreviewTileVerdict>;
	/** Tiles that reach the actor in any form (placeholders included). */
	deliveredCount: number;
}

const TONE: Record<PreviewTileReason, PreviewTileTone> = {
	visible: 'visible',
	degraded: 'visible',
	unbound: 'placeholder',
	missing: 'placeholder',
	conflicted: 'placeholder',
	disabled: 'placeholder',
	tileDmOnly: 'hidden',
	tileNotShared: 'hidden',
	bindingDmOnly: 'hidden',
	bindingNotShared: 'hidden',
	bindingFieldHidden: 'hidden',
	bindingHidden: 'hidden',
	sceneDmOnly: 'hidden',
	sceneNotShared: 'hidden',
	outsideSections: 'hidden',
};

/** The binding type the map read decides (`TileBindDialog` binds maps, characters, content items). */
const MAP_ENTITY_TYPE = 'map';

/**
 * The data environment the actor read resolves this scene's bindings against. The builders mark
 * every character and live content item as a known key, which makes a binding to a deleted one
 * `missing`. They do not model maps, so a bound map is added as known only while it exists: a
 * binding to a deleted map resolves `missing`, and whether a live one reaches the actor is the map
 * read's call (`readPlayerPreview`). Any other type stays unknown and resolves `missing` — a
 * placeholder, never a claim that the actor sees something the preview cannot check.
 */
export function previewDataEnvironment(
	state: CoreStateSlice,
	sceneId: string,
): WidgetDataEnvironment {
	const base = buildCharacterDataEnvironment(
		state.characters,
		buildContentWidgetDataEnvironment(state.content),
	);
	const known = new Set(base.knownEntityKeys ?? Object.keys(base.entities));
	for (const widget of state.scenes.scenes[sceneId]?.widgets ?? []) {
		const source = widget.binding?.source;
		if (source?.entityType === MAP_ENTITY_TYPE && state.maps.maps[source.entityId]) {
			known.add(entityBindingKey(source.entityType, source.entityId));
		}
	}
	return { ...base, knownEntityKeys: [...known] };
}

function bindingReason(payload: WidgetBindingPayload): PreviewTileReason {
	switch (payload.kind) {
		case 'available':
			return 'visible';
		case 'degraded':
			return 'degraded';
		case 'unbound':
			return 'unbound';
		case 'missing':
			return 'missing';
		case 'conflicted':
			return 'conflicted';
		case 'disabled':
			return 'disabled';
		case 'hidden':
			return payload.reason === 'dm-only'
				? 'bindingDmOnly'
				: payload.reason === 'not-shared'
					? 'bindingNotShared'
					: payload.reason === 'field-hidden'
						? 'bindingFieldHidden'
						: 'bindingHidden';
	}
}

/** Read `sceneId` as `actorId` and say, per tile, whether and why it reaches them. */
export function readPlayerPreview(
	state: CoreStateSlice,
	actorId: ActorId,
	sceneId: string,
): PlayerPreviewRead {
	const instances = state.scenes.scenes[sceneId]?.widgets ?? [];
	const tiles: Record<string, PreviewTileVerdict> = {};
	const record = (widgetInstanceId: string, reason: PreviewTileReason) => {
		tiles[widgetInstanceId] = { widgetInstanceId, tone: TONE[reason], reason };
	};

	const summary = getSceneForActor(state.scenes, state.permissions, actorId, sceneId, {
		widgetPackages: state.widgets,
		dataEnvironment: previewDataEnvironment(state, sceneId),
	});
	if ('kind' in summary) {
		const reason = summary.reason === 'dm-only' ? 'sceneDmOnly' : 'sceneNotShared';
		for (const widget of instances) record(widget.id, reason);
		return { actorId, sceneDelivered: false, tiles, deliveredCount: 0 };
	}

	const actor = state.permissions.actors[actorId];
	const delivered = payloadIndex(summary.widgets);
	// The same read and deliveries the Map tile makes (`widgets/builtin/Map.tsx`).
	const deliveredMapIds = deliveredMapIdsForActor(state.session, actorId);
	const mapReachesActor = (mapId: string) =>
		getMapViewForActor(state.maps, state.permissions, actorId, mapId, { deliveredMapIds }).kind ===
		'available';
	for (const widget of instances) {
		const payload = delivered.get(widget.id);
		// Section scoping: the read delivered the scene but not this tile.
		if (!payload) {
			record(widget.id, 'outsideSections');
			continue;
		}
		const own = evaluateVisibility(
			{
				entityType: 'scene-widget',
				entityId: widget.id,
				entity: { level: normalizeVisibilityLevel(widget.configuration.visibility) },
			},
			{},
			actor,
			state.permissions,
		);
		if (!own.visible) {
			record(widget.id, own.reason === 'not-shared' ? 'tileNotShared' : 'tileDmOnly');
			continue;
		}
		const reason = bindingReason(payload);
		const source = widget.binding?.source;
		if (
			source?.entityType === MAP_ENTITY_TYPE &&
			TONE[reason] === 'visible' &&
			!mapReachesActor(source.entityId)
		) {
			// The map read is deliberately silent on why; the DM's own state names it.
			const shared = state.maps.maps[source.entityId]?.visibility === 'shared';
			record(widget.id, shared ? 'bindingNotShared' : 'bindingDmOnly');
			continue;
		}
		record(widget.id, reason);
	}
	const deliveredCount = Object.values(tiles).filter((tile) => tile.tone !== 'hidden').length;
	return { actorId, sceneDelivered: true, tiles, deliveredCount };
}
