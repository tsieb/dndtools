import type { PermissionState } from '../state/permission-state';
import type { ContentItem, VaultContentState } from '../state/content';
import { contentItemVisibilityMetadata } from '../state/content';
import { parseMarkdownNote } from '../state/markdown';
import { filterEntityForActor } from '../permissions/visibility-filter';
import { getContentItemsForActor, contentFieldPath, type ContentItemView } from './content-query';
import {
	computeNoteRelationships,
	noteSectionAnchors,
	type NoteRelationshipRecord,
	type NoteRelationships,
} from '../state/note-relationships';

/**
 * GRAPH-002 — the ACTOR-FILTERED NOTE-RELATIONSHIP surface: BACKLINKS, CROSS-SECTION links, and RELATED-NOTE
 * jumps with VISIBILITY-REDACTED context snippets.
 *
 * This is the single choke-point that feeds the pure relationship engine (`state/note-relationships.ts`)
 * ONLY the notes — and the visible SECTIONS of those notes — the actor may see. It is built ENTIRELY on the
 * EXISTING actor-filtered link graph, NOT a second relationship source:
 *
 *   - The visible note SET comes from {@link getContentItemsForActor} — the SAME visibility-and-tombstone
 *     choke-point every CONTENT/SRCH/GRAPH surface uses (CONTENT-011). A `dm-only`/`shared`-but-undelivered/
 *     soft-deleted note never enters the set, so it can never be a backlink source, a related target, or the
 *     subject of a relationship (GRAPH-002 AC2 — a hidden backlink source is absent; Cross-Contract
 *     Non-Negotiable 2). This is the same reverse-edge graph {@link import('./search-query').searchVaultForActor}
 *     exposes as a relationship HINT (`buildVisibleBacklinks`); this surface adds the navigable detail + snippet.
 *
 *   - The snippet TEXT is REDACTED by SECTION visibility. A source note that has ANY declared section the
 *     actor cannot see surfaces its backlink WITHOUT a snippet (the visible backlink still appears — AC1 —
 *     but we never quote text that might come from a `dm-only` section). The redaction decision reuses the
 *     SAME PERM visibility-filter ({@link filterEntityForActor}) the granular detail read uses, so the policy
 *     is never reinvented and a hidden section can never leak through a relationship snippet.
 *
 * FAIL CLOSED at the TARGET: a request for relationships of a note the actor cannot see (hidden, deleted,
 * never cached, or an unknown actor) returns the generic {@link NOTE_RELATIONSHIPS_HIDDEN} result — an empty
 * relationship set indistinguishable from "the note has no relationships" — so a player can never probe the
 * graph to learn that a hidden note exists. A link to a now-hidden/deleted target likewise simply never
 * resolves (the target is absent from the visible set), so a stale relationship degrades gracefully (no
 * leak, no crash).
 *
 * Pure + deterministic: the same content + permissions + actor + target always produce the same
 * relationships. The Processing Core owns the graph algorithm; the GUI renders the computed model and
 * dispatches navigation intents (Architecture Contract 1).
 */

/** The fail-closed empty result for a target the actor cannot see (indistinguishable from no relationships). */
function hiddenResult(targetId: string): NoteRelationships {
	return { targetId, backlinks: [], related: [] };
}

/**
 * GRAPH-002 — whether the actor sees the SOURCE note's full body (no section is redacted from them). When a
 * note declares section-level visibility and ANY declared section is hidden from the actor, we treat the body
 * as PARTIALLY visible and suppress its context snippet (fail closed — never quote a possibly-hidden section).
 * Reuses the SAME PERM visibility-filter precedence as the granular detail read; never reinvents it. Pure.
 */
function actorSeesFullBody(
	item: ContentItem,
	permissions: PermissionState,
	actorId: string,
): boolean {
	const declaredSectionIds = Object.keys(item.sectionVisibility);
	const declaredFieldPaths = Object.keys(item.fieldVisibility);
	if (declaredSectionIds.length === 0 && declaredFieldPaths.length === 0) return true;
	const actor = permissions.actors[actorId];
	if (!actor) return false;
	if (actor.role === 'dm') return true;
	const meta = contentItemVisibilityMetadata(item);
	const fieldPaths = Object.fromEntries(
		Object.entries(item.fields).map(([key, value]) => [contentFieldPath(key), value]),
	);
	const filtered = filterEntityForActor(
		meta,
		{ sectionIds: declaredSectionIds, fields: fieldPaths },
		actor,
		permissions,
	);
	if (!filtered.visible) return false;
	// Any redacted section/field means the actor does NOT see the whole body → suppress the snippet.
	return filtered.redactedSectionIds.length === 0 && filtered.redactedFieldPaths.length === 0;
}

/**
 * GRAPH-002 — build the ACTOR-FILTERED relationship records: every NOTE the actor may see becomes a
 * {@link NoteRelationshipRecord} (id + title + aliases + heading anchors + body + a snippet-safe flag).
 * Hidden/tombstoned notes never enter the set (omitted by {@link getContentItemsForActor}). A note whose body
 * is only PARTIALLY visible to the actor (a hidden section/field) is marked `snippetable: false`, so the
 * engine produces NO snippet for it (the backlink still appears, just without a possibly-leaking quote). Pure.
 */
function buildRelationshipRecords(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): NoteRelationshipRecord[] {
	const visible: ContentItemView[] = getContentItemsForActor(content, permissions, actorId).filter(
		(view) => view.kind === 'note',
	);
	return visible.map((view) => {
		const item = content.items[view.id];
		const parsed = parseMarkdownNote(view.body);
		// The note is actor-visible, so detecting its link EDGES (whose targets are titles/ids) leaks nothing.
		// A context SNIPPET, however, may only be drawn when the actor sees the WHOLE body — a partially-redacted
		// note keeps its edges for the relationship graph but yields no snippet text (fail closed).
		const snippetable = item ? actorSeesFullBody(item, permissions, actorId) : false;
		return {
			id: view.id,
			title: view.title,
			aliases: parsed.aliases,
			sectionAnchors: noteSectionAnchors(parsed.body),
			body: parsed.body,
			snippetable,
		};
	});
}

/**
 * GRAPH-002 — the BACKLINKS + CROSS-SECTION links + RELATED-NOTE jumps for ONE target note, filtered for the
 * actor. Returns the generic {@link hiddenResult} (an empty set, indistinguishable from "no relationships")
 * when the target is not visible to the actor — hidden, deleted, never cached, or an unknown actor — so a
 * player can never discover a hidden note through the graph (GRAPH-002 fail closed). Otherwise composes the
 * pure {@link computeNoteRelationships} engine over the actor's visible note records. Pure + deterministic.
 */
export function getNoteRelationshipsForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	targetId: string,
): NoteRelationships {
	const records = buildRelationshipRecords(content, permissions, actorId);
	// The target must be one of the actor's VISIBLE notes; otherwise fail closed (no leak, graceful degrade).
	if (!records.some((record) => record.id === targetId)) return hiddenResult(targetId);
	return computeNoteRelationships(targetId, records);
}
