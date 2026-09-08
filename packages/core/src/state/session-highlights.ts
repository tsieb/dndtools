/**
 * RC-CHR-4.2 — HIGHLIGHT COMPILATION: gather the `session-highlight` journal entries every character
 * already carries (`character-journal.ts`, CHAR-012/CHAR-016) into ONE shared "Session highlights" note.
 *
 * Mirrors the split RC-SES-4.1 established for the session-log capture (`state/session-log.ts`): this
 * module owns only the PURE composition of the markdown body from already-fetched journal entries. The
 * command layer (`commands/session-highlights.ts`) does the DM-authority check, gathers the raw entries
 * (a compile is a DM audit of the whole table, not a single actor's filtered read), and writes the result
 * as a `content.create-item` of the `session-highlights` Vault Object subtype.
 *
 * Framework-free and language-free: character names are already-resolved strings passed in by the
 * caller, and there is no hard-coded English beyond the markdown structure itself (a `##` heading per
 * character, a bullet per highlight) — no section labels to translate.
 */

/** The Vault Object subtype a compiled highlights note carries (`state/vault-object-schema.ts`). */
export const SESSION_HIGHLIGHTS_SUBTYPE = 'session-highlights' as const;

/** One character's contribution to the compile: their name plus their `session-highlight` entries,
 *  in the journal's own newest-first order. */
export interface CharacterHighlights {
	characterId: string;
	characterName: string;
	highlights: ReadonlyArray<{ title: string; body: string }>;
}

/** Drop characters with nothing to contribute — an empty section is never rendered. Pure. */
function withContributions(
	sections: readonly CharacterHighlights[],
): readonly CharacterHighlights[] {
	return sections.filter((section) => section.highlights.length > 0);
}

/** Whether a compile has anything worth storing (every character contributed nothing). */
export function isEmptyHighlightsCompile(sections: readonly CharacterHighlights[]): boolean {
	return withContributions(sections).length === 0;
}

/**
 * Compose the per-character sections into the markdown body of the shared note. One `##` heading per
 * character that actually contributed a highlight (a character with none is OMITTED entirely, never
 * rendered as an empty heading); one bullet per highlight, titled when the entry has a title. Pure and
 * deterministic: the same sections always produce the same markdown.
 */
export function composeSessionHighlightsMarkdown(sections: readonly CharacterHighlights[]): string {
	return withContributions(sections)
		.map((section) => {
			const lines = section.highlights.map((h) => {
				const title = h.title.trim();
				const body = h.body.trim();
				if (title === '') return `- ${body}`;
				return body === '' ? `- **${title}**` : `- **${title}** — ${body}`;
			});
			return `## ${section.characterName}\n\n${lines.join('\n')}`;
		})
		.join('\n\n');
}
