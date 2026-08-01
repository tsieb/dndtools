import { parseMarkdownNote, type ParsedMarkdownNote } from './markdown';
import { DNDTOOLS_PROPERTY_NAMESPACE } from './content-import';

/**
 * CONTENT-012 — SOURCE-SPECIFIC NOTE CONSTRAINTS as typed CAPABILITY DESCRIPTORS + a PURE pre-write
 * CONSTRAINT CHECK.
 *
 * This is pure Processing-Core policy, modeled on the SAME two patterns the rest of v2 already uses, so
 * there is NO parallel adapter system:
 *
 *  1. CAPABILITY DESCRIPTORS (like `platform/support-matrix.ts` and the MAP-020 adapter descriptor in
 *     `state/map-import.ts`). Each NOTE SOURCE — LOCAL MARKDOWN, OBSIDIAN, GOOGLE DOCS — declares, per
 *     note-structure feature, whether it is `supported` / `lossy` / `unsupported`. The descriptors are
 *     the SEAM a future transport plugs into (the Google Docs / Obsidian transports themselves remain
 *     deferred per ADR-014 — this epic delivers only the typed constraints + pre-write visibility, NOT a
 *     live sync).
 *
 *  2. PRE-COMMIT UNSUPPORTED-ELEMENT DIAGNOSTIC (like MAP-020's `previewMapImport`). Given a note's
 *     DETECTED STRUCTURES (parsed once by `markdown.ts` — the existing structure detector) and a TARGET
 *     SOURCE, {@link checkContentSourceConstraints} reports, BEFORE the write, exactly which formatting,
 *     properties, links, or unsupported embedded structures would be LOST or DOWNGRADED. Nothing is
 *     mutated; this is a read-only pure function of (descriptor, parsed note).
 *
 * FAIL CLOSED (the data-safety crux): a write that would lose or downgrade ANY detected structure is
 * surfaced as `requiresAcknowledgment: true`, and {@link isContentWriteAcknowledged} returns false unless
 * the caller passes the matching acknowledgment token. A lossy write therefore NEVER silently loses data —
 * it is blocked until the human acknowledges exactly what is lost. An UNKNOWN source fails closed to
 * "unsupported" rather than a permissive default (same posture as `capabilityForFeature`).
 *
 * The local draft is NEVER mutated by a check or by a non-acknowledged lossy write: the GUI keeps the
 * draft and the check is read-only, so an unsupported/lossy target reports its status WITHOUT losing the
 * local draft content (CONTENT-012 AC3).
 *
 * Pure data + pure functions. No GUI, no storage, no clock, no real transport (ADR-014: operate on the
 * provided note text). The command layer composes this; the GUI renders the diagnostic and dispatches an
 * ACKNOWLEDGED write intent.
 */

export const CONTENT_CONSTRAINTS_SCHEMA_VERSION = 1 as const;

/**
 * The NOTE SOURCES a note can be written to. `local-markdown` is the BASELINE (portable markdown +
 * front matter). `obsidian` is a superset that natively understands `[[wikilinks]]`, frontmatter
 * properties, aliases, and tags. `google-docs` is the constrained target: it is rich text and cannot
 * represent markdown front matter, wikilinks, aliases, or inline `#tags` faithfully.
 */
export type ContentSourceId = 'local-markdown' | 'obsidian' | 'google-docs';

export const CONTENT_SOURCE_IDS: readonly ContentSourceId[] = [
	'local-markdown',
	'obsidian',
	'google-docs',
] as const;

/**
 * The note-structure FEATURES a constraint check classifies. These are exactly the structures
 * `markdown.ts` DETECTS (front matter properties, aliases, tags, inline `#tags`, `[[wikilinks]]`) plus
 * the Lamplight namespaced metadata the import/export layer manages. A future feature is added here once
 * `markdown.ts` detects it — the descriptors then declare per-source support for it.
 */
export type ContentNoteFeature =
	// Arbitrary YAML-ish `key: value` front matter (user properties).
	| 'frontmatter-properties'
	// The Obsidian `aliases` list.
	| 'aliases'
	// Tags (the `tags` property AND inline `#hashtags`), merged.
	| 'tags'
	// Inline `#hashtags` specifically (a Google-Docs paste keeps the text but loses the tag semantics).
	| 'inline-tags'
	// Obsidian `[[wikilinks]]`.
	| 'wikilinks'
	// Lamplight metadata, which MUST stay NAMESPACED under `dndtools.*` (never a bare common property).
	| 'dndtools-namespaced-metadata';

