import { hasDmAuthority } from '../state/permission-state';
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
	/**
	 * Whether session widgets may write session state (roll, run combat, deliver, time). RC-SES-6.1: true
	 * in every workflow, because Standby permits everything.
	 */
	canMutateActiveSession: boolean;
	/**
	 * RC-SES-6.1 — whether the session is live, i.e. what a widget does now counts toward the session log,
	 * capture and recap. Outside a live session widgets still work; their records are "Outside a session".
	 */
	recording: boolean;
	recapArchiveId: string | null;
	/** `read-only` only while a recap archive is under review; the archive itself never changes. */
	status: 'ready' | 'degraded' | 'read-only';
}

export function getSessionWidgetMode(session: SessionState): SessionWidgetMode {
	const base = { workflow: session.workflow, canMutateActiveSession: true, recording: false };
	switch (session.workflow) {
		case 'active':
			return { ...base, mode: 'live', recording: true, recapArchiveId: null, status: 'ready' };
		case 'paused':
			return { ...base, mode: 'paused', recapArchiveId: null, status: 'degraded' };
		case 'prep':
			return { ...base, mode: 'draft', recapArchiveId: null, status: 'ready' };
		case 'ending':
			return { ...base, mode: 'ending', recapArchiveId: null, status: 'ready' };
		case 'recap':
		case 'archived':
			return {
				...base,
				mode: 'archived',
				recapArchiveId: session.recapArchiveId,
				status: 'read-only',
			};
		case 'idle':
			return { ...base, mode: 'idle', recapArchiveId: null, status: 'ready' };
	}
}

export interface SessionParticipantStatus {
	actorId: ActorId;
	workflow: SessionWorkflowState;
	connection: 'live' | 'paused-degraded' | 'inactive';
	/** RC-SES-6.1 — session commands run in every workflow, so this is always true. */
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
			canExecuteLiveCommands: true,
			recapArchiveId: null,
		};
	}
	return {
		actorId,
		workflow: session.workflow,
		connection: 'inactive',
		canExecuteLiveCommands: true,
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
	if (hasDmAuthority(actor.role)) return true;
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
		hasDmAuthority(actor.role) ||
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
		deliveryStatus: hasDmAuthority(actor.role) ? 'dm-local' : (projection?.deliveryStatus ?? 'queued'),
		deliveryReason: hasDmAuthority(actor.role) ? 'dm-local' : (projection?.deliveryReason ?? 'offline'),
	};
}
