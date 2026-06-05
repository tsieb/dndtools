import { extractWikilinks, type ParsedWikilink } from './markdown';
import {
	featureSupportForSource,
	type ContentFeatureSupport,
	type ContentSourceId,
} from './content-constraints';

/**
 * CONTENT-006 — the PURE WIKILINK LIFECYCLE engine: CREATE, RESOLVE, RENAME, and REPAIR `[[wikilinks]]`
 * across local / Obsidian / Google-Docs-sourced notes, PRESERVING SOURCE CONVENTIONS.
 *
 * Everything here is a PURE, DETERMINISTIC function of its explicit inputs (note bodies + target names +
 * the per-source constraint descriptors). It NEVER reads ambient state, storage, or a real transport. The
 * actor-FILTERED resolution + suggestion live in the query layer (`queries/wikilink-graph.ts`), which feeds
 * this engine only the targets an editor may see — so a rename/repair can never resolve, rename, or suggest
 * a target the editor cannot see (CONTENT-006 actor-filtering, fail closed).
 *
 * The four lifecycle operations:
 *
 *   - CREATE — {@link createWikilink} renders a `[[target#section|alias]]` token from its parts, choosing the
 *     SOURCE-APPROPRIATE form. A source that cannot represent a wikilink natively (Google Docs) gets a
 *     non-destructive PLAIN-TEXT fallback rather than a token it would mangle (`canPreserveWikilinks` from
 *     the constraint descriptor — preserve source conventions; CONTENT-006 AC2).
 *
 *   - RESOLVE — {@link resolveWikilink} matches a parsed link's target (and `#section`) against a candidate
 *     index of resolvable targets, returning the resolved id + matched section or a structured
 *     `unresolved`/`source-unavailable` outcome. It NEVER guesses across a source it cannot reach.
 *
 *   - RENAME — {@link renamePropagateInBody} rewrites every link in a body whose target matches an old name
 *     to a new name, PRESERVING each link's `#section`, `|alias`, and surrounding text exactly. Deterministic:
 *     the same body + rename always yields the same rewrite. An alias is preserved so display text is stable.
 *
 *   - REPAIR — {@link detectBrokenLinks} finds links whose target resolves to nothing; {@link applyLinkRepair}
 *     rewrites a specific broken target to a chosen fix. When the linked SOURCE is unavailable + uncached,
 *     repair returns a `source-unavailable` diagnostic and rewrites NOTHING (CONTENT-006 AC3 — never a
 *     destructive rewrite offline).
 */

export const WIKILINK_GRAPH_SCHEMA_VERSION = 1 as const;

/** A resolvable wikilink TARGET in the actor-filtered candidate index: a note id + its title + aliases. */
export interface WikilinkTarget {
	/** The content item id the link resolves to. */
	id: string;
	/** The canonical title the link names. */
	title: string;
	/** Alternate names (Obsidian `aliases`) that also resolve to this target. */
	aliases: string[];
	/** Section anchors (headings) available in this target, for `[[title#section]]` resolution. */
	sections: string[];
	/** The source this target lives in (local / Obsidian / Google Docs), for source-convention handling. */
	source: ContentSourceId;
	/**
	 * Whether this target's source is currently REACHABLE (online or cached). `false` ⇒ a repair against it
	 * is refused with a `source-unavailable` diagnostic rather than a destructive rewrite (CONTENT-006 AC3).
	 */
	available: boolean;
}

/** Normalize a target/alias for case-insensitive, trimmed matching. Deterministic. */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/** Normalize a section anchor for matching (Obsidian heading anchors are case-insensitive, trimmed). */
function normalizeSection(section: string): string {
	return section.trim().toLowerCase();
}

/** The outcome of resolving ONE wikilink against the candidate index. */
export type WikilinkResolution =
	| {
			status: 'resolved';
			targetId: string;
			/** The matched section anchor when the link named one AND the target has it; else `null`. */
			matchedSection: string | null;
			/** True when the link named a `#section` the target does NOT have (resolved note, missing section). */
			sectionMissing: boolean;
	  }
	| { status: 'unresolved' }
	| { status: 'source-unavailable'; targetId: string };