export const CONTENT_NOTE_FEATURES: readonly ContentNoteFeature[] = [
	'frontmatter-properties',
	'aliases',
	'tags',
	'inline-tags',
	'wikilinks',
	'dndtools-namespaced-metadata',
] as const;

/**
 * How a source handles a given note feature. The classification surfaced in the pre-write diagnostic.
 * Mirrors `MapImportElementSupport` (importable/lossy/unsupported), named for the WRITE direction:
 *
 *  - `supported`: round-trips faithfully; no loss.
 *  - `lossy`: representable, but with declared loss of fidelity (the human is told what is downgraded).
 *  - `unsupported`: the source cannot represent it; it would be DROPPED and REPORTED (never silently lost).
 */
export type ContentFeatureSupport = 'supported' | 'lossy' | 'unsupported';

/**
 * A typed capability descriptor for ONE note source (modeled on the platform capability descriptors and
 * the MAP-020 adapter descriptor). It declares the per-feature support map. Any feature ABSENT from the
 * map fails closed to `unsupported`. Immutable.
 */
export interface ContentSourceDescriptor {
	/** Stable source id. */
	readonly id: ContentSourceId;
	readonly displayName: string;
	readonly version: string;
	/** Human-readable summary of what the source can / can't represent. */
	readonly summary: string;
	/** Per-feature support. A feature ABSENT here is treated as `unsupported` (fail closed). */
	readonly featureSupport: Readonly<Partial<Record<ContentNoteFeature, ContentFeatureSupport>>>;
}

/**
 * THE published note-source capability descriptors (CONTENT-012). Authored once; the GUI renders them and
 * the pre-write check resolves loss from them. This is the data artifact a reviewer inspects and the seam
 * a future Obsidian / Google Docs transport plugs into.
 *
 *  - LOCAL MARKDOWN — the BASELINE: portable markdown + front matter. It represents properties, aliases,
 *    and tags natively. It does NOT have Obsidian's wikilink resolver, so `[[wikilinks]]` survive as
 *    literal text but lose their resolved-link semantics (`lossy`, not lost).
 *  - OBSIDIAN — the superset: native frontmatter properties, aliases, tags, inline tags, AND resolved
 *    `[[wikilinks]]`. Everything `markdown.ts` detects is `supported`.
 *  - GOOGLE DOCS — the constrained rich-text target: it CANNOT represent markdown front matter, wikilinks,
 *    aliases, or inline `#tags` as structured data. Properties/aliases/tags/wikilinks/dndtools metadata
 *    are `unsupported` (they would be dropped on a destructive write-back); inline-tag TEXT survives but
 *    loses its tag semantics (`lossy`).
 */
export const CONTENT_SOURCE_DESCRIPTORS: Readonly<Record<ContentSourceId, ContentSourceDescriptor>> =
	Object.freeze({
		'local-markdown': {
			id: 'local-markdown',
			displayName: 'Local markdown',
			version: '1',
			summary:
				'Portable markdown with YAML front matter. Properties, aliases, and tags round-trip. Obsidian [[wikilinks]] survive as literal text but lose their resolved-link semantics.',
			featureSupport: {
				'frontmatter-properties': 'supported',
				aliases: 'supported',
				tags: 'supported',
				'inline-tags': 'supported',
				wikilinks: 'lossy',
				'dndtools-namespaced-metadata': 'supported',
			},
		},
		obsidian: {
			id: 'obsidian',
			displayName: 'Obsidian',
			version: '1',
			summary:
				'Obsidian vault markdown. Frontmatter properties, aliases, tags, inline #tags, and [[wikilinks]] are all represented natively; Lamplight metadata stays namespaced under dndtools.*.',
			featureSupport: {
				'frontmatter-properties': 'supported',
				aliases: 'supported',
				tags: 'supported',
				'inline-tags': 'supported',
				wikilinks: 'supported',
				'dndtools-namespaced-metadata': 'supported',
			},
		},
		'google-docs': {
			id: 'google-docs',
			displayName: 'Google Docs',
			version: '1',
			summary:
				'Rich-text document. It cannot represent markdown front matter, wikilinks, aliases, or Lamplight metadata as structured data — these are dropped on a destructive write-back. Inline #tag text survives but loses its tag semantics.',
			featureSupport: {
				'frontmatter-properties': 'unsupported',
				aliases: 'unsupported',
				tags: 'unsupported',
				'inline-tags': 'lossy',
				wikilinks: 'unsupported',
				'dndtools-namespaced-metadata': 'unsupported',
			},
		},
	});

