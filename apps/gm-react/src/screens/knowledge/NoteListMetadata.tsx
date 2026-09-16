import { useMemo } from 'react';
import { parseMarkdownNote, type ContentItemView } from '@dndtools/core';
import { T } from '../../app/screen-kit';

/** The core's folder facet key (`itemFolder` in `queries/search-query.ts`). */
const FOLDER_FIELD = 'dndtools.folder';

/** How many tags a list card shows before it stops competing with the title for the 292px. */
const TAG_LIMIT = 2;

/**
 * The folder and tags a list card may show for ONE note.
 *
 * Both are derived exactly the way the core derives its own search facets, and that is a security
 * contract rather than a consistency nicety. `ContentItemView.body` is actor-filtered — a non-DM's
 * copy has already had every `[!Secret]` callout removed by `stripSecretCallouts` — but
 * `ContentItemView.fields` is projected VERBATIM to every actor. An imported note's `fields.tags` is
 * built by `buildImportedItem` from the AUTHORED markdown, so it still carries the `#hashtags` that
 * only ever appeared inside a secret callout. Reading it here would hand a player the DM's secret
 * tags on the list card while the note's own detail view correctly hid the secret prose.
 *
 * So tags come from the projected body and nowhere else, matching `itemTags`. The cost is that an
 * imported note's front-matter tags are not shown (import moves them out of the body into `fields`),
 * which is the same blind spot the tag FILTER already has — so a tag on a card is now always a tag
 * the reader can actually type into the filter and match.
 *
 * The folder likewise reads only `dndtools.folder`, matching `itemFolder`. The `sourcePath` import
 * field is deliberately not a fallback: it is the DM's archive layout, it is not what the folder
 * filter matches, and a long path is exactly what overflows a 320px card.
 */
export function noteListFacets(note: ContentItemView): { folder: string[]; tags: string[] } {
	const rawFolder = note.fields[FOLDER_FIELD];
	const folder =
		typeof rawFolder === 'string'
			? rawFolder
					.replaceAll('\\', '/')
					.split('/')
					.map((segment) => segment.trim())
					.filter(Boolean)
			: [];
	const tags = [
		...new Set(
			parseMarkdownNote(note.body)
				.tags.map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
				.filter(Boolean),
		),
	].slice(0, TAG_LIMIT);
	return { folder, tags };
}

/**
 * Breadcrumb + tag scent for a note list card. Renders nothing when the note carries neither.
 *
 * Memoized on the two PRIMITIVES the facets are derived from rather than on `note`, because the
 * list's `notes` memo re-projects through `getContentItemsForActor` on every core state change —
 * so every card gets a fresh object identity whenever anything in the vault moves, including each
 * keystroke in the filter panel above it. Re-parsing every note's markdown on each of those is
 * needless work on the render path.
 */
export function NoteListMetadata({ note }: { note: ContentItemView }) {
	const rawFolder = note.fields[FOLDER_FIELD];
	const { folder, tags } = useMemo(
		() => noteListFacets(note),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the facets read only these two.
		[note.body, rawFolder],
	);
	if (folder.length === 0 && tags.length === 0) return null;
	return (
		<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter, marginBottom: 'var(--space-2)' }}>
			{folder.length > 0 && <div data-testid="note-folder">{folder.join(' / ')}</div>}
			{tags.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
					{tags.map((tag) => (
						<span key={tag} data-testid="note-tag">
							#{tag}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
