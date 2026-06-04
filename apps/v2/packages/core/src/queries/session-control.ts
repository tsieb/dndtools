import type { MapEntity, MapLayer, MapState } from '../state/map-state';
import type { ActorId } from '../state/ids';
import type { Actor, PermissionState } from '../state/permission-state';
import type {
	SessionActiveMapProjection,
	SessionState,
	SessionWorkflowState,
} from '../state/session-state';

export interface SessionWidgetMode {
	workflow: SessionWorkflowState;
	mode: 'idle' | 'draft' | 'live' | 'paused' | 'ending' | 'archived';
	canMutateActiveSession: boolean;
	recapArchiveId: string | null;
	status: 'ready' | 'degraded' | 'read-only';
}

export function getSessionWidgetMode(session: SessionState): SessionWidgetMode {
	switch (session.workflow) {
		case 'active':
			return {
				workflow: session.workflow,
				mode: 'live',
				canMutateActiveSession: true,
				recapArchiveId: null,
				status: 'ready',
			};
		case 'paused':
			return {
				workflow: session.workflow,
				mode: 'paused',
				canMutateActiveSession: false,
				recapArchiveId: null,
				status: 'degraded',
			};
		case 'prep':
			return {
				workflow: session.workflow,
				mode: 'draft',
				canMutateActiveSession: false,
				recapArchiveId: null,
				status: 'read-only',
			};
		case 'ending':
			return {
				workflow: session.workflow,
				mode: 'ending',
				canMutateActiveSession: false,
				recapArchiveId: null,
				status: 'read-only',
			};
		case 'recap':
		case 'archived':
			return {
				workflow: session.workflow,
				mode: 'archived',
				canMutateActiveSession: false,
				recapArchiveId: session.recapArchiveId,
				status: 'read-only',
			};
		case 'idle':
			return {
				workflow: session.workflow,
				mode: 'idle',
				canMutateActiveSession: false,
				recapArchiveId: null,
				status: 'read-only',
			};
	}
}

export interface SessionParticipantStatus {
	actorId: ActorId;
	workflow: SessionWorkflowState;
	connection: 'live' | 'paused-degraded' | 'inactive';
	canExecuteLiveCommands: boolean;
	recapArchiveId: string | null;
}

export function getSessionParticipantStatus(
	session: SessionState,
	_permissions: PermissionState,
	actorId: ActorId,
): SessionParticipantStatus {
	if (session.workflow === 'active') {
		return {
			actorId,
			workflow: session.workflow,
			connection: 'live',
			canExecuteLiveCommands: true,
			recapArchiveId: null,
		};
	}
	if (session.workflow === 'paused') {
		return {
			actorId,
			workflow: session.workflow,
			connection: 'paused-degraded',
			canExecuteLiveCommands: false,
			recapArchiveId: null,
		};
	}
	return {
		actorId,
		workflow: session.workflow,
		connection: 'inactive',
		canExecuteLiveCommands: false,
		recapArchiveId: session.recapArchiveId,
	};
}

export interface ActiveMapLayerView {
	id: string;
	name: string;
	category: MapLayer['category'];
	opacity: number;
	enabled: boolean;
}

export interface ActiveMapView {
	kind: 'available';
	mapId: string;
	name: string;
	description: string;
	regionId: string | null;
	regionName: string | null;
	layers: ActiveMapLayerView[];
	hiddenLayerCount: number;
	deliveryStatus: SessionActiveMapProjection['deliveryStatus'] | 'dm-local';
	deliveryReason: SessionActiveMapProjection['deliveryReason'] | 'dm-local';
}

export type ActiveMapQueryResult =
	| ActiveMapView
	| { kind: 'none' }
	| { kind: 'missing'; mapId: string }
	| { kind: 'hidden'; mapId: string; reason: string };

function canSeeVisibility(
	actor: Actor,
	visibility: MapEntity['visibility'] | MapLayer['visibility'],
	hasProjection: boolean,
): boolean {
	if (actor.role === 'dm') return true;
	if (visibility === 'dm-only') return false;
	if (visibility === 'player-visible') return true;
	return hasProjection;
}

export function getActiveMapViewForActor(
	maps: MapState,
	permissions: PermissionState,
	session: SessionState,
	actorId: ActorId,
): ActiveMapQueryResult {
	const actor = permissions.actors[actorId];
	if (!actor || !session.activeMap) return { kind: 'none' };
	const map = maps.maps[session.activeMap.mapId];
	if (!map) return { kind: 'missing', mapId: session.activeMap.mapId };
	const projection = session.activeMapProjections[actorId] ?? null;
	const hasProjection =
		actor.role === 'dm' ||
		!!(
			projection &&
			projection.mapId === session.activeMap.mapId &&
			projection.regionId === session.activeMap.regionId
		);
	if (!canSeeVisibility(actor, map.visibility, hasProjection)) {
		return { kind: 'hidden', mapId: map.id, reason: 'map-not-visible' };
	}

	const layers = map.layers.filter((layer) =>
		canSeeVisibility(actor, layer.visibility, hasProjection),
	);
	const hiddenLayerCount = map.layers.length - layers.length;
	const region = session.activeMap.regionId
		? map.regions.find((candidate) => candidate.id === session.activeMap?.regionId)
		: null;
	return {
		kind: 'available',
		mapId: map.id,
		name: map.name,
		description: map.description,
		regionId: session.activeMap.regionId,
		regionName: region?.name ?? null,
		layers: layers.map((layer) => ({
			id: layer.id,
			name: layer.name,
			category: layer.category,
			opacity: layer.opacity,
			enabled: layer.enabled,
		})),
		hiddenLayerCount,
		deliveryStatus: actor.role === 'dm' ? 'dm-local' : (projection?.deliveryStatus ?? 'queued'),
		deliveryReason: actor.role === 'dm' ? 'dm-local' : (projection?.deliveryReason ?? 'offline'),
	};
}