/** Resolve the descriptor for a source, or `null` for an unknown source id. */
export function contentSourceDescriptor(sourceId: string): ContentSourceDescriptor | null {
	return CONTENT_SOURCE_DESCRIPTORS[sourceId as ContentSourceId] ?? null;
}

/**
 * Resolve a source's support level for one feature. FAIL CLOSED: an unknown source OR an undeclared
 * feature resolves to `unsupported`, never a permissive default (same posture as `capabilityForFeature`).
 */
export function featureSupportForSource(
	sourceId: string,
	feature: ContentNoteFeature,
): ContentFeatureSupport {
	const descriptor = contentSourceDescriptor(sourceId);
	if (!descriptor) return 'unsupported';
	return descriptor.featureSupport[feature] ?? 'unsupported';
}

/** A human-readable, NON-LEAKING reason for each (feature × support) classification. */
const FEATURE_LABEL: Record<ContentNoteFeature, string> = {
	'frontmatter-properties': 'Front matter properties',
	aliases: 'Aliases',
	tags: 'Tags',
	'inline-tags': 'Inline #tags',
	wikilinks: '[[wikilinks]]',
	'dndtools-namespaced-metadata': 'Lamplight metadata (dndtools.*)',
};

/** Build the per-feature diagnostic message. Describes the FEATURE + outcome, never raw note contents. */
function constraintMessage(
	feature: ContentNoteFeature,
	support: ContentFeatureSupport,
	count: number,
	sourceName: string,
): string {
	const label = FEATURE_LABEL[feature];
	const noun = count === 1 ? 'entry' : 'entries';
	if (support === 'supported') {
		return `${label} (${count} ${noun}) are represented faithfully by ${sourceName}.`;
	}
	if (support === 'lossy') {
		return `${label} (${count} ${noun}) are downgraded by ${sourceName}: the content survives but loses fidelity.`;
	}
	return `${label} (${count} ${noun}) cannot be represented by ${sourceName} and would be dropped on write.`;
}

/** One feature's pre-write classification for a specific note + target source. */
export interface ContentConstraintDiagnostic {
	feature: ContentNoteFeature;
	support: ContentFeatureSupport;
	/** How many instances of this feature the note actually contains (0 ⇒ not present, omitted). */
	count: number;
	/** Non-leaking explanation (feature + outcome; never raw property values or link targets). */
	message: string;
}

/** The detected structure counts the constraint check classifies (derived from `markdown.ts`). */
export interface DetectedNoteStructures {
	/** User front-matter properties (excluding the interpreted aliases/tags + dndtools.* namespace). */
	frontmatterProperties: number;
	aliases: number;
	tags: number;
	inlineTags: number;
	wikilinks: number;
	/** Lamplight namespaced metadata keys (`dndtools.*` or the `dndtools` map). */
	dndtoolsMetadata: number;
}

/**
 * The result of a PRE-WRITE constraint check (CONTENT-012). It is READ-ONLY — no state is mutated, the
 * local draft is untouched. It carries the per-feature diagnostics, the lossy/dropped feature lists, and
 * the FAIL-CLOSED `requiresAcknowledgment` flag + `acknowledgmentToken`.
 */
export interface ContentConstraintCheck {
	source: ContentSourceId;
	sourceDisplayName: string;
	/** True when the target source id was unknown (every present feature is then `unsupported`). */
	unknownSource: boolean;
	/** Counts of the structures `markdown.ts` detected in the note. */
	detected: DetectedNoteStructures;
	/** Per-feature diagnostics for every feature PRESENT in the note (count > 0), in feature order. */
	diagnostics: ContentConstraintDiagnostic[];
	/** Features present in the note that the source DOWNGRADES (lossy). */
	lossyFeatures: ContentNoteFeature[];
	/** Features present in the note that the source CANNOT represent (dropped, reported — never lost). */
	droppedFeatures: ContentNoteFeature[];
	/** True when ANY present feature is lossy or unsupported — the write is potentially destructive. */
	lossy: boolean;
	/**
	 * FAIL-CLOSED: true ⇒ the write must NOT commit until the human acknowledges. Equal to `lossy`. A
	 * faithful write (nothing lossy/dropped) needs no acknowledgment.
	 */
	requiresAcknowledgment: boolean;
	/**
	 * A STABLE, deterministic token identifying exactly what the human must acknowledge (the source + the
	 * sorted lossy/dropped feature set). The acknowledged write intent must echo this token; a stale token
	 * (the note changed since the check) no longer matches, so the human re-acknowledges the new loss.
	 * `null` when no acknowledgment is required.
	 */
	acknowledgmentToken: string | null;
}

