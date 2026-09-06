// RC-UX-3.4 — a pure parser for the repo's `CHANGELOG.md` (Keep a Changelog format: `## [version]
// - date` headings, `-` bulleted entries). Kept framework-free and dependency-free so it is trivial
// to unit test against the real file and to reuse from the Help menu's "What's new" section.

export interface ReleaseNote {
	/** The bracketed heading text, e.g. `0.3.1` or `Unreleased`. */
	readonly version: string;
	/** ISO date if the heading carried one (`## [0.3.1] - 2026-07-28`), else null (`[Unreleased]`). */
	readonly date: string | null;
	/** The top-level `-` bullets under this heading, in document order. */
	readonly items: readonly string[];
}

const HEADING_RE = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const BULLET_RE = /^-\s+(.*)$/;

/** Parse every `## [version] - date` section into an ordered list of releases, newest first (the
 * file's own order). A heading with no bullets under it (a freshly-cut `[Unreleased]`) still
 * appears, with an empty `items` array — callers that want the latest SHIPPED notes should skip
 * past it with `latestRelease`. */
export function parseChangelog(markdown: string): ReleaseNote[] {
	const releases: ReleaseNote[] = [];
	let items: string[] = [];
	let current: { version: string; date: string | null } | null = null;

	const flush = () => {
		if (current) releases.push({ ...current, items });
	};

	for (const rawLine of markdown.split(/\r?\n/)) {
		const line = rawLine.trim();
		const heading = HEADING_RE.exec(line);
		if (heading) {
			flush();
			current = { version: heading[1], date: heading[2] ?? null };
			items = [];
			continue;
		}
		if (!current) continue;
		const bullet = BULLET_RE.exec(line);
		if (bullet) items.push(bullet[1].trim());
	}
	flush();
	return releases;
}

/** The most recent release that actually shipped notes — skips a heading with no bullets yet (an
 * empty `[Unreleased]` section between releases). Null for an empty or heading-less changelog. */
export function latestRelease(releases: readonly ReleaseNote[]): ReleaseNote | null {
	return releases.find((release) => release.items.length > 0) ?? null;
}
