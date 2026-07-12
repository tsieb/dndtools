import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import { type VaultContentState, CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import { parseMarkdownNote } from '../state/markdown';
import { hasGrantedCapability } from '../permissions/grants';
import type { ContentSourceId } from '../state/content-constraints';
import type { LinkRepairResult } from '../state/wikilink-graph';
import {
	buildBulkRepairPreview,
	buildLinkPickerSuggestions,
	deadLinksInBody,
	GRAPH_LINK_REPAIR_SCHEMA_VERSION,
	type BulkRepairPreview,
	type DeadLinkOccurrence,
	type LinkPickerSuggestion,
} from '../state/graph-link-repair';
import { buildWikilinkCandidatesForActor } from './wikilink-graph';
import { applyLinkRepairForActor } from './wikilink-graph';
import { getContentItemsForActor, type ContentItemView } from './content-query';

/**
 * GRAPH-010 — the ACTOR-FILTERED + CAPABILITY-SCOPED LINK-REPAIR / LINK-PICKER surface: it opens a
 * non-revealing link picker for an unresolved link, previews a bulk repair of dead links across the
 * editor's authorized content, and authorizes a single chosen repair — only within the content the actor
 * may EDIT, and without ever exposing a hidden target.
 *
 * This is the single choke-point that feeds the pure {@link import('../state/graph-link-repair')} engine
 * ONLY the candidate targets the actor may see and the dead links inside content the actor may edit. It is
 * built ENTIRELY on the EXISTING actor-filtered link graph + permission model, NOT a second mechanism:
 *
 *   - The candidate index comes from {@link buildWikilinkCandidatesForActor} (CONTENT-006) — the SAME
 *     actor-filtered candidate index the wikilink repair path uses. So a hidden note is NEVER a picker
 *     suggestion, a repair candidate, or a disambiguation choice (GRAPH-010 AC1, AC4: only visible
 *     candidate targets and non-revealing labels; a hidden title/id/count is omitted).
 *   - The editable content comes from {@link getContentItemsForActor} filtered to the items the actor has
 *     WRITE authority on. WRITE AUTHORITY is the DM (base-role authority) OR a `section-editor` grant on
 *     the specific content item (Contract 3 Note/Section capability sets, evaluated at the data layer
 *     BEFORE any mutation). A player with `section-editor` on ONE item therefore previews + repairs ONLY
 *     that item; a bulk repair that would rewrite another item/source is REJECTED before mutation
 *     (GRAPH-010 AC5).
 *   - The single chosen repair is applied through {@link applyLinkRepairForActor} (CONTENT-006), which
 *     fails closed on an unavailable source and refuses a fix that does not resolve to a visible target.
 *     The repair COMPUTES the rewritten body; the GUI dispatches the existing per-item update command, so
 *     only that one link changes and the graph/search indexes update incrementally (AC3).
 *
 * Because every input is drawn from an actor-filtered read and every write is capability-gated at the data
 * layer, the data layer decided visibility AND permission before this surface acts (Cross-Contract
 * Non-Negotiable 2 + Contract 3 Axis 2). An unknown/unauthenticated actor receives empty suggestions, an
 * empty preview, and a rejected repair (fail closed).
 *
 * Pure + deterministic: the same content + permissions + actor always produce the same suggestions /
 * preview / authorization. The Processing Core owns the algorithm + the authority decision; the GUI
 * renders the computed model and dispatches the chosen repair command (Architecture Contract 1).
 */

/** The convention for an item's sync source + availability, mirroring the wikilink-graph query. */
function itemSource(view: ContentItemView): ContentSourceId {
	const raw = view.fields['dndtools.source'];
	if (raw === 'obsidian' || raw === 'google-docs' || raw === 'local-markdown') return raw;
	return 'local-markdown';
}

/**
 * GRAPH-010 — whether the actor has WRITE authority on ONE content item (the gate every repair/preview
 * row passes). The DM has inherent authority (Contract 3 DM Authority); a player needs an explicit
 * `section-editor` grant on the content item (the authoring capability for notes/objects). A `viewer` /
 * `contributor` grant, or no grant, is NOT write authority for a link repair — fail closed. Pure.
 */
function actorCanEditItem(permissions: PermissionState, actor: Actor, itemId: string): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (actor.role === 'observer') return false;
	// `section-editor` is the note/object authoring capability; it implies `contributor`+`viewer`, but a
	// bare `contributor`/`viewer` may NOT rewrite an existing link, so we require `section-editor` here.
	return hasGrantedCapability(permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'section-editor');
}

/**
 * GRAPH-010 — the content items the actor may EDIT: the actor-visible items further filtered to those the
 * actor has write authority on. This is the scope a bulk repair is allowed to touch; an item outside it is
 * never previewed for repair and a repair targeting it is rejected (AC5). Pure + deterministic (id order).
 */
function editableItemsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actor: Actor,
): ContentItemView[] {
	return getContentItemsForActor(content, permissions, actor.id).filter(
		(view) => view.kind === 'note' && actorCanEditItem(permissions, actor, view.id),
	);
}

/**
 * GRAPH-010 AC1 / AC4 — open the LINK PICKER for a broken/partial link `target`: the visible candidate
 * targets (and only those) the actor may pick, with non-revealing labels (just the visible title). A
 * hidden note is never suggested and no count reveals one. An unknown actor gets an empty list (fail
 * closed). Pure + deterministic.
 */
export function getLinkPickerSuggestionsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	target: string,
): LinkPickerSuggestion[] {
	if (!permissions.actors[actorId]) return [];
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	return buildLinkPickerSuggestions(target, candidates);
}

/**
 * GRAPH-010 AC2 / AC5 — preview a BULK REPAIR over the dead links inside the content the actor may EDIT.
 * Scans ONLY the items the actor has write authority on (the DM: all visible notes; a `section-editor`:
 * only their granted items), so the preview can never propose rewriting a source the actor is not
 * authorized for. Each row lists the proposed rewrite, the affected source, ambiguity (more than one
 * visible candidate), and any unsupported-source limitation — every candidate a visible target (AC4). An
 * unknown actor gets an empty preview (fail closed). Pure + deterministic.
 */
export function previewBulkLinkRepairForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): BulkRepairPreview {
	const actor = permissions.actors[actorId];
	if (!actor) {
		return {
			schemaVersion: GRAPH_LINK_REPAIR_SCHEMA_VERSION,
			rows: [],
			applicableCount: 0,
			ambiguousCount: 0,
			blockedCount: 0,
		};
	}
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	const occurrences: DeadLinkOccurrence[] = [];
	for (const view of editableItemsForActor(content, permissions, actor)) {
		const body = parseMarkdownNote(view.body).body;
		occurrences.push(
			...deadLinksInBody(view.id, view.title, itemSource(view), body, candidates),
		);
	}
	return buildBulkRepairPreview(occurrences, candidates);
}

/** Why a chosen repair was REJECTED before mutation (the fail-closed authorization outcomes). */
export type RepairAuthorizationRejection =
	/** The actor is unknown/unauthenticated. */
	| 'unknown-actor'
	/** The target item does not exist or is not visible to the actor. */
	| 'item-not-visible'
	/** The actor lacks write authority (no `section-editor` grant) on the target item (AC5). */
	| 'not-authorized';

/** The outcome of authorizing + computing a single chosen link repair. */
export type RepairAuthorizationResult =
	| {
			status: 'authorized';
			/** The rewritten body to dispatch via the existing per-item update command (AC3). */
			itemId: string;
			result: LinkRepairResult;
	  }
	| { status: 'rejected'; reason: RepairAuthorizationRejection };

/**
 * GRAPH-010 AC3 / AC5 — AUTHORIZE + COMPUTE a single chosen link repair: rewrite the `brokenTarget` to the
 * editor-selected `fixTitle` inside ONE item. The authority is evaluated at the data layer BEFORE any
 * rewrite: the item must be VISIBLE to the actor and the actor must have WRITE authority on it (DM, or a
 * `section-editor` grant). A player attempting to repair an item they are not authorized for is REJECTED
 * before mutation (`not-authorized`) — a `section-editor` on one item can never rewrite another item/source
 * (AC5). When authorized, the rewrite is computed through {@link applyLinkRepairForActor} (which fails
 * closed on an unavailable source / unresolvable fix); the caller dispatches the resulting body through the
 * existing `content.update-item` command so ONLY that link changes and indexes update incrementally (AC3).
 *
 * This query COMPUTES + AUTHORIZES the repair; it never mutates state. Pure + deterministic.
 */
export function authorizeLinkRepairForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	itemId: string,
	brokenTarget: string,
	fixTitle: string,
): RepairAuthorizationResult {
	const actor = permissions.actors[actorId];
	if (!actor) return { status: 'rejected', reason: 'unknown-actor' };
	// The item must be one of the actor's VISIBLE items (a hidden/deleted item is indistinguishable here).
	const visible = getContentItemsForActor(content, permissions, actorId).find(
		(view) => view.id === itemId && view.kind === 'note',
	);
	if (!visible) return { status: 'rejected', reason: 'item-not-visible' };
	// AC5 — write authority is gated at the data layer BEFORE mutation.
	if (!actorCanEditItem(permissions, actor, itemId)) {
		return { status: 'rejected', reason: 'not-authorized' };
	}
	const body = parseMarkdownNote(visible.body).body;
	const result = applyLinkRepairForActor(content, permissions, actorId, body, brokenTarget, fixTitle);
	return { status: 'authorized', itemId, result };
}
