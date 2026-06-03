import type { ActorId, GroupId, SceneId, SectionId, WidgetInstanceId } from './ids';

export const SCENE_STATE_SCHEMA_VERSION = 1 as const;
export const SCENE_SCHEMA_VERSION = 1 as const;

export type SceneVisibility = 'dm-only' | 'shared' | 'player-visible';

export type SceneBackground = 'paper' | 'parchment' | 'dark' | 'grid';

export type WidgetDock = 'left' | 'right' | 'top' | 'bottom' | null;

export interface SceneOwnership {
	ownerActorId: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

export interface SceneVisualSettings {
	background: SceneBackground;
	accentColor?: string;
}

export interface SectionLayoutRegion {
	id: SectionId;
	name: string;
	bounds: { x: number; y: number; w: number; h: number };
	widgetInstanceIds: WidgetInstanceId[];
}

export interface WidgetBinding {
	source: {
		entityType: string;
		entityId: string;
		selector?: string;
	};
	mode: 'read' | 'operate' | 'manage' | 'observe';
	requiredCapability: 'manager' | 'operator' | 'viewer';
}

export interface WidgetLayout {
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	groupId: GroupId | null;
	dock: WidgetDock;
	pinned: boolean;
	focusOrder: number | null;
}

export interface WidgetInstance {
	id: WidgetInstanceId;
	type: string;
	version: string;
	layout: WidgetLayout;
	configuration: Record<string, unknown>;
	binding: WidgetBinding | null;
}

export interface PlayerViewAssignment {
	playerActorId: ActorId;
	sectionIds: SectionId[] | null;
}

export interface SceneTemplateMeta {
	isTemplate: boolean;
	instantiatedFromTemplateSceneId: SceneId | null;
}

export interface Scene {
	id: SceneId;
	name: string;
	description: string;
	tags: string[];
	visibility: SceneVisibility;
	visualSettings: SceneVisualSettings;
	ownership: SceneOwnership;
	sharingTargets: ActorId[];
	playerViewAssignments: PlayerViewAssignment[];
	templateMeta: SceneTemplateMeta;
	sections: SectionLayoutRegion[];
	widgets: WidgetInstance[];
	schemaVersion: typeof SCENE_SCHEMA_VERSION;
}

export interface SceneState {
	scenes: Record<SceneId, Scene>;
	schemaVersion: typeof SCENE_STATE_SCHEMA_VERSION;
}

export const EMPTY_SCENE_STATE: SceneState = Object.freeze({
	scenes: {},
	schemaVersion: SCENE_STATE_SCHEMA_VERSION,
});

export function isWidgetInGroup(widget: WidgetInstance, groupId: GroupId): boolean {
	return widget.layout.groupId === groupId;
}
