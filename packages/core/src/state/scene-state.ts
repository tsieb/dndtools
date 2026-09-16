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
	/**
	 * RC-CAN-7.2 / ADR-041 — SCREEN metadata: pinned, pin order, layout policy and origin. Additive and
	 * OPTIONAL, and `withScreenMeta` drops the key whenever the value is the default, so a scene with
	 * nothing to say about screens serialises byte-identically to one persisted before screens existed
	 * — which is why this carries no schemaVersion bump. Read it through {@link screenMetaOf}, never
	 * directly: the accessor hydrates a damaged record fail-closed.
	 */
	screen?: ScreenMeta | null;
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

// --- RC-CAN-7.2 — SCREEN METADATA (ADR-041) ------------------------------------------------------
// A screen IS a scene: there is no second entity, no duplicate widget store and no parallel
// permission model. What a screen adds is a small, OPTIONAL record on the scene — whether the GM
// pinned it to the shell, where it sits among the pins, which layout policy renders it, and where it
// came from. Absent, the record resolves to "unpinned, canvas, no recorded origin", which is exactly
// how every scene behaved before this field existed, so no schemaVersion bump is warranted.

/** The two layout policies ADR-041 accepts. `canvas` is today's bounded board; `flow` is CAN-7.7. */
export const SCREEN_LAYOUT_POLICIES = ['flow', 'canvas'] as const;

export type ScreenLayoutPolicy = (typeof SCREEN_LAYOUT_POLICIES)[number];

/**
 * PROVENANCE, never a live dependency: recording that a screen was duplicated from another, or
 * provisioned as one of the default screens, must never license overwriting a screen the GM has
 * since customised. Nothing reads this to re-seed content.
 */
export interface ScreenOrigin {
	kind: 'default' | 'duplicate' | 'template';
	/** The scene this one was copied from (`duplicate`/`template`), else `null`. */
	sourceSceneId: SceneId | null;
	/** The stable default-screen key this one was provisioned under (CAN-7.6/7.8), else `null`. */
	defaultKey: string | null;
	/** ISO timestamp of the copy/provisioning, from `env.clock()`. */
	at: string;
}

export interface ScreenMeta {
	/**
	 * SCREEN pinning — a shortcut in the shell's user-defined Screens group. Distinct from
	 * {@link WidgetLayout.pinned}, which describes a TILE inside a screen. The two never interact.
	 */
	pinned: boolean;
	/**
	 * The GM's order among pinned screens, ascending. `null` whenever `pinned` is false. Values are
	 * NOT required to be contiguous: `scene.set-pinned` appends above the current maximum and
	 * `scene.reorder-pins` is the one command that renumbers them to 0..n-1.
	 */
	pinOrder: number | null;
	layoutPolicy: ScreenLayoutPolicy;
	origin: ScreenOrigin | null;
}

/**
 * What a scene with NO screen record resolves to: unpinned, existing canvas behavior, no recorded
 * origin. `withScreenMeta` writes no field for this value, so an old scene is never rewritten with
 * defaults just because something read it.
 */
export const DEFAULT_SCREEN_META: ScreenMeta = Object.freeze({
	pinned: false,
	pinOrder: null,
	layoutPolicy: 'canvas',
	origin: null,
});

function isScreenLayoutPolicy(value: unknown): value is ScreenLayoutPolicy {
	return SCREEN_LAYOUT_POLICIES.includes(value as ScreenLayoutPolicy);
}

/** A screen origin hydrated fail-closed: anything that is not a complete record becomes `null`. */
function hydrateScreenOrigin(raw: unknown): ScreenOrigin | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	if (record.kind !== 'default' && record.kind !== 'duplicate' && record.kind !== 'template') {
		return null;
	}
	if (typeof record.at !== 'string' || record.at.length === 0) return null;
	const sourceSceneId =
		typeof record.sourceSceneId === 'string' && record.sourceSceneId.length > 0
			? record.sourceSceneId
			: null;
	const defaultKey =
		typeof record.defaultKey === 'string' && record.defaultKey.length > 0
			? record.defaultKey
			: null;
	return { kind: record.kind, sourceSceneId, defaultKey, at: record.at };
}

