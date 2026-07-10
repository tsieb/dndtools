import type { ActorId, SceneId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { Scene, SceneState, SectionLayoutRegion, WidgetInstance } from '../state/scene-state';
import { isLiveScene } from '../state/scene-state';
import type {
	PlayerViewDeliveryStatus,
	PlayerViewProjectionTarget,
	SessionPlayerViewAssignment,
	SessionState,
} from '../state/session-state';
import { evaluateSceneVisibility } from '../permissions/visibility';
import {
	findPackageRecordForWidgetType,
	SYSTEM_WIDGET_PACKAGE_STATE,
	type WidgetHostPermission,
	type WidgetPackageState,
} from '../state/widget-package-state';
import {
	resolveWidgetBinding,
	type HiddenBindingReason,
	type WidgetDataEnvironment,
} from './binding';
import { computeWidgetFocusOrder, type SceneFocusEntry } from './focus-order';

export type WidgetBindingPayload =
	| { kind: 'available'; widget: WidgetInstance }
	| {
			kind: 'degraded';
			widget: WidgetInstance;
			unavailableHostPermissions: WidgetHostPermission[];
	  }
	| {
			kind: 'disabled';
			widgetInstanceId: string;
			type: string;
			reason: string;
			packageId: string | null;
	  }
	| { kind: 'hidden'; widgetInstanceId: string; type: string; reason?: HiddenBindingReason }
	| { kind: 'conflicted'; widgetInstanceId: string; type: string; conflictPaths: string[] }
	| { kind: 'unbound'; widgetInstanceId: string; type: string }
	| { kind: 'missing'; widgetInstanceId: string; type: string };

export interface SceneListEntry {
	id: SceneId;
	name: string;
	tags: string[];
	visibility: Scene['visibility'];
	updatedAt: string;
	isTemplate: boolean;
}

export interface SceneSummary {
	id: SceneId;
	name: string;
	description: string;
	tags: string[];
	visibility: Scene['visibility'];
	visualSettings: Scene['visualSettings'];
	ownership: Scene['ownership'];
	sections: SectionLayoutRegion[];
	widgets: WidgetBindingPayload[];
	/**
	 * Deterministic keyboard focus traversal order for the widgets delivered to this
	 * actor (CANVAS-016). Covers every delivered widget instance, including those that
	 * resolve to placeholder states, so no widget control becomes unreachable.
	 */
	focusOrder: SceneFocusEntry[];
	templateMeta: Scene['templateMeta'];
	assignedSectionIds: SectionId[] | null;
}

export interface PlayerViewSummary extends SceneSummary {
	kind: 'assigned';
	playerActorId: ActorId;
	assignmentId: string;
	projectionKind: PlayerViewProjectionTarget['kind'];
	deliveryStatus: PlayerViewDeliveryStatus;
	deliveryReason: SessionPlayerViewAssignment['deliveryReason'];
	projectedWidgetInstanceIds: string[] | null;
}

export type PlayerViewQueryResult =
	| PlayerViewSummary
	| { kind: 'unassigned'; playerActorId: ActorId }
	| { kind: 'denied'; reason: string };

type SectionId = string;

export function listScenesForActor(
	state: SceneState,
	permission: PermissionState,
	actorId: ActorId,
): SceneListEntry[] {
	const actor = permission.actors[actorId];
	if (!actor) return [];
	const out: SceneListEntry[] = [];
	for (const scene of Object.values(state.scenes)) {
		// A soft-deleted scene is OMITTED from every actor-filtered read (tombstone; scene.delete).
		if (!isLiveScene(scene)) continue;
		const evaluation = evaluateSceneVisibility(scene, actor, permission);
		if (evaluation.kind !== 'visible') continue;
		if (scene.templateMeta.isTemplate && actor.role !== 'dm') continue;
		out.push({
			id: scene.id,
			name: scene.name,
			tags: scene.tags,
			visibility: scene.visibility,
			updatedAt: scene.ownership.updatedAt,
			isTemplate: scene.templateMeta.isTemplate,
		});
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

export interface BindingResolver {
	knownEntityIds: ReadonlySet<string>;
	isHiddenForActor: (widget: WidgetInstance, actorId: ActorId) => boolean;
}

export const PERMISSIVE_RESOLVER: BindingResolver = {
	knownEntityIds: new Set<string>(),
	isHiddenForActor: () => false,
};

export interface SceneQueryOptions {
	bindingResolver?: BindingResolver;
	widgetPackages?: WidgetPackageState;
	/**
	 * When supplied, the Processing Core resolves widget bindings per actor against
	 * this data view (CANVAS-009), producing explicit `hidden`, `conflicted`,
	 * `missing`, and `unbound` states. Without it, the legacy `bindingResolver` path
	 * is used.
	 */
	dataEnvironment?: WidgetDataEnvironment;
	projectionScope?: {
		sectionIds: SectionId[] | null;
		widgetInstanceIds: string[] | null;
		allowSceneVisibility: boolean;
	};
}

interface NormalizedOptions {
	bindingResolver: BindingResolver;
	widgetPackages: WidgetPackageState;
	dataEnvironment: WidgetDataEnvironment | null;
	projectionScope: NonNullable<SceneQueryOptions['projectionScope']> | null;
}

function normalizeOptions(options: BindingResolver | SceneQueryOptions): NormalizedOptions {
	if ('knownEntityIds' in options) {
		return {
			bindingResolver: options,
			widgetPackages: SYSTEM_WIDGET_PACKAGE_STATE,
			dataEnvironment: null,
			projectionScope: null,
		};
	}
	return {
		bindingResolver: options.bindingResolver ?? PERMISSIVE_RESOLVER,
		widgetPackages: options.widgetPackages ?? SYSTEM_WIDGET_PACKAGE_STATE,
		dataEnvironment: options.dataEnvironment ?? null,
		projectionScope: options.projectionScope ?? null,
	};
}

export function getSceneForActor(
	state: SceneState,
	permission: PermissionState,
	actorId: ActorId,
	sceneId: SceneId,
	options: BindingResolver | SceneQueryOptions = {},
): SceneSummary | { kind: 'denied'; reason: string } {
	const {
		bindingResolver: resolver,
		widgetPackages,
		dataEnvironment,
		projectionScope,
	} = normalizeOptions(options);
	const actor = permission.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	const scene = state.scenes[sceneId];
	// A tombstoned scene reads exactly like a missing one (non-leaking; scene.delete soft-delete).
	if (!scene || !isLiveScene(scene)) return { kind: 'denied', reason: 'scene-not-found' };

	const evaluation = projectionScope?.allowSceneVisibility
		? ({ kind: 'visible', assignedSectionIds: projectionScope.sectionIds } as const)
		: evaluateSceneVisibility(scene, actor, permission);
	if (evaluation.kind !== 'visible') {
		return { kind: 'denied', reason: evaluation.reason };
	}

	const sectionScope = evaluation.assignedSectionIds;
	const deliverableWidgetIds: ReadonlySet<string> | null =
		sectionScope === null
			? null
			: new Set(
					scene.sections
						.filter((s) => sectionScope.includes(s.id))
						.flatMap((s) => s.widgetInstanceIds),
				);

	const widgets: WidgetBindingPayload[] = [];
	const projectionWidgetIds = projectionScope?.widgetInstanceIds
		? new Set(projectionScope.widgetInstanceIds)
		: null;
	const widgetSourcePool = scene.widgets.filter((widget) => {
		if (deliverableWidgetIds !== null && !deliverableWidgetIds.has(widget.id)) return false;
		if (projectionWidgetIds !== null && !projectionWidgetIds.has(widget.id)) return false;
		return true;
	});

	for (const widget of widgetSourcePool) {
		if (widget.disabled) {
			widgets.push({
				kind: 'disabled',
				widgetInstanceId: widget.id,
				type: widget.type,
				reason: widget.disabled.message,
				packageId: widget.disabled.packageId,
			});
			continue;
		}
		const packageRecord = findPackageRecordForWidgetType(widgetPackages, widget.type);
		if (!packageRecord || packageRecord.removedAt) {
			widgets.push({
				kind: 'disabled',
				widgetInstanceId: widget.id,
				type: widget.type,
				reason: 'Widget package is not installed.',
				packageId: packageRecord?.package.id ?? null,
			});
			continue;
		}
		if (!packageRecord.enabled) {
			widgets.push({
				kind: 'disabled',
				widgetInstanceId: widget.id,
				type: widget.type,
				reason: `Widget package ${packageRecord.package.displayName} is disabled.`,
				packageId: packageRecord.package.id,
			});
			continue;
		}
		const definition = packageRecord.package.widgets.find(
			(candidate) => candidate.type === widget.type,
		);
		if (dataEnvironment) {
			// Processing Core owns actor-scoped binding resolution (CANVAS-009): the
			// data layer decides hidden/conflicted/missing/unbound before any value is
			// returned to the GUI, rather than trusting a caller-supplied predicate.
			const resolution = resolveWidgetBinding(widget.binding, actor, dataEnvironment, {
				bindingRequired: (definition?.requiredBindings.length ?? 0) > 0,
			});
			if (resolution.state === 'unbound') {
				widgets.push({ kind: 'unbound', widgetInstanceId: widget.id, type: widget.type });
				continue;
			}
			if (resolution.state === 'missing') {
				widgets.push({ kind: 'missing', widgetInstanceId: widget.id, type: widget.type });
				continue;
			}
			if (resolution.state === 'hidden') {
				widgets.push({
					kind: 'hidden',
					widgetInstanceId: widget.id,
					type: widget.type,
					reason: resolution.reason,
				});
				continue;
			}
			if (resolution.state === 'conflicted') {
				widgets.push({
					kind: 'conflicted',
					widgetInstanceId: widget.id,
					type: widget.type,
					conflictPaths: resolution.conflictPaths,
				});
				continue;
			}
		} else {
			const known =
				resolver.knownEntityIds.size === 0 ||
				(widget.binding ? resolver.knownEntityIds.has(widget.binding.source.entityId) : true);
			if (widget.binding && !known) {
				widgets.push({ kind: 'missing', widgetInstanceId: widget.id, type: widget.type });
				continue;
			}
			if (resolver.isHiddenForActor(widget, actorId)) {
				widgets.push({ kind: 'hidden', widgetInstanceId: widget.id, type: widget.type });
				continue;
			}
		}
		const unavailableHostPermissions = definition?.hostPermissions.filter(
			(permission) => packageRecord.trust.hostPermissions[permission] !== 'approved',
		);
		if (unavailableHostPermissions && unavailableHostPermissions.length > 0) {
			widgets.push({ kind: 'degraded', widget, unavailableHostPermissions });
			continue;
		}
		widgets.push({ kind: 'available', widget });
	}

	const sections =
		sectionScope === null
			? scene.sections
			: scene.sections.filter((s) => sectionScope.includes(s.id));

	return {
		id: scene.id,
		name: scene.name,
		description: scene.description,
		tags: scene.tags,
		visibility: scene.visibility,
		visualSettings: scene.visualSettings,
		ownership: scene.ownership,
		sections,
		widgets,
		// Focus order is computed over the delivered widget instances so the traversal
		// covers exactly what this actor receives (player-view filtered) and reflects
		// declared z-order/group/dock/pin/focus metadata, not DOM insertion order.
		focusOrder: computeWidgetFocusOrder(widgetSourcePool),
		templateMeta: scene.templateMeta,
		assignedSectionIds: sectionScope,
	};
}

export function getPlayerViewForActor(
	scenes: SceneState,
	permission: PermissionState,
	session: SessionState,
	actorId: ActorId,
	options: Omit<SceneQueryOptions, 'projectionScope'> = {},
): PlayerViewQueryResult {
	const actor = permission.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	const assignment = session.playerViewAssignments[actorId];
	if (!assignment) return { kind: 'unassigned', playerActorId: actorId };

	const summary = getSceneForActor(scenes, permission, actorId, assignment.target.sceneId, {
		...options,
		projectionScope: {
			sectionIds: assignment.target.sectionIds,
			widgetInstanceIds: assignment.target.widgetInstanceIds,
			allowSceneVisibility: true,
		},
	});
	if ('kind' in summary) return summary;
	return {
		...summary,
		kind: 'assigned',
		playerActorId: actorId,
		assignmentId: assignment.id,
		projectionKind: assignment.target.kind,
		deliveryStatus: assignment.deliveryStatus,
		deliveryReason: assignment.deliveryReason,
		projectedWidgetInstanceIds: assignment.target.widgetInstanceIds,
	};
}
