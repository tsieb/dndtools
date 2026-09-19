import type { ActorId, SceneId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { Scene, SceneState, ScreenLayoutPolicy, ScreenOrigin } from '../state/scene-state';
import { compareScreenOrder, isLiveScene, screenMetaOf } from '../state/scene-state';
import { evaluateSceneVisibility } from '../permissions/visibility';

/**
 * RC-CAN-7.2 / ADR-041 — the SCREENS library read.
 *
 * A screen is a scene, so this read reuses the scene visibility model unchanged: it decides nothing
 * about access itself, it asks {@link evaluateSceneVisibility}, exactly as `listScenesForActor` does.
 * What it adds is the screen metadata the library, the header switcher and the sidebar pin group all
 * need, in ONE ordering they can share.
 */

export interface ScreenListEntry {
	id: SceneId;
	name: string;
	description: string;
	tags: string[];
	visibility: Scene['visibility'];
	updatedAt: string;
	layoutPolicy: ScreenLayoutPolicy;
	pinned: boolean;
	pinOrder: number | null;
	origin: ScreenOrigin | null;
	/**
	 * How many widgets THIS ACTOR would be delivered on this screen — not how many the screen holds.
	 * A player scoped to a subset of sections sees the count of that subset, so a library card can
	 * never tell them how much content the GM is withholding.
	 */
	widgetCount: number;
	/** The vault's home screen (`/`). */
	isHome: boolean;
	/** The screen the session is currently running (the live marker CAN-7.3 renders). */
	isLive: boolean;
}

export interface ScreenListOptions {
	/** The Command Center slice, so the read can mark the home screen. */
	commandCenter?: { homeSceneId: SceneId | null };
	/** The session slice, so the read can mark the live screen. */
	session?: { activeSceneId: SceneId | null };
}

/**
 * The screens this actor may list, pinned screens first in the GM's order and the rest by name.
 *
 * ISOLATION — a player lists ONLY the screens visible to them. Four filters, all fail-closed:
 *
 * 1. an actor the vault does not know gets nothing at all;
 * 2. a soft-deleted scene is omitted, exactly as it is from every other actor-filtered read;
 * 3. `evaluateSceneVisibility` decides the rest, so a `dm-only` screen, and a `shared` screen this
 *    actor is neither a sharing target nor a viewer of, never appears;
 * 4. templates are omitted for EVERYONE. A template is a source to create from ("new from template"),
 *    not a workspace to open, so listing it here would put a non-openable row in the library.
 *
 * Nothing in an entry is computed from data the actor could not already read: `widgetCount` is scoped
 * to the sections they are actually delivered.
 */
export function listScreensForActor(
	state: SceneState,
	permission: PermissionState,
	actorId: ActorId,
	options: ScreenListOptions = {},
): ScreenListEntry[] {
	const actor = permission.actors[actorId];
	if (!actor) return [];

	const homeSceneId = options.commandCenter?.homeSceneId ?? null;
	const activeSceneId = options.session?.activeSceneId ?? null;

	const visible: Scene[] = [];
	const entries = new Map<SceneId, ScreenListEntry>();
	for (const scene of Object.values(state.scenes)) {
		if (!isLiveScene(scene)) continue;
		if (scene.templateMeta.isTemplate) continue;
		const evaluation = evaluateSceneVisibility(scene, actor, permission);
		if (evaluation.kind !== 'visible') continue;

		const meta = screenMetaOf(scene);
		visible.push(scene);
		entries.set(scene.id, {
			id: scene.id,
			name: scene.name,
			description: scene.description,
			tags: scene.tags,
			visibility: scene.visibility,
			updatedAt: scene.ownership.updatedAt,
			layoutPolicy: meta.layoutPolicy,
			pinned: meta.pinned,
			pinOrder: meta.pinOrder,
			origin: meta.origin,
			widgetCount: deliverableWidgetCount(scene, evaluation.assignedSectionIds),
			isHome: scene.id === homeSceneId,
			isLive: scene.id === activeSceneId,
		});
	}

	return visible
		.sort(compareScreenOrder)
		.map((scene) => entries.get(scene.id))
		.filter((entry): entry is ScreenListEntry => entry !== undefined);
}

/** The pinned screens this actor may list, in the GM's order — the shell's Screens group. */
export function listPinnedScreensForActor(
	state: SceneState,
	permission: PermissionState,
	actorId: ActorId,
	options: ScreenListOptions = {},
): ScreenListEntry[] {
	return listScreensForActor(state, permission, actorId, options).filter((entry) => entry.pinned);
}

/**
 * How many widgets this actor is delivered. `null` section scope means the whole screen (the DM, or a
 * player with no section assignment on a screen they can see); a scope counts only the widgets listed
 * by the sections in it, de-duplicated because a widget may be listed by more than one section.
 */
function deliverableWidgetCount(scene: Scene, assignedSectionIds: string[] | null): number {
	if (assignedSectionIds === null) return scene.widgets.length;
	const scoped = new Set(
		scene.sections
			.filter((section) => assignedSectionIds.includes(section.id))
			.flatMap((section) => section.widgetInstanceIds),
	);
	return scene.widgets.filter((widget) => scoped.has(widget.id)).length;
}
