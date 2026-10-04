// RC-UX-3.4 — a pure parser for the repo's `CHANGELOG.md` (Keep a Changelog format: `## [version]
// - date` headings, `-` bulleted entries). Kept framework-free and dependency-free so it is trivial
// to unit test against the real file and to reuse from the Help menu's "What's new" section.
//
// RC-UX-6.6 — the changelog is written for maintainers (ONB-9: "a shared-file reader caught
// `IOException | SecurityException`…"). What's new reads ONLY the `### For players and GMs` block
// under each release, and renders it as plain text: no code spans, emphasis or link syntax survives.

export interface ReleaseNote {
	/** The bracketed heading text, e.g. `0.3.1` or `Unreleased`. */
	readonly version: string;
	/** ISO date if the heading carried one (`## [0.3.1] - 2026-07-28`), else null (`[Unreleased]`). */
	readonly date: string | null;
	/** The bullets of this release's `### For players and GMs` block, as plain text, in document
	 * order. Empty when the release has no such block. */
	readonly items: readonly string[];
}

const HEADING_RE = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SUBHEADING_RE = /^###\s+(.*?)\s*$/;
const BULLET_RE = /^-\s+(.*)$/;
/** The one subsection What's new reads. Everything else in a release is for maintainers. */
export const PLAYER_NOTES_HEADING = 'For players and GMs';

/**
 * Markdown inline syntax → the words a reader sees. Code spans keep their text but lose the
 * backticks (the block's authoring rule forbids them; this is the belt to that braces), links keep
 * their label, and emphasis markers go.
 */
export function plainText(markdown: string): string {
	return markdown
		.replace(/`+([^`]*)`+/g, '$1')
		.replace(/`/g, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/(\*\*|__)(.+?)\1/g, '$2')
		.replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, '$1$2')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Parse every `## [version] - date` section into an ordered list of releases, newest first (the
 * file's own order). A release with no `### For players and GMs` block still appears, with an
 * empty `items` array. A bullet that wraps onto the following lines is joined back into one item. */
export function parseChangelog(markdown: string): ReleaseNote[] {
	const releases: ReleaseNote[] = [];
	let items: string[] = [];
	let current: { version: string; date: string | null } | null = null;
	let inPlayerBlock = false;
	let bullet: string | null = null;

	const endBullet = () => {
		if (bullet !== null) {
			const text = plainText(bullet);
			if (text) items.push(text);
		}
		bullet = null;
	};
	const flush = () => {
		endBullet();
		if (current) releases.push({ ...current, items });
	};

	for (const rawLine of markdown.split(/\r?\n/)) {
		const line = rawLine.trim();
		const heading = HEADING_RE.exec(line);
		if (heading) {
			flush();
			current = { version: heading[1], date: heading[2] ?? null };
			items = [];
			inPlayerBlock = false;
			continue;
		}
		if (!current) continue;
		const subheading = SUBHEADING_RE.exec(line);
		if (subheading) {
			endBullet();
			inPlayerBlock = subheading[1].toLowerCase() === PLAYER_NOTES_HEADING.toLowerCase();
			continue;
		}
		if (!inPlayerBlock) continue;
		const start = BULLET_RE.exec(line);
		if (start) {
			endBullet();
			bullet = start[1];
		} else if (line === '') {
			endBullet();
		} else if (bullet !== null) {
			bullet += ' ' + line;
		}
	}
	flush();
	return releases;
}

/** The most recent SHIPPED release, when it has player notes. Preview entries under `[Unreleased]`
 * are never shipped. Null when the latest shipped release has no `### For players and GMs` block —
 * What's new then says "No notes for this release" rather than reaching back to an older one. */
export function latestRelease(releases: readonly ReleaseNote[]): ReleaseNote | null {
	const shipped = releases.find((release) => release.version.trim().toLowerCase() !== 'unreleased');
	return shipped && shipped.items.length > 0 ? shipped : null;
}
