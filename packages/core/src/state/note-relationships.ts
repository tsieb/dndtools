import { extractWikilinks, headingAnchors, slugifyHeading } from './markdown';

/**
 * GRAPH-002 — the PURE NOTE-RELATIONSHIP engine: BACKLINKS, CROSS-SECTION links, and RELATED-NOTE jumps,
 * with CONTEXT SNIPPETS, computed as a DETERMINISTIC function of explicit note records.
 *
 * Everything here is a PURE function of its inputs (a target id + a set of {@link NoteRelationshipRecord}s).
 * It NEVER reads ambient state, storage, a clock, or a real transport. The ACTOR-FILTERED surface lives in
 * the query layer (`queries/note-relationships.ts`), which feeds this engine ONLY the notes — and the
 * visible SECTIONS of those notes — the actor may see. Because the engine is fed only visible inputs, a
 * backlink, cross-section link, related-note jump, or snippet can NEVER name or quote a note/section the
 * actor cannot see (GRAPH-002 actor-filtering, fail closed; Cross-Contract Non-Negotiable 2). This is the
 * SAME composition the rest of the GRAPH/CONTENT surfaces use — it does NOT introduce a second relationship
 * source; it builds on the existing actor-filtered link graph (`buildVisibleBacklinks` in `search-query.ts`
 * computes the same reverse edges as a relationship HINT; this engine adds the navigable detail + snippet).
 *
 * The three relationship kinds GRAPH-002 surfaces from a note:
 *
 *   - BACKLINK — a VISIBLE note that wikilinks TO the target note. Each backlink carries the source note's
 *     id + title, the optional `#section` the link addressed, and a CONTEXT SNIPPET of the text around the
 *     link (drawn ONLY from the source note's visible body — see the query layer's section redaction).
 *
 *   - CROSS-SECTION link — a backlink whose link named a `#section` of the target (`[[Target#Section]]`).
 *     It resolves to the target's heading anchor when the target HAS that heading; otherwise the section is
 *     reported as unresolved so a stale `#section` link degrades gracefully (no crash, no leak).
 *
 *   - RELATED-NOTE jump — a VISIBLE note the target note wikilinks TO (the forward edges from the target),
 *     i.e. the "jump to related note" navigation. Each carries the related note's id + title.
 *
 * Determinism: the same target + records always produce the same relationships in the same order
 * (deduped, sorted by title then id). The Processing Core owns the graph algorithm; the GUI renders the
 * computed model (Architecture Contract 1).
 */

export const NOTE_RELATIONSHIPS_SCHEMA_VERSION = 1 as const;

/**
 * ONE note as fed to the relationship engine: its id/title/aliases for link matching, its heading anchors
 * (so a cross-section link can resolve a `#section`), and its VISIBLE body text (frontmatter stripped,
 * hidden sections already redacted by the query layer) used for context snippets. A record only ever
 * appears here when the actor may see the note, so the engine never receives a hidden note.
 */
export interface NoteRelationshipRecord {
	/** The content item id the note resolves to. */
	id: string;
	/** The canonical title a link names. */
	title: string;
	/** Alternate names (Obsidian `aliases`) that also resolve to this note. */
	aliases: string[];
	/** The note's heading anchors (slugified), for `[[Target#Section]]` cross-section resolution. */
	sectionAnchors: string[];
	/**
	 * The note's body, used to DETECT links (backlinks + forward edges). A link's TARGET is a title/id — never
	 * hidden content — and the note itself is actor-visible, so detecting an edge from this body leaks nothing.
	 * The query layer only ever provides this for an actor-VISIBLE note.
	 */
	body: string;
	/**
	 * Whether a CONTEXT SNIPPET may be drawn from this note's `body`. The query layer sets it `false` when the
	 * note is only PARTIALLY visible to the actor (a hidden section/field), so the surrounding text — which
	 * could come from a redacted section — is never quoted. The link/edge still surfaces; only the snippet is
	 * suppressed (fail closed).
	 */
	snippetable: boolean;
	/**
	 * RC-KNW-3.3 — the note's declared TYPED relationships (`relations:` front matter), each an explicit
	 * verb naming how this note relates to a target note by title/alias (e.g. a faction note declaring
	 * `leads :: Marrow Vane`, an NPC note declaring `located-in :: The Sunken Crypt`). Declared on the
	 * actor-visible note itself, so a hidden note never contributes a declaration; the target still has to
	 * resolve to a VISIBLE note (see {@link computeTypedRelationshipEdges}) before it becomes an edge.
	 */
	relations: RelationDeclaration[];
}

