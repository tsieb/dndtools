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
	localState: Record<string, unknown>;
	binding: WidgetBinding | null;
	disabled: WidgetDisabledState | null;
}

export interface WidgetDisabledState {
	reason: 'package-disabled' | 'package-removed' | 'migration-failed';
	packageId: string | null;
	diagnosticId: string | null;
	message: string;
	previousVersion: string | null;
	disabledAt: string;
}

export interface PlayerViewAssignment {
	playerActorId: ActorId;
	sectionIds: SectionId[] | null;
}

export interface SceneTemplateMeta {
	isTemplate: boolean;
	instantiatedFromTemplateSceneId: SceneId | null;
}

/**
 * RC-CAN-1.2 — how long a destroyed widget stays restorable, in days. A tombstone older than this is
 * inert (never restorable) and is pruned the next time the scene's tombstones are mutated.
 */
export const WIDGET_TOMBSTONE_RETENTION_DAYS = 30;

/**
 * RC-CAN-1.2 — the record `scene.destroy-widget` leaves behind so `scene.restore-widget` can put the
 * instance back EXACTLY as it was: the whole `WidgetInstance` (id, layout, configuration, binding,
 * localState, disabled) plus the section it belonged to. Restoring re-inserts this verbatim, so an
 * undo of a destroy keeps the widget's identity — a re-add would mint a new id and lose z/dock/pin.
 */
export interface WidgetTombstone {
	widget: WidgetInstance;
	/** The section the instance was listed in, or `null` when it was loose on the canvas. */
	sectionId: SectionId | null;
	/**
	 * The position the instance held in `Scene.widgets`, so a restore puts it back where it was and a
	 * destroy → restore round trip is byte-identical. Clamped on restore: widgets removed meanwhile
	 * only ever pull the index in.
	 */
	index: number;
	/** ISO timestamp of the destroy, from `env.clock()`. Drives the 30-day expiry. */
	destroyedAt: string;
	destroyedByActorId: ActorId;
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
	/**
	 * SOFT-DELETE tombstone (mirrors `ContentItem.deletedAt`). Absent/`null` for a live scene; an ISO
	 * timestamp once the scene is soft-deleted. A tombstoned scene is RECOVERABLE (`scene.restore`
	 * clears it), is OMITTED from every actor-filtered read, and cannot be targeted by scene commands.
	 * Optional so a scene persisted before this field existed hydrates as live.
	 */
	deletedAt?: string | null;
	/**
	 * RC-CAN-1.2 — destroyed widget instances kept restorable for
	 * `WIDGET_TOMBSTONE_RETENTION_DAYS`. Additive and OPTIONAL, so a scene persisted before this field
	 * existed hydrates with no tombstones (an empty bin) rather than failing — no schemaVersion bump.
	 */
	tombstones?: WidgetTombstone[];
	schemaVersion: typeof SCENE_SCHEMA_VERSION;
}

/** Whether a scene is live (not soft-deleted). The single tombstone predicate the reads share. */
export function isLiveScene(scene: Scene): boolean {
	return scene.deletedAt === undefined || scene.deletedAt === null;
}

/** The tombstones of a scene, hydrator-safe: a scene persisted before the field existed has none. */
export function sceneTombstones(scene: Scene): WidgetTombstone[] {
	return scene.tombstones ?? [];
}

/**
 * Whether a tombstone is still inside the retention window at `now`. Both timestamps are ISO; an
 * unparseable `destroyedAt` counts as EXPIRED, so a corrupt record can never be restored (fail closed).
 */
export function isRestorableTombstone(tombstone: WidgetTombstone, now: string): boolean {
	const destroyed = Date.parse(tombstone.destroyedAt);
	const at = Date.parse(now);
	if (Number.isNaN(destroyed) || Number.isNaN(at)) return false;
	return at - destroyed <= WIDGET_TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Drop every expired tombstone. Called on each tombstone mutation (destroy/restore), which is what
 * "expire after 30 days on the next mutation" means: expiry is never a background clock, so replay of
 * the same op log against the same `env.clock()` yields byte-identical state.
 */
export function pruneExpiredTombstones(scene: Scene, now: string): WidgetTombstone[] {
	return sceneTombstones(scene).filter((tombstone) => isRestorableTombstone(tombstone, now));
}

/**
 * A scene carrying `next` as its tombstones. An EMPTY list drops the field entirely, so a scene that
 * has nothing in its bin is byte-identical to one persisted before tombstones existed — which is what
 * makes destroy → restore a clean round trip.
 */
export function withTombstones(scene: Scene, next: WidgetTombstone[]): Scene {
	if (next.length === 0) {
		const { tombstones: _dropped, ...rest } = scene;
		return rest;
	}
	return { ...scene, tombstones: next };
}

/** The destroyed widgets a DM could still restore at `now`, newest destroy first. */
export function listRestorableWidgets(scene: Scene, now: string): WidgetTombstone[] {
	return sceneTombstones(scene)
		.filter((tombstone) => isRestorableTombstone(tombstone, now))
		.slice()
		.sort((a, b) => (a.destroyedAt < b.destroyedAt ? 1 : a.destroyedAt > b.destroyedAt ? -1 : 0));
}

export interface SceneState {
	scenes: Record<SceneId, Scene>;
	schemaVersion: typeof SCENE_STATE_SCHEMA_VERSION;
}

export const EMPTY_SCENE_STATE: SceneState = Object.freeze({
	scenes: {},
	schemaVersion: SCENE_STATE_SCHEMA_VERSION,
});
