/**
 * Visibility-boundary primitive — the NO-LEAK contract (UX-A11Y-008; package principle 8).
 *
 * The single, safety-critical GUI-layer guard that guarantees DM-only content never reaches a
 * player/observer ARIA channel: accessible name, accessible description, alt text, live-region
 * announcement, spatial-nav target, Scene Outline item, map summary item, search result, preview, or
 * skeleton. Every a11y engine in this folder (Scene Outline, map summary, combat announcer, canvas
 * keyboard) computes its actor-facing output by FILTERING through {@link filterVisibleForViewer}
 * first, so a name is only ever computed for an item the viewer may already see — the requirement's
 * rule that "all accessible-name computation functions receive the current user's visibility
 * predicate as a parameter; they must not access the raw data model directly".
 *
 * Defense in depth: the Processing Core already filters non-DM reads (`filterEntityForActor`), but the
 * GUI a11y layer re-applies the SAME visibility vocabulary so a mis-wired surface that hands the
 * engine unfiltered data still cannot leak. Fail-closed: any absent/unknown visibility collapses to
 * `dm-only` (least visible), matching the core (`normalizeVisibilityLevel`), and `shared` is hidden
 * unless explicitly delivered to this viewer.
 *
 * Pure — no DOM, no Svelte — so the boundary is unit-tested directly and the negative test
 * ({@link findLeakedTerms} / {@link assertNoLeak}) can prove a hypothetical leak WOULD be caught.
 */

import type { ActorRole, SceneVisibility } from '@dndtools/core';

export type { ActorRole, SceneVisibility };

/** The current actor a surface is rendered for. `role` drives the boundary; `actorId` resolves `shared`. */
export interface Viewer {
	role: ActorRole;
	actorId: string;
}

/**
 * The visibility classification any boundary-protected item must carry. `visibility` is the three-
 * level model shared with the core (`dm-only` | `player-visible` | `shared`); `sharedWith` lists the
 * actor ids a `shared` item is explicitly delivered to (player-view assignment / handout / viewer
 * grant, all reduced to "delivered to actor", exactly as the core's `VisibilityRule.sharedWith`).
 */
export interface VisibilityClassification {
	visibility: SceneVisibility;
	sharedWith?: readonly string[];
}

const KNOWN_LEVELS: ReadonlySet<string> = new Set<SceneVisibility>([
	'dm-only',
	'player-visible',
	'shared',
]);

/** The single, least-visible default applied when no/unknown visibility metadata exists (fail closed). */
export const DEFAULT_VISIBILITY: SceneVisibility = 'dm-only';

/**
 * Coerce an arbitrary value to a known visibility level, failing closed to `dm-only` for any
 * absent/unknown/malformed input. The single coercion point so adversarial/missing metadata can never
 * present as more permissive than the three known levels (mirrors core `normalizeVisibilityLevel`).
 */
export function normalizeVisibility(value: unknown): SceneVisibility {
	return typeof value === 'string' && KNOWN_LEVELS.has(value)
		? (value as SceneVisibility)
		: DEFAULT_VISIBILITY;
}

/** True when the role is the DM (the only role that may see `dm-only` content). */
export function isDm(viewer: Viewer): boolean {
	return viewer.role === 'dm';
}

/**
 * THE predicate. Whether an item is visible to a viewer through the boundary.
 *
 *   - DM ⇒ everything.
 *   - non-DM ⇒ `player-visible` always; `shared` only if delivered to this `actorId`; `dm-only` never.
 *   - absent/unknown visibility ⇒ `dm-only` (fail closed), so a non-DM cannot see it.
 *
 * This is the same decision the core's per-rule check makes, re-asserted in the GUI so ARIA output is
 * computed from the visibility-filtered model, never the raw one (UX-A11Y-008 rendering rule).
 */
export function isVisibleToViewer(item: VisibilityClassification, viewer: Viewer): boolean {
	if (isDm(viewer)) return true;
	const level = normalizeVisibility(item.visibility);
	if (level === 'player-visible') return true;
	if (level === 'dm-only') return false;
	// `shared`: delivered only through an explicit channel (membership in sharedWith).
	return (item.sharedWith ?? []).includes(viewer.actorId);
}

/**
 * The choke-point every a11y engine calls before building any actor-facing list. Returns ONLY the
 * items visible to the viewer, in input order; hidden items are removed entirely (absent from the
 * result, not flagged), so a caller that maps the result to DOM nodes can never render a hidden item
 * as `display:none` (the "absent, not display:none" requirement).
 */
export function filterVisibleForViewer<T extends VisibilityClassification>(
	items: readonly T[],
	viewer: Viewer,
): T[] {
	return items.filter((item) => isVisibleToViewer(item, viewer));
}

/**
 * Compute an accessible name for an item ONLY if the viewer may see it; otherwise return `null` so the
 * caller renders no node at all. Enforces the rule that name computation receives the predicate — a
 * name is never produced for a hidden item, so it cannot be assigned to an `aria-label`/alt/live
 * region that the player's AT would read.
 */
export function accessibleNameForViewer<T extends VisibilityClassification>(
	item: T,
	viewer: Viewer,
	buildName: (item: T) => string,
): string | null {
	return isVisibleToViewer(item, viewer) ? buildName(item) : null;
}

/**
 * How many items the boundary removed for this viewer. Only meaningful for a DM/diagnostics context —
 * a non-DM is NEVER told a hidden count (existence must not be probeable), so callers must not surface
 * this to players. Provided for DM-facing tooling and tests.
 */
export function hiddenCountForViewer(
	items: readonly VisibilityClassification[],
	viewer: Viewer,
): number {
	return items.length - filterVisibleForViewer(items, viewer).length;
}

/**
 * Negative-test / dev guard: find which of `secretTerms` appear (case-insensitively, as substrings) in
 * `text`. Used to PROVE that a produced ARIA string (label, description, announcement, summary) carries
 * none of the current session's DM-only names. An empty result means no leak. Blank secret terms are
 * ignored so an empty entity name never matches everything.
 */
export function findLeakedTerms(text: string, secretTerms: readonly string[]): string[] {
	const haystack = text.toLowerCase();
	const found: string[] = [];
	for (const term of secretTerms) {
		const needle = term.trim().toLowerCase();
		if (needle.length === 0) continue;
		if (haystack.includes(needle)) found.push(term);
	}
	return found;
}

/**
 * Assert no DM-only term leaked into `text`; throws with the offending terms if any did. The hard
 * boundary check tests run against every engine's player-facing output (UX-A11Y-008 testing
 * obligation). `where` names the channel (e.g. "scene outline item") for an actionable failure.
 */
export function assertNoLeak(
	text: string,
	secretTerms: readonly string[],
	where = 'ARIA output',
): void {
	const leaked = findLeakedTerms(text, secretTerms);
	if (leaked.length > 0) {
		throw new Error(
			`NO-LEAK violation in ${where}: DM-only term(s) ${leaked
				.map((t) => `"${t}"`)
				.join(', ')} reached non-DM output: ${JSON.stringify(text)}`,
		);
	}
}
