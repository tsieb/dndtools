import type { Actor, PermissionState } from '../state/permission-state';
import type { Scene } from '../state/scene-state';
import { hasGrantedCapability } from './grants';

export type SceneVisibilityResult =
	| { kind: 'visible'; assignedSectionIds: string[] | null }
	| { kind: 'hidden'; reason: 'dm-only' | 'not-shared' | 'unknown-actor' };

export function evaluateSceneVisibility(
	scene: Scene,
	actor: Actor | undefined,
	permission?: PermissionState,
): SceneVisibilityResult {
	if (!actor) return { kind: 'hidden', reason: 'unknown-actor' };
	if (actor.role === 'dm') return { kind: 'visible', assignedSectionIds: null };
	if (scene.visibility === 'dm-only') return { kind: 'hidden', reason: 'dm-only' };

	const assignment = scene.playerViewAssignments.find((a) => a.playerActorId === actor.id);
	if (scene.visibility === 'player-visible') {
		return { kind: 'visible', assignedSectionIds: assignment?.sectionIds ?? null };
	}

	const hasSharingTarget = scene.sharingTargets.includes(actor.id);
	const hasViewerGrant = permission
		? hasGrantedCapability(permission, actor, 'scene', scene.id, 'viewer')
		: false;
	if (assignment || hasSharingTarget || hasViewerGrant) {
		return { kind: 'visible', assignedSectionIds: assignment?.sectionIds ?? null };
	}
	return { kind: 'hidden', reason: 'not-shared' };
}

