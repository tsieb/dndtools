import type { ActorId } from '../state/ids';
import type { Actor, CapabilitySet, PermissionState } from '../state/permission-state';

const SCENE_INHERITANCE: Record<string, CapabilitySet[]> = {
	'co-editor': ['co-editor', 'viewer'],
	viewer: ['viewer'],
};

const WIDGET_INHERITANCE: Record<string, CapabilitySet[]> = {
	manager: ['manager', 'operator', 'viewer'],
	operator: ['operator', 'viewer'],
	viewer: ['viewer'],
};

function effectiveSets(entityType: string, granted: CapabilitySet): CapabilitySet[] {
	if (entityType === 'scene') return SCENE_INHERITANCE[granted] ?? [granted];
	if (entityType === 'widget') return WIDGET_INHERITANCE[granted] ?? [granted];
	return [granted];
}

export function hasGrantedCapability(
	permission: PermissionState,
	actor: Actor,
	entityType: string,
	entityId: string,
	required: CapabilitySet,
): boolean {
	if (actor.role === 'dm') return true;
	for (const grant of permission.grants) {
		if (grant.playerActorId !== actor.id) continue;
		if (grant.entityType !== entityType) continue;
		if (grant.entityId !== entityId) continue;
		if (effectiveSets(entityType, grant.capabilitySet).includes(required)) return true;
	}
	return false;
}

export function actorCanAuthorScene(actor: Actor | undefined): boolean {
	return !!actor && actor.role === 'dm';
}

export function actorCanCoEditScene(
	permission: PermissionState,
	actorId: ActorId,
	sceneId: string,
): boolean {
	const actor = permission.actors[actorId];
	if (!actor) return false;
	if (actor.role === 'dm') return true;
	return hasGrantedCapability(permission, actor, 'scene', sceneId, 'co-editor');
}
