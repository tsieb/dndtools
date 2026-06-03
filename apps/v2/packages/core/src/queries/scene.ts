import type { ActorId, SceneId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type {
	Scene,
	SceneState,
	SectionLayoutRegion,
	WidgetInstance,
} from '../state/scene-state';
import { evaluateSceneVisibility } from '../permissions/visibility';

export type WidgetBindingPayload =
	| { kind: 'available'; widget: WidgetInstance }
	| { kind: 'hidden'; widgetInstanceId: string; type: string }
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
	templateMeta: Scene['templateMeta'];
	assignedSectionIds: SectionId[] | null;
}

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
		const evaluation = evaluateSceneVisibility(scene, actor);
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

function isMissingBinding(
	widget: WidgetInstance,
	knownEntityIds: ReadonlySet<string>,
): boolean {
	if (!widget.binding) return false;
	return !knownEntityIds.has(widget.binding.source.entityId);
}

export interface BindingResolver {
	knownEntityIds: ReadonlySet<string>;
	isHiddenForActor: (widget: WidgetInstance, actorId: ActorId) => boolean;
}

export const PERMISSIVE_RESOLVER: BindingResolver = {
	knownEntityIds: new Set<string>(),
	isHiddenForActor: () => false,
};

export function getSceneForActor(
	state: SceneState,
	permission: PermissionState,
	actorId: ActorId,
	sceneId: SceneId,
	resolver: BindingResolver = PERMISSIVE_RESOLVER,
): SceneSummary | { kind: 'denied'; reason: string } {
	const actor = permission.actors[actorId];
	if (!actor) return { kind: 'denied', reason: 'unknown-actor' };
	const scene = state.scenes[sceneId];
	if (!scene) return { kind: 'denied', reason: 'scene-not-found' };

	const evaluation = evaluateSceneVisibility(scene, actor);
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
	const widgetSourcePool =
		deliverableWidgetIds === null
			? scene.widgets
			: scene.widgets.filter((w) => deliverableWidgetIds.has(w.id));

	for (const widget of widgetSourcePool) {
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
		widgets.push({ kind: 'available', widget });
	}

	const sections =
		sectionScope === null
			? scene.sections
			: scene.sections.filter((s) => sectionScope.includes(s.id));

	void isMissingBinding;

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
		templateMeta: scene.templateMeta,
		assignedSectionIds: sectionScope,
	};
}