/** Normalize a target/alias name for case-insensitive, trimmed matching. Deterministic. */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/** How a cross-section link's named `#section` resolved against the target note's heading anchors. */
export type CrossSectionResolution =
	| { status: 'none' }
	| { status: 'resolved'; anchor: string; label: string }
	| { status: 'section-missing'; label: string };

/** ONE backlink: a visible note that links TO the target, with its cross-section + context snippet. */
export interface NoteBacklink {
	/** The SOURCE note's id (the note that contains the link). */
	sourceId: string;
	/** The source note's title (already actor-safe). */
	sourceTitle: string;
	/** How the link's optional `#section` resolved against the TARGET note's headings. */
	crossSection: CrossSectionResolution;
	/** A short window of the source note's VISIBLE text around the link, for context. `null` when none. */
	snippet: string | null;
}

/** ONE related-note jump: a visible note the TARGET note links TO (a forward edge from the target). */
export interface RelatedNoteJump {
	/** The RELATED note's id (the link's resolved target). */
	relatedId: string;
	/** The related note's title (already actor-safe). */
	relatedTitle: string;
}

/** The computed relationships for ONE target note. Every list is over the actor's visible notes only. */
export interface NoteRelationships {
	/** The target note id the relationships are computed for. */
	targetId: string;
	/** Visible notes that link TO the target (backlinks), deduped + sorted by source title then id. */
	backlinks: NoteBacklink[];
	/** Visible notes the target links TO (related-note jumps), deduped + sorted by related title then id. */
	related: RelatedNoteJump[];
}

const SNIPPET_RADIUS = 40;

/**
 * Build a context SNIPPET around a link's raw `[[...]]` text inside a source body. Returns a short window of
 * surrounding text (collapsed whitespace) with ellipses where it was clipped, or `null` when the link text
 * is not present in the VISIBLE body (e.g. the link sits in a redacted section the query layer stripped, so
 * the snippet must NOT be invented). Pure.
 */
