import type { ActorId, SceneId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import type { SceneState } from '../state/scene-state';
import type { SessionState } from '../state/session-state';
import type { CommandCenterState } from '../state/command-center-state';
import { evaluateSceneVisibility } from '../permissions/visibility';
import { listScenesForActor } from './scene';
import { listNavigationSections, type NavigationSection } from './navigation';

/**
 * Contextual navigation model (NAV-003).
 *
 * NAV-003 requires a user to navigate with global navigation, local section
 * navigation, contextual navigation, breadcrumbs, backlinks, and pinned/recent
 * items "without redundant conflicting route state". This module is the single
 * Processing-Core derivation that all of those surfaces read from. Given one
 * {@link NavigationLocation} — which the GUI derives from the current route, the
 * sole source of truth — {@link resolveNavigationView} returns the breadcrumb
 * trail, the local section items, and the contextual backlinks/related links.
 * Because every surface reads from this one derivation, no two navigation
 * surfaces can hold conflicting "where am I" state.
 *
 * Scope split:
 * - Global navigation (the section registry) and the command palette are owned by
 *   {@link listNavigationSections} / NAV-command-palette-and-actor-filtering
 *   (NAV-008/NAV-010); this module reuses that actor-filtered registry rather than
 *   redefining it.
 * - Note-level backlink intelligence with redacted snippets is owned by
 *   GRAPH-backlinks-and-navigation-relationships (GRAPH-002). This module provides
 *   the navigation shell and implements contextual backlinks for the Scene
 *   relationships that exist in the prototype (home Scene, template lineage,
 *   player-view projection); a future note domain plugs its backlinks into the
 *   same {@link ContextualLink} shape.
 *
 * Every relationship is visibility-filtered before it is returned. An entity that
 * is not visible to the actor produces no crumb, item, or link — fail closed, no
 * leak (Contract 3).
 */

/** The Processing-Core state slices the navigation model reads. */
export interface NavigationStateView {
	scenes: SceneState;
	permissions: PermissionState;
	session: SessionState;
	commandCenter: CommandCenterState;
}

/** Entity kinds that can be "open" within a section. The prototype navigates
 *  Scenes; a future note domain adds `'note'` here without changing the shape. */
export type NavigationEntityType = 'scene';

/**
 * A concrete navigable location, derived by the GUI from the current route. This
 * is the single source of truth every navigation surface reads from (NAV-003): the
 * route is authoritative, and the navigation view is recomputed from it rather than
 * tracked independently per surface.
 */
export interface NavigationLocation {
	/** Canonical section id from the navigation registry (e.g. `command-center`). */
	sectionId: string;
	/** The open entity within the section, if any. */
	entity?: { type: NavigationEntityType; id: string } | null;
}

export interface NavigationCrumb {
	id: string;
	title: string;
	route: string;
	/** True for the location itself, rendered as `aria-current` rather than a link. */
	current: boolean;
}

export interface NavigationItem {
	id: string;
	title: string;
	route: string;
	current: boolean;
}

export type ContextualLinkKind = 'backlink' | 'related';

/** A contextual navigation link relative to the open entity: a `backlink` points
 *  *to* the entity; a `related` link points *from* it. */
export interface ContextualLink {
	id: string;
	title: string;
	route: string;
	kind: ContextualLinkKind;
	/** Human-readable reason the link is relevant (e.g. "Created from template"). */
	relation: string;
}

export interface NavigationView {
	location: NavigationLocation;
	/** The resolved current section, actor-filtered; `null` when the actor cannot
	 *  reach it (fail closed). */
	section: NavigationSection | null;
	breadcrumbs: NavigationCrumb[];
	localItems: NavigationItem[];
	backlinks: ContextualLink[];
	related: ContextualLink[];
}

/** A reachable navigation destination, used to keep device-local pinned/recent
 *  lists from surfacing a route the active actor can no longer reach. */
export interface NavigationDestination {
	route: string;
	title: string;
}

const HOME_SECTION_ID = 'command-center';
const SCENES_SECTION_ID = 'scenes';

function sceneRoute(id: SceneId): string {
	return `/scene/${id}/`;
}

/**
 * Resolve the full contextual navigation view for one actor at one location.
 * Breadcrumbs, local section navigation, and contextual links are all derived from
 * the single passed location (NAV-003), and every entity is visibility-filtered for
 * the actor before it appears.
 */
export function resolveNavigationView(
	state: NavigationStateView,
	actorId: ActorId,
	location: NavigationLocation,
): NavigationView {
	const reachable = listNavigationSections(state.permissions, actorId);
	const reachableById = new Map(reachable.map((section) => [section.id, section]));
	const home = reachableById.get(HOME_SECTION_ID) ?? null;
	const section = reachableById.get(location.sectionId) ?? null;
	const actor = state.permissions.actors[actorId];

	// Resolve the open Scene only when it is visible to this actor (fail closed):
	// a denied entity yields no entity crumb and no contextual links.
	const entity = location.entity ?? null;
	let openScene = null;
	if (entity?.type === 'scene' && actor) {
		const scene = state.scenes.scenes[entity.id];
		if (scene && evaluateSceneVisibility(scene, actor, state.permissions).kind === 'visible') {
			openScene = scene;
		}
	}

	// --- Breadcrumbs: Home -> Section -> Entity, including only reachable ancestors. ---
	const breadcrumbs: NavigationCrumb[] = [];
	const atHome = location.sectionId === HOME_SECTION_ID && !openScene;
	if (home) {
		breadcrumbs.push({ id: home.id, title: home.title, route: home.route, current: atHome });
	}
	if (section && section.id !== HOME_SECTION_ID) {
		breadcrumbs.push({
			id: section.id,
			title: section.title,
			route: section.route,
			current: !openScene,
		});
	}
	if (openScene) {
		breadcrumbs.push({
			id: openScene.id,
			title: openScene.name,
			route: sceneRoute(openScene.id),
			current: true,
		});
	}

	// --- Local section navigation: the actor-visible siblings within this section. ---
	const localItems: NavigationItem[] = [];
	if (section?.id === SCENES_SECTION_ID) {
		for (const scene of listScenesForActor(state.scenes, state.permissions, actorId)) {
			localItems.push({
				id: scene.id,
				title: scene.name,
				route: sceneRoute(scene.id),
				current: openScene?.id === scene.id,
			});
		}
	}

	// --- Contextual navigation: backlinks (-> entity) and related links (entity ->). ---
	const backlinks: ContextualLink[] = [];
	const related: ContextualLink[] = [];
	if (openScene && actor) {
		// Backlink: the Command Center uses this Scene as its home surface.
		if (state.commandCenter.homeSceneId === openScene.id && home) {
			backlinks.push({
				id: `home:${openScene.id}`,
				title: home.title,
				route: home.route,
				kind: 'backlink',
				relation: 'Command Center home Scene',
			});
		}

		// Backlinks: Scenes instantiated from this one (this Scene is their template),
		// each visibility-filtered for the actor.
		for (const candidate of Object.values(state.scenes.scenes)) {
			if (candidate.templateMeta.instantiatedFromTemplateSceneId !== openScene.id) continue;
			if (evaluateSceneVisibility(candidate, actor, state.permissions).kind !== 'visible') continue;
			backlinks.push({
				id: `instance:${candidate.id}`,
				title: candidate.name,
				route: sceneRoute(candidate.id),
				kind: 'backlink',
				relation: 'Instantiated from this template',
			});
		}

		// Backlinks: player-view projections targeting this Scene. This is DM-only
		// session detail — players and observers must not learn who else is being
		// projected to, so it is gated to the DM (fail closed).
		if (actor.role === 'dm') {
			for (const assignment of Object.values(state.session.playerViewAssignments)) {
				if (assignment.target.sceneId !== openScene.id) continue;
				const player = state.permissions.actors[assignment.playerActorId];
				backlinks.push({
					id: `projection:${assignment.id}`,
					title: home?.title ?? 'Command Center',
					route: home?.route ?? '/',
					kind: 'backlink',
					relation: `Projected to ${player?.displayName ?? assignment.playerActorId}`,
				});
			}
		}

		// Related: the template this Scene was created from (forward link), when visible.
		const sourceId = openScene.templateMeta.instantiatedFromTemplateSceneId;
		if (sourceId) {
			const sourceScene = state.scenes.scenes[sourceId];
			if (
				sourceScene &&
				evaluateSceneVisibility(sourceScene, actor, state.permissions).kind === 'visible'
			) {
				related.push({
					id: `template:${sourceScene.id}`,
					title: sourceScene.name,
					route: sceneRoute(sourceScene.id),
					kind: 'related',
					relation: 'Created from template',
				});
			}
		}
	}

	backlinks.sort(
		(a, b) => a.relation.localeCompare(b.relation) || a.title.localeCompare(b.title),
	);
	related.sort((a, b) => a.title.localeCompare(b.title));

	return { location, section, breadcrumbs, localItems, backlinks, related };
}

/**
 * List the routes the actor can currently reach: every reachable navigation section
 * plus every visible Scene. Device-local pinned/recent navigation lists filter
 * against this set so a route that is no longer reachable for the active actor
 * (for example a DM-only Scene while viewing as a player) is never surfaced.
 */
export function listReachableDestinations(
	state: NavigationStateView,
	actorId: ActorId,
): NavigationDestination[] {
	const out: NavigationDestination[] = [];
	for (const section of listNavigationSections(state.permissions, actorId)) {
		out.push({ route: section.route, title: section.title });
	}
	for (const scene of listScenesForActor(state.scenes, state.permissions, actorId)) {
		out.push({ route: sceneRoute(scene.id), title: scene.name });
	}
	return out;
}
