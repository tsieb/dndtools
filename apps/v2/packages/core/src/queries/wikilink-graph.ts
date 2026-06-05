import type { PermissionState } from '../state/permission-state';
import type { VaultContentState } from '../state/content';
import { parseMarkdownNote } from '../state/markdown';
import type { ContentSourceId } from '../state/content-constraints';
import {
	applyLinkRepair,
	detectBrokenLinks,
	renamePropagateInBody,
	resolveWikilink,
	type BrokenWikilink,
	type LinkRepairResult,
	type WikilinkResolution,
	type WikilinkTarget,
} from '../state/wikilink-graph';
import { getContentItemsForActor, type ContentItemView } from './content-query';

/**
 * CONTENT-006 — the ACTOR-FILTERED WIKILINK GRAPH read/repair surface.
 *
 * This is the single choke-point that feeds the pure wikilink engine (`state/wikilink-graph.ts`) ONLY the
 * targets the editor may see. The candidate index is built from {@link getContentItemsForActor} — the same
 * visibility-and-tombstone filtered read every other CONTENT surface uses — so resolution, rename-propagation,
 * and repair can NEVER resolve, rename, or suggest a target the editor cannot see (CONTENT-006 actor-filtering,
 * fail closed; Cross-Contract Non-Negotiable 2). An unknown/unauthenticated actor gets an empty candidate
 * index, so every resolve is `unresolved` and every repair is refused.
 *
 * Pure + deterministic: the same content + permissions + actor always produce the same graph. The Processing
 * Core owns the graph algorithms; the GUI renders the computed model and dispatches command intents
 * (Architecture Contract 1).
 */

/** A note's heading anchors, derived from its markdown body (`# Heading` … `###### Heading`). */
const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;

/** Extract the heading section anchors from a markdown body, in document order. Pure + deterministic. */
function extractSections(body: string): string[] {
	const sections: string[] = [];
	for (const rawLine of body.split(/\r?\n/)) {
		const match = HEADING_PATTERN.exec(rawLine.trim());
		if (match) sections.push(match[1]!.trim());
	}
	return sections;
}

/**
 * How a content item maps to its sync source for wikilink purposes. The durable per-source registration lives
 * in `VaultState.sync-source-registrations` (deferred per ADR-014); until that is wired, an item's source is
 * its `fields['dndtools.source']` when declared, else the local-markdown baseline. Availability is read the
 * same way (`fields['dndtools.sourceUnavailable']` ⇒ unavailable + uncached), so a test/import can mark a
 * remote source offline. This keeps source conventions per-item without a parallel registry.
 */
function itemSource(view: ContentItemView): ContentSourceId {
	const raw = view.fields['dndtools.source'];
	if (raw === 'obsidian' || raw === 'google-docs' || raw === 'local-markdown') return raw;
	return 'local-markdown';
}

function itemAvailable(view: ContentItemView): boolean {
	return view.fields['dndtools.sourceUnavailable'] !== true;
}

function itemAliases(view: ContentItemView): string[] {
	const parsed = parseMarkdownNote(view.body);
	return parsed.aliases;
}

/**
 * CONTENT-006 — build the ACTOR-FILTERED candidate index: every note/object the actor may see becomes a
 * resolvable wikilink target (title + aliases + heading sections + source + availability). Hidden/tombstoned
 * items never enter the index, so they are unresolvable + unsuggestable to this actor. Pure.
 */
export function buildWikilinkCandidatesForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
): WikilinkTarget[] {
	const visible = getContentItemsForActor(content, permissions, actorId);
	return visible.map((view) => {
		const parsed = parseMarkdownNote(view.body);
		return {
			id: view.id,
			title: view.title,
			aliases: itemAliases(view),
			sections: extractSections(parsed.body),
			source: itemSource(view),
			available: itemAvailable(view),
		};
	});
}

/**
 * CONTENT-006 — RESOLVE one `[[target#section]]` against the actor's visible candidate index. Returns the
 * resolution (resolved id + matched section / unresolved / source-unavailable). A target the actor cannot see
 * is `unresolved` — never resolved across a hidden note. Pure.
 */
export function resolveWikilinkForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	link: { target: string; section?: string },
): WikilinkResolution {
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	return resolveWikilink(link, candidates);
}

/**
 * CONTENT-006 — REPAIR detection across the actor's visible candidate index for ONE note body. Returns the
 * broken links (unresolved / section-missing / source-unavailable). A `source-unavailable` link is reported so
 * the repair UI offers a non-destructive diagnostic rather than an offline rewrite (AC3). Pure.
 */
export function detectBrokenLinksForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	body: string,
): BrokenWikilink[] {
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	return detectBrokenLinks(body, candidates);
}

/**
 * CONTENT-006 — APPLY a repair to one note body against the actor's visible candidate index. FAIL CLOSED: an
 * unavailable broken source returns `source-unavailable` (no rewrite), and a fix that does not resolve to a
 * visible, available target is refused (`fix-unresolved`). Pure.
 */
export function applyLinkRepairForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	body: string,
	brokenTarget: string,
	fixTargetTitle: string,
): LinkRepairResult {
	const candidates = buildWikilinkCandidatesForActor(content, permissions, actorId);
	return applyLinkRepair(body, brokenTarget, fixTargetTitle, candidates);
}

/** One referring note rewritten by a rename, for the propagation result. */
export interface WikilinkRenamePropagation {
	/** The referring note's content item id. */
	itemId: string;
	title: string;
	/** The rewritten body. */
	body: string;
	/** How many links in this note were rewritten. */
	rewritten: number;
}

/**
 * CONTENT-006 — RENAME-PROPAGATION across the actor's visible notes. Given a target rename (old title → new
 * title), compute the rewritten body of EVERY visible note that links to the old title, preserving each
 * link's `#section`/`|alias`. Only the actor's visible notes are scanned, so a rename never reads or rewrites
 * a hidden note (fail closed). The caller dispatches an `content.update-item` intent per affected note with
 * the rewritten body — this query computes the rewrites; it never mutates state. Notes with no matching link
 * are omitted. Deterministic ordering by item id. Pure.
 */
export function propagateRenameForActor(
	content: VaultContentState,
	permissions: PermissionState,
	actorId: string,
	fromTitle: string,
	toTitle: string,
): WikilinkRenamePropagation[] {
	const visible = getContentItemsForActor(content, permissions, actorId);
	const propagations: WikilinkRenamePropagation[] = [];
	for (const view of visible) {
		const { body, rewritten } = renamePropagateInBody(view.body, fromTitle, toTitle);
		if (rewritten === 0) continue;
		propagations.push({ itemId: view.id, title: view.title, body, rewritten });
	}
	return propagations.sort((a, b) => a.itemId.localeCompare(b.itemId));
}
