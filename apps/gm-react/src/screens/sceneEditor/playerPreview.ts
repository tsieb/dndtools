import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	buildCharacterDataEnvironment,
	buildContentWidgetDataEnvironment,
	entityBindingKey,
	evaluateVisibility,
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
 * The one input the actor read does not cover is a tile's own authored visibility
 * (`configuration.visibility`, the header's "DM only" / "Players" chip): `getSceneForActor` delivers
 * a tile regardless of it. That setting goes through the core policy engine (`evaluateVisibility`) for
 * the same actor, failing closed to `dm-only` exactly as `boardWidgetsOf` paints the chip.
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

/** The entity types the core's environment builders actually model. */
const MODELLED_ENTITY_TYPES: ReadonlySet<string> = new Set([
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
]);

/**
 * The data environment the actor read resolves this scene's bindings against. The builders mark
 * every character and live content item as a known key, which makes a binding to a deleted one
 * `missing`. A binding to a type they do not model (a map, say) is added as known too: without that
 * the resolver would call a perfectly good map tile `missing` and the preview would lie about it.
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
		if (source && !MODELLED_ENTITY_TYPES.has(source.entityType)) {
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
		record(widget.id, bindingReason(payload));
	}
	const deliveredCount = Object.values(tiles).filter((tile) => tile.tone !== 'hidden').length;
	return { actorId, sceneDelivered: true, tiles, deliveredCount };
}