/**
 * CONTENT-006 — RESOLVE one parsed wikilink against the actor-filtered candidate index. Matches the link's
 * target against each candidate's title + aliases (case-insensitive, trimmed). When the link names a
 * `#section`, the matched target's `sections` are checked: a present section sets `matchedSection`; an absent
 * one resolves the NOTE but flags `sectionMissing` (CONTENT-006 AC1 — resolve note + section where available).
 * A target whose source is unavailable resolves to `source-unavailable` (never a guess). Deterministic.
 */
export function resolveWikilink(
	link: Pick<ParsedWikilink, 'target' | 'section'>,
	candidates: readonly WikilinkTarget[],
): WikilinkResolution {
	const needle = normalizeName(link.target);
	if (needle === '') return { status: 'unresolved' };
	const match = candidates.find(
		(candidate) =>
			normalizeName(candidate.title) === needle ||
			candidate.aliases.some((alias) => normalizeName(alias) === needle),
	);
	if (!match) return { status: 'unresolved' };
	if (!match.available) return { status: 'source-unavailable', targetId: match.id };
	if (link.section === undefined || link.section.trim() === '') {
		return { status: 'resolved', targetId: match.id, matchedSection: null, sectionMissing: false };
	}
	const wanted = normalizeSection(link.section);
	const found = match.sections.find((section) => normalizeSection(section) === wanted);
	return {
		status: 'resolved',
		targetId: match.id,
		matchedSection: found ?? null,
		sectionMissing: found === undefined,
	};
}

/**
 * CONTENT-006 — CREATE a wikilink token from its parts, PRESERVING SOURCE CONVENTIONS. For a source that can
 * represent wikilinks natively (local markdown / Obsidian) the canonical `[[target#section|alias]]` form is
 * rendered. For a source that CANNOT (`canPreserveWikilinks` false — Google Docs), a non-destructive
 * plain-text fallback is rendered instead (the alias or the bare target text), so we never write a token the
 * source would mangle. Pure.
 */
export function createWikilink(
	parts: { target: string; section?: string; alias?: string },
	source: ContentSourceId,
): string {
	const target = parts.target.trim();
	const support: ContentFeatureSupport = featureSupportForSource(source, 'wikilinks');
	if (support === 'unsupported') {
		// Source cannot represent a wikilink — emit plain text (alias preferred), never a broken token.
		return (parts.alias ?? target).trim();
	}
	const section = parts.section?.trim();
	const alias = parts.alias?.trim();
	const inner = `${target}${section ? `#${section}` : ''}${alias ? `|${alias}` : ''}`;
	return `[[${inner}]]`;
}

/**
 * CONTENT-006 — RENAME-PROPAGATION inside one note body. Rewrites every `[[...]]` whose target matches
 * `fromTarget` (case-insensitive, trimmed) to `toTarget`, PRESERVING each link's `#section`, `|alias`, and all
 * surrounding text byte-for-byte. Links that do not match are untouched. Deterministic + idempotent (running
 * it twice with the same rename is a no-op the second time). Returns the rewritten body + how many links were
 * rewritten. Pure.
 */