/** The Lamplight namespace prefix (`dndtools.`) and bare key, reused from the import layer. */
const DNDTOOLS_PREFIX = `${DNDTOOLS_PROPERTY_NAMESPACE}.`;

/** Front-matter keys the markdown layer surfaces as first-class fields (not "user properties"). */
const INTERPRETED_PROPERTY_KEYS: ReadonlySet<string> = new Set(['title', 'aliases', 'tags']);

/**
 * Count the DETECTED structures in a parsed note (CONTENT-012). `frontmatterProperties` counts only the
 * USER properties — the interpreted aliases/tags/title and the `dndtools.*` namespace are counted under
 * their own features so a feature is never double-counted.
 */
export function detectNoteStructures(parsed: ParsedMarkdownNote): DetectedNoteStructures {
	let frontmatterProperties = 0;
	let dndtoolsMetadata = 0;
	for (const key of Object.keys(parsed.properties)) {
		if (key === DNDTOOLS_PROPERTY_NAMESPACE || key.startsWith(DNDTOOLS_PREFIX)) {
			dndtoolsMetadata += 1;
			continue;
		}
		if (INTERPRETED_PROPERTY_KEYS.has(key)) continue;
		frontmatterProperties += 1;
	}
	// Inline `#tags` are the subset of tags found in the body (vs. declared in the `tags` property).
	const inlineTagSet = new Set(extractInlineTagsFromBody(parsed.body));
	const inlineTags = parsed.tags.filter((tag) => inlineTagSet.has(tag)).length;
	return {
		frontmatterProperties,
		aliases: parsed.aliases.length,
		tags: parsed.tags.length,
		inlineTags,
		wikilinks: parsed.wikilinks.length,
		dndtoolsMetadata,
	};
}

/**
 * Re-extract inline `#hashtags` from a body to distinguish them from `tags`-property tags. Mirrors the
 * (private) inline-tag pattern in `markdown.ts` exactly; kept local so this module stays a pure consumer
 * of the public `ParsedMarkdownNote` value rather than reaching into the parser's internals.
 */
function extractInlineTagsFromBody(body: string): string[] {
	const pattern = /(^|\s)#([A-Za-z][\w/-]*)/g;
	const tags: string[] = [];
	for (const match of body.matchAll(pattern)) {
		tags.push(match[2]!);
	}
	return tags;
}

/** Map a detected structure count to its feature key. */
const FEATURE_COUNT: Record<ContentNoteFeature, (d: DetectedNoteStructures) => number> = {
	'frontmatter-properties': (d) => d.frontmatterProperties,
	aliases: (d) => d.aliases,
	tags: (d) => d.tags,
	'inline-tags': (d) => d.inlineTags,
	wikilinks: (d) => d.wikilinks,
	'dndtools-namespaced-metadata': (d) => d.dndtoolsMetadata,
};

/**
 * Build the deterministic acknowledgment token from the source + the sorted lossy/dropped feature set.
 * Two checks with the same loss profile produce the same token; a different loss profile produces a
 * different token. Format is stable and inspectable: `<source>::<feature>:<support>|...`.
 */
function buildAcknowledgmentToken(
	source: ContentSourceId,
	affected: ReadonlyArray<{ feature: ContentNoteFeature; support: ContentFeatureSupport }>,
): string {
	const parts = affected
		.map((entry) => `${entry.feature}:${entry.support}`)
		.sort((a, b) => a.localeCompare(b));
	return `${source}::${parts.join('|')}`;
}

/**
 * CONTENT-012 — the PURE pre-write CONSTRAINT CHECK. Given a note's DETECTED structures and a TARGET
 * SOURCE, report — BEFORE the write — exactly which formatting, properties, links, or embedded structures
 * would be lost or downgraded. Read-only: nothing is mutated, the local draft is untouched. Fail-closed:
 * an unknown source classifies every present feature `unsupported`, and any lossy/dropped feature sets
 * `requiresAcknowledgment` + a stable `acknowledgmentToken`. A faithful write needs no acknowledgment.
 */