/**
 * Hydrate a persisted screen record FAIL-CLOSED. A missing, damaged or partially-written record
 * resolves field by field to {@link DEFAULT_SCREEN_META}, so a corrupt value can only ever cost a
 * screen its pin or its policy — it can never pin a screen the GM never pinned, and it can never
 * put a screen into a layout policy the build does not know how to render.
 */
export function hydrateScreenMeta(raw: unknown): ScreenMeta {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_SCREEN_META;
	const record = raw as Record<string, unknown>;
	const pinned = record.pinned === true;
	const pinOrder =
		pinned &&
		typeof record.pinOrder === 'number' &&
		Number.isInteger(record.pinOrder) &&
		record.pinOrder >= 0
			? record.pinOrder
			: null;
	return {
		pinned,
		pinOrder,
		layoutPolicy: isScreenLayoutPolicy(record.layoutPolicy) ? record.layoutPolicy : 'canvas',
		origin: hydrateScreenOrigin(record.origin),
	};
}

/** The screen record of a scene, hydrator-safe: a scene persisted before the field existed has none. */
export function screenMetaOf(scene: Scene): ScreenMeta {
	if (scene.screen === undefined || scene.screen === null) return DEFAULT_SCREEN_META;
	return hydrateScreenMeta(scene.screen);
}

/** Whether `meta` carries nothing a default scene does not already imply. */
export function isDefaultScreenMeta(meta: ScreenMeta): boolean {
	return (
		meta.pinned === DEFAULT_SCREEN_META.pinned &&
		meta.pinOrder === DEFAULT_SCREEN_META.pinOrder &&
		meta.layoutPolicy === DEFAULT_SCREEN_META.layoutPolicy &&
		meta.origin === null
	);
}

/**
 * A scene carrying `next` as its screen record. A record equal to {@link DEFAULT_SCREEN_META} drops
 * the field ENTIRELY, so a screen that is unpinned, canvas and origin-less serialises byte-identically
 * to a scene persisted before screens existed. That is what makes "absent round-trips unchanged" a
 * property of the writer rather than a convention readers have to remember.
 */
export function withScreenMeta(scene: Scene, next: ScreenMeta): Scene {
	if (isDefaultScreenMeta(next)) {
		const { screen: _dropped, ...rest } = scene;
		return rest;
	}
	return { ...scene, screen: next };
}

/** Which layout policy renders this screen. A scene with no record is canvas, as it has always been. */
export function screenLayoutPolicy(scene: Scene): ScreenLayoutPolicy {
	return screenMetaOf(scene).layoutPolicy;
}

/** Whether the GM pinned this SCREEN to the shell (never about a tile's `WidgetLayout.pinned`). */
export function isPinnedScreen(scene: Scene): boolean {
	return screenMetaOf(scene).pinned;
}

/** This screen's place among the pins, or `null` when it is not pinned. */
export function screenPinOrder(scene: Scene): number | null {
	return screenMetaOf(scene).pinOrder;
}

/**
 * The ONE ordering the pin reducer and the screens read share: pinned screens first in the GM's
 * order, then everything else by name. Ties break on id so the result is total and stable no matter
 * what order the scene record was iterated in.
 */
export function compareScreenOrder(a: Scene, b: Scene): number {
	const left = screenMetaOf(a);
	const right = screenMetaOf(b);
	if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
	if (left.pinned && right.pinned) {
		const leftOrder = left.pinOrder ?? Number.MAX_SAFE_INTEGER;
		const rightOrder = right.pinOrder ?? Number.MAX_SAFE_INTEGER;
		if (leftOrder !== rightOrder) return leftOrder - rightOrder;
	}
	const byName = a.name.localeCompare(b.name);
	if (byName !== 0) return byName;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every live, pinned screen in the GM's order. The pin list the shell and `scene.reorder-pins` agree on. */
export function listPinnedScreens(state: SceneState): Scene[] {
	return Object.values(state.scenes)
		.filter((scene) => isLiveScene(scene) && isPinnedScreen(scene))
		.sort(compareScreenOrder);
}