export function renamePropagateInBody(
	body: string,
	fromTarget: string,
	toTarget: string,
): { body: string; rewritten: number } {
	const from = normalizeName(fromTarget);
	const to = toTarget.trim();
	if (from === '') return { body, rewritten: 0 };
	let rewritten = 0;
	const next = body.replace(/\[\[([^\]]+?)\]\]/g, (whole, inner: string) => {
		const [targetAndSection, alias] = splitOnce(inner, '|');
		const [target, section] = splitOnce(targetAndSection, '#');
		if (normalizeName(target) !== from) return whole;
		rewritten += 1;
		const rebuilt = `${to}${section !== undefined ? `#${section}` : ''}${
			alias !== undefined ? `|${alias}` : ''
		}`;
		return `[[${rebuilt}]]`;
	});
	return { body: next, rewritten };
}

/** Split a string on the FIRST occurrence of a separator. Returns `[head, tail?]`. Mirrors `markdown.ts`. */
function splitOnce(value: string, separator: string): [string, string | undefined] {
	const index = value.indexOf(separator);
	if (index === -1) return [value, undefined];
	return [value.slice(0, index), value.slice(index + separator.length)];
}

/** One broken wikilink found in a body: the parsed link + why it is broken. */
export interface BrokenWikilink {
	link: ParsedWikilink;
	reason: 'unresolved' | 'section-missing' | 'source-unavailable';
}

/**
 * CONTENT-006 — REPAIR detection: scan a body's links and report the ones that do not cleanly resolve against
 * the actor-filtered candidate index. A link whose target resolves to nothing is `unresolved`; one that
 * resolves the note but names a missing `#section` is `section-missing`; one whose target source is
 * unavailable/uncached is `source-unavailable` (the repair UI must NOT offer a destructive rewrite for it
 * offline — CONTENT-006 AC3). Pure + deterministic; duplicates in the body are reported once per occurrence.
 */
export function detectBrokenLinks(
	body: string,
	candidates: readonly WikilinkTarget[],
): BrokenWikilink[] {
	const broken: BrokenWikilink[] = [];
	for (const link of extractWikilinks(body)) {
		const resolution = resolveWikilink(link, candidates);
		if (resolution.status === 'unresolved') {
			broken.push({ link, reason: 'unresolved' });
		} else if (resolution.status === 'source-unavailable') {
			broken.push({ link, reason: 'source-unavailable' });
		} else if (resolution.sectionMissing) {
			broken.push({ link, reason: 'section-missing' });
		}
	}
	return broken;
}

/** The outcome of attempting a link repair. */
export type LinkRepairResult =
	| { status: 'repaired'; body: string; rewritten: number }
	// CONTENT-006 AC3 — the link's source is unavailable + uncached: NOTHING is rewritten (no destructive
	// rewrite offline); the editor sees this diagnostic instead.
	| { status: 'source-unavailable' }
	// The chosen fix target does not resolve to a visible/available target — refuse rather than write a
	// new broken link.
	| { status: 'fix-unresolved' };

/**
 * CONTENT-006 — APPLY a repair: rewrite every link whose target matches `brokenTarget` to point at
 * `fixTargetTitle`, but ONLY when the fix resolves to an AVAILABLE, visible candidate. FAIL CLOSED: if the
 * broken target's matched candidate (when one exists) is `source-unavailable`, NOTHING is rewritten and a
 * `source-unavailable` diagnostic is returned (no destructive rewrite offline — AC3). If the chosen fix does
 * not resolve to an available target, the repair is refused (`fix-unresolved`) so we never write a new broken
 * link. Otherwise the body is rewritten deterministically via {@link renamePropagateInBody}. Pure.
 */
export function applyLinkRepair(
	body: string,
	brokenTarget: string,
	fixTargetTitle: string,
	candidates: readonly WikilinkTarget[],
): LinkRepairResult {
	// If the broken target itself resolves to a known-but-unavailable source, refuse to rewrite (AC3).
	const brokenResolution = resolveWikilink({ target: brokenTarget }, candidates);
	if (brokenResolution.status === 'source-unavailable') {
		return { status: 'source-unavailable' };
	}
	// The fix must resolve to an AVAILABLE, visible candidate; otherwise we'd write a new broken link.
	const fixResolution = resolveWikilink({ target: fixTargetTitle }, candidates);
	if (fixResolution.status !== 'resolved') {
		return fixResolution.status === 'source-unavailable'
			? { status: 'source-unavailable' }
			: { status: 'fix-unresolved' };
	}
	const { body: rewrittenBody, rewritten } = renamePropagateInBody(
		body,
		brokenTarget,
		fixTargetTitle,
	);
	if (rewritten === 0) return { status: 'fix-unresolved' };
	return { status: 'repaired', body: rewrittenBody, rewritten };
}