export function checkDetectedStructuresAgainstSource(
	detected: DetectedNoteStructures,
	source: string,
): ContentConstraintCheck {
	const descriptor = contentSourceDescriptor(source);
	const unknownSource = descriptor === null;
	const resolvedSource = (descriptor?.id ?? source) as ContentSourceId;
	const sourceDisplayName = descriptor?.displayName ?? `Unknown source "${source}"`;

	const diagnostics: ContentConstraintDiagnostic[] = [];
	const lossyFeatures: ContentNoteFeature[] = [];
	const droppedFeatures: ContentNoteFeature[] = [];
	const affected: Array<{ feature: ContentNoteFeature; support: ContentFeatureSupport }> = [];

	for (const feature of CONTENT_NOTE_FEATURES) {
		const count = FEATURE_COUNT[feature](detected);
		// Only features actually PRESENT in the note are diagnosed — a check never warns about a feature
		// the note does not use (nothing flagged when the note doesn't contain it).
		if (count === 0) continue;
		const support = featureSupportForSource(resolvedSource, feature);
		diagnostics.push({
			feature,
			support,
			count,
			message: constraintMessage(feature, support, count, sourceDisplayName),
		});
		if (support === 'lossy') {
			lossyFeatures.push(feature);
			affected.push({ feature, support });
		} else if (support === 'unsupported') {
			droppedFeatures.push(feature);
			affected.push({ feature, support });
		}
	}

	const lossy = affected.length > 0;
	return {
		source: resolvedSource,
		sourceDisplayName,
		unknownSource,
		detected,
		diagnostics,
		lossyFeatures,
		droppedFeatures,
		lossy,
		requiresAcknowledgment: lossy,
		acknowledgmentToken: lossy ? buildAcknowledgmentToken(resolvedSource, affected) : null,
	};
}

/**
 * CONTENT-012 — parse a note's text (via `markdown.ts`, the structure detector) and run the pre-write
 * constraint check against a target source. The single entry point a command/GUI calls with raw note
 * text. Pure + deterministic; the local draft text is the input and is never mutated.
 */
export function checkContentSourceConstraints(
	noteText: string,
	source: string,
): ContentConstraintCheck {
	const parsed = parseMarkdownNote(noteText);
	const detected = detectNoteStructures(parsed);
	return checkDetectedStructuresAgainstSource(detected, source);
}

/**
 * FAIL-CLOSED write gate (CONTENT-012 data-safety crux). Returns true ONLY when the write may proceed:
 * either the check requires NO acknowledgment (a faithful write), OR the provided acknowledgment token
 * EXACTLY matches the check's token (the human acknowledged precisely this loss). A missing, empty, or
 * stale token returns false, so a lossy write can never commit silently. The check is recomputed from the
 * note text + source so a caller cannot bypass the gate by passing a fabricated check value.
 */
export function isContentWriteAcknowledged(
	noteText: string,
	source: string,
	acknowledgmentToken: string | null | undefined,
): boolean {
	const check = checkContentSourceConstraints(noteText, source);
	if (!check.requiresAcknowledgment) return true;
	if (!acknowledgmentToken) return false;
	return acknowledgmentToken === check.acknowledgmentToken;
}

/** A capability-summary row for one source, for the GUI's source-capability table (read-only). */
export interface ContentSourceCapabilitySummary {
	id: ContentSourceId;
	displayName: string;
	version: string;
	summary: string;
	supported: ContentNoteFeature[];
	lossy: ContentNoteFeature[];
	unsupported: ContentNoteFeature[];
}

/** Summarize a source descriptor into supported/lossy/unsupported feature lists (sorted). Pure. */
export function summarizeContentSourceCapabilities(
	descriptor: ContentSourceDescriptor,
): ContentSourceCapabilitySummary {
	const supported: ContentNoteFeature[] = [];
	const lossy: ContentNoteFeature[] = [];
	const unsupported: ContentNoteFeature[] = [];
	for (const feature of CONTENT_NOTE_FEATURES) {
		const support = descriptor.featureSupport[feature] ?? 'unsupported';
		if (support === 'supported') supported.push(feature);
		else if (support === 'lossy') lossy.push(feature);
		else unsupported.push(feature);
	}
	return {
		id: descriptor.id,
		displayName: descriptor.displayName,
		version: descriptor.version,
		summary: descriptor.summary,
		supported: supported.sort(),
		lossy: lossy.sort(),
		unsupported: unsupported.sort(),
	};
}

/** All source capability summaries, in declared source order. The GUI renders this as a reference table. */
export function listContentSourceCapabilities(): ContentSourceCapabilitySummary[] {
	return CONTENT_SOURCE_IDS.map((id) =>
		summarizeContentSourceCapabilities(CONTENT_SOURCE_DESCRIPTORS[id]),
	);
}
