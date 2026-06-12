/**
 * UX-ONB-020 — the "What's New" / changelog content registry.
 *
 * A static, reverse-chronological list of release entries. It is surfaced PASSIVELY: the latest few
 * entries appear in the help center (UX-ONB-016) and the full list at `/changelog`, and a badge on
 * the "?" button invites — never demands — attention (UX-ONB-020). It is NEVER shown as an
 * interruptive modal on launch.
 *
 * Entries are presentation content (no actor-private data), so this list is identical for every
 * viewer — there is nothing here to actor-filter.
 */
export interface ChangelogEntry {
	/** Stable version identifier — also the "seen" key (UX-ONB-020 badge state). */
	readonly version: string;
	/** ISO date (YYYY-MM-DD). */
	readonly date: string;
	/** Release title (≤10 words). */
	readonly title: string;
	/** Bullet list of changes (≤6 bullets). */
	readonly changes: readonly string[];
}

/**
 * Newest first. `CHANGELOG[0]` is the current release; its `version` is what the badge compares
 * against the device-local "last seen" marker.
 */
export const CHANGELOG: readonly ChangelogEntry[] = [
	{
		version: '0.2.0',
		date: '2026-06-11',
		title: 'Onboarding, help center, and learnability',
		changes: [
			'New contextual help center on every surface — press the "?" button, or "?" for the keyboard cheat sheet.',
			'First-reach coach marks gently point out key affordances, capped so they never nag.',
			'Feature tiers (core / intermediate / advanced) reveal advanced tools as you grow — now also in Settings.',
			'Teaching empty states across every surface point you at your first action.',
			'This "What\'s New" changelog, surfaced passively from the help center — never as a pop-up.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-05-01',
		title: 'Canvas-first command platform',
		changes: [
			'The Command Center is your session home: place widgets — initiative, maps, notes, dice — on a canvas.',
			'Scenes are spatial, pannable workspaces you build and push to players.',
			'Player and observer views are actor-filtered end to end, so hidden DM content never leaks.',
			'Local-first vault with offline support; the command palette (Mod+K) reaches every action.',
		],
	},
];

/** The current (newest) release version — the value a freshly-seen marker should hold. */
export const LATEST_CHANGELOG_VERSION = CHANGELOG[0]?.version ?? '';