function snippetAround(body: string, rawLink: string): string | null {
	const index = body.indexOf(rawLink);
	if (index === -1) return null;
	const start = Math.max(0, index - SNIPPET_RADIUS);
	const end = Math.min(body.length, index + rawLink.length + SNIPPET_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < body.length ? '…' : '';
	const window = body.slice(start, end).replace(/\s+/g, ' ').trim();
	return `${prefix}${window}${suffix}`;
}

/**
 * Resolve a link's optional `#section` against the TARGET note's heading anchors (cross-section link). The
 * named section is slugified the SAME way headings are, so `[[Target#The History]]` resolves to the
 * `the-history` anchor when the target has it; a named section the target lacks is `section-missing` (the
 * link still navigates to the note, the missing section degrades gracefully). No `#section` ⇒ `none`. Pure.
 */
function resolveCrossSection(
	section: string | undefined,
	targetSectionAnchors: readonly string[],
): CrossSectionResolution {
	if (section === undefined || section.trim() === '') return { status: 'none' };
	const label = section.trim();
	const wanted = slugifyHeading(label);
	if (wanted !== '' && targetSectionAnchors.includes(wanted)) {
		return { status: 'resolved', anchor: wanted, label };
	}
	return { status: 'section-missing', label };
}

/**
 * GRAPH-002 — compute the BACKLINKS + RELATED-NOTE jumps for ONE target note, over the provided VISIBLE note
 * records. Backlinks are every visible note (other than the target itself) whose body wikilinks to the
 * target's title or an alias; each carries its cross-section resolution (against the target's headings) and a
 * context snippet from the SOURCE note's visible body. Related jumps are the visible notes the TARGET links
 * TO. Both are deduped (one entry per source/related note — the FIRST link occurrence supplies the snippet)
 * and sorted deterministically by title then id. Pure + deterministic.
 *
 * `target` must be one of `records` (the actor-visible target). When it is absent the caller has already
 * decided the target is hidden/deleted; this function is only reached for a visible target.
 */
export function computeNoteRelationships(
	targetId: string,
	records: readonly NoteRelationshipRecord[],
): NoteRelationships {
	const target = records.find((record) => record.id === targetId);
	if (!target) {
		// Defensive: a target not in the visible set yields no relationships (the query layer fails closed
		// before reaching here, but never derive relationships against an unknown/hidden target).
		return { targetId, backlinks: [], related: [] };
	}

	// The names that resolve to the TARGET (title + aliases), for backlink matching.
	const targetNames = new Set<string>([
		normalizeName(target.title),
		...target.aliases.map(normalizeName),
	]);
	targetNames.delete('');

	// An id index by name, so the target's forward links resolve to visible related notes.
	const idByName = new Map<string, string>();
	for (const record of records) {
		idByName.set(normalizeName(record.title), record.id);
		for (const alias of record.aliases) idByName.set(normalizeName(alias), record.id);
	}
	idByName.delete('');

	// --- BACKLINKS: visible notes that link TO the target (one entry per source note). ---
	const backlinks: NoteBacklink[] = [];
	for (const source of records) {
		if (source.id === targetId) continue;
		let matched: { crossSection: CrossSectionResolution; snippet: string | null } | null = null;
		for (const link of extractWikilinks(source.body)) {
			if (!targetNames.has(normalizeName(link.target))) continue;
			// FIRST matching link in the source supplies the cross-section + snippet (deterministic). The
			// snippet is suppressed for a partially-hidden source so we never quote a redacted section.
			matched = {
				crossSection: resolveCrossSection(link.section, target.sectionAnchors),
				snippet: source.snippetable ? snippetAround(source.body, link.raw) : null,
			};
			break;
		}
		if (matched) {
			backlinks.push({
				sourceId: source.id,
				sourceTitle: source.title,
				crossSection: matched.crossSection,
				snippet: matched.snippet,
			});
		}
	}
	backlinks.sort(
		(a, b) => a.sourceTitle.localeCompare(b.sourceTitle) || a.sourceId.localeCompare(b.sourceId),
	);

	// --- RELATED-NOTE jumps: visible notes the TARGET links TO (one entry per related note). ---
	const relatedIds = new Map<string, string>(); // relatedId -> relatedTitle
	for (const link of extractWikilinks(target.body)) {
		const relatedId = idByName.get(normalizeName(link.target));
		if (relatedId === undefined || relatedId === targetId) continue;
		if (relatedIds.has(relatedId)) continue;
		const related = records.find((record) => record.id === relatedId);
		if (related) relatedIds.set(relatedId, related.title);
	}
	const related: RelatedNoteJump[] = [...relatedIds.entries()].map(([relatedId, relatedTitle]) => ({
		relatedId,
		relatedTitle,
	}));
	related.sort(
		(a, b) =>
			a.relatedTitle.localeCompare(b.relatedTitle) || a.relatedId.localeCompare(b.relatedId),
	);

	return { targetId, backlinks, related };
}

/**
 * GRAPH-002 — the slugified heading anchors of a note body, exposed so the query layer can build a
 * {@link NoteRelationshipRecord}'s `sectionAnchors` from the SAME deterministic slug the cross-section
 * resolver matches against (and the same one the note deep link / heading navigation uses). Pure.
 */
export function noteSectionAnchors(body: string): string[] {
	return headingAnchors(body).map((heading) => heading.anchor);
}

/* ------------------------------------------------------------------------------------------------
 * RC-KNW-3.3 — the RELATIONSHIP EDITOR: TYPED edges between notes (faction↔NPC, NPC↔location, or any
 * other pair), declared as explicit `relations:` front matter rather than inferred from prose links.
 * A typed edge is authored data, not a parsed one — it is NOT a second wikilink engine: the note
 * substrate (front matter list + `content.update-item`), the actor-visibility choke-point, and the
 * name-resolution rules are all the SAME ones GRAPH-002's backlinks/related jumps already use.
 * ---------------------------------------------------------------------------------------------- */

/** The `relations:` front-matter list item grammar: `<verb> :: <target title or alias>`. */
const RELATION_DECLARATION_SEPARATOR = ' :: ';

/** ONE declared typed relationship, as authored on a note (before the target is resolved). */
export interface RelationDeclaration {
	/** The relationship verb, as authored (e.g. `leads`, `located-in`, `allied-with`). Free text. */
	verb: string;
	/** The target note's title or alias, as authored — resolved against the visible note set. */
	targetName: string;
}

/**
 * RC-KNW-3.3 — parse a note's raw `relations:` front-matter list into {@link RelationDeclaration}s. Each
 * line must match `<verb> :: <target>`; a line that doesn't (missing separator, empty verb, or empty
 * target) is SKIPPED rather than crashing the read — a malformed declaration degrades to "not an edge",
 * never a thrown error. Pure.
 */
export function parseRelationDeclarations(raw: readonly string[]): RelationDeclaration[] {
	const declarations: RelationDeclaration[] = [];
	for (const line of raw) {
		const index = line.indexOf(RELATION_DECLARATION_SEPARATOR);
		if (index === -1) continue;
		const verb = line.slice(0, index).trim().toLowerCase();
		const targetName = line.slice(index + RELATION_DECLARATION_SEPARATOR.length).trim();
		if (verb === '' || targetName === '') continue;
		declarations.push({ verb, targetName });
	}
	return declarations;
}

/** Serialize one {@link RelationDeclaration} back to its `relations:` front-matter line grammar. Pure. */
export function serializeRelationDeclaration(declaration: RelationDeclaration): string {
	return `${declaration.verb}${RELATION_DECLARATION_SEPARATOR}${declaration.targetName}`;
}

/** ONE resolved TYPED edge: a source note's declared relationship to a VISIBLE target note. */
export interface TypedRelationEdge {
	sourceId: string;
	sourceTitle: string;
	/** The relationship verb, as authored (lowercased). */
	verb: string;
	targetId: string;
	targetTitle: string;
}

/**
 * RC-KNW-3.3 — compute the TYPED RELATIONSHIP EDGES over a set of actor-VISIBLE note records: every
 * declared `relations:` line whose target name resolves to a VISIBLE note (title or alias) becomes one
 * edge. A declaration that resolves to nothing visible (a typo, a hidden note, a deleted note) yields NO
 * edge — the same fail-closed degrade GRAPH-002's related-note jumps use, so a typed edge can never name
 * a note the actor cannot see. Self-edges (a note declaring a relationship to itself) are dropped.
 * Deduped per (source, verb, target) triple and sorted deterministically (source title → verb → target
 * title → ids), so the graph the GUI renders is reproducible. Pure + deterministic.
 */
export function computeTypedRelationshipEdges(
	records: readonly NoteRelationshipRecord[],
): TypedRelationEdge[] {
	const idByName = new Map<string, string>();
	for (const record of records) {
		idByName.set(normalizeName(record.title), record.id);
		for (const alias of record.aliases) idByName.set(normalizeName(alias), record.id);
	}
	idByName.delete('');

	const seen = new Set<string>();
	const edges: TypedRelationEdge[] = [];
	for (const source of records) {
		for (const declaration of source.relations) {
			const targetId = idByName.get(normalizeName(declaration.targetName));
			if (targetId === undefined || targetId === source.id) continue;
			const target = records.find((record) => record.id === targetId);
			if (!target) continue;
			const key = `${source.id} ${declaration.verb} ${targetId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({
				sourceId: source.id,
				sourceTitle: source.title,
				verb: declaration.verb,
				targetId,
				targetTitle: target.title,
			});
		}
	}
	edges.sort(
		(a, b) =>
			a.sourceTitle.localeCompare(b.sourceTitle) ||
			a.verb.localeCompare(b.verb) ||
			a.targetTitle.localeCompare(b.targetTitle) ||
			a.sourceId.localeCompare(b.sourceId) ||
			a.targetId.localeCompare(b.targetId),
	);
	return edges;
}
