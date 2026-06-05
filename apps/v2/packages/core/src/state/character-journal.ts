import type { ActorId } from './ids';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';

/**
 * CHAR-012 / CHAR-016 — the durable CHARACTER JOURNAL model: a player keeps bookmarks, NPC
 * impressions, personal quests, and session highlights SCOPED TO THEIR CHARACTER PERMISSIONS, with
 * EXPLICIT PER-ENTRY visibility using the canonical visibility states.
 *
 * Design (mirrors the existing character `resources`/`collaboration` sidecars):
 *
 *   - The journal is keyed BY CHARACTER. Only the character's owner (or a viewer-grantee, or the DM)
 *     may author/read it (CHAR-012 AC1/AC2). Authority is enforced at the COMMAND layer; the
 *     actor-filtered query (`queries/character-journal-query.ts`) is the only sanctioned read path.
 *   - Each entry carries its OWN canonical visibility (`dm-only` / `player-visible` / `shared`) plus
 *     a `sharedWith` delivery list (Contract 3 Axis 1). This is the SAME three-level model the PERM
 *     visibility filter uses, applied at entry granularity (CHAR-016).
 *   - A new entry DEFAULTS to `shared` delivered to the owning character's owner (CHAR-016 AC1): the
 *     owner reads their own journal, the DM always audits it, but it is NOT generally player-visible.
 *     This is fail-closed against accidental leakage — `player-visible` is never the implicit default.
 *
 * Pure data + pure reducers. No GUI, no storage. The command handlers compose these; durable writes
 * go through the storage adapter + op-log, never from the GUI (Contract 1).
 */

export const CHARACTER_JOURNAL_SCHEMA_VERSION = 1 as const;

/** The entity type a journal is addressed by in grants/visibility/ops (carries character data). */
export const CHARACTER_JOURNAL_ENTITY_TYPE = 'character-journal' as const;

/** The categories a journal entry can be. A free `note` covers session highlights/anything else. */
export type JournalEntryKind = 'bookmark' | 'npc-impression' | 'personal-quest' | 'session-highlight' | 'note';

export const JOURNAL_ENTRY_KINDS: readonly JournalEntryKind[] = [
	'bookmark',
	'npc-impression',
	'personal-quest',
	'session-highlight',
	'note',
] as const;

/**
 * One durable journal entry. `visibility` + `sharedWith` are the canonical per-entry visibility
 * (CHAR-016): the SAME three levels the PERM filter uses. The owner authored it; the DM always sees
 * it (DM authority); other actors see it only when the level/delivery permits (filtered in the query
 * layer, never here).
 */
export interface CharacterJournalEntry {
	id: string;
	kind: JournalEntryKind;
	title: string;
	body: string;
	/** Per-entry canonical visibility (Contract 3 Axis 1). Fails closed to `shared`-to-owner default. */
	visibility: VisibilityLevel;
	/** Actor ids a `shared` entry is explicitly delivered to (e.g. the owner, or a viewer-grantee). */
	sharedWith: ActorId[];
	/** The actor that authored the entry (the character owner; or the DM acting administratively). */
	authorActorId: ActorId;
	createdAt: string;
	updatedAt: string;
	/** Optimistic-concurrency revision, bumped on every accepted mutation of this entry. */
	revision: number;
}

/** The journal for ONE character: an ordered (newest-first) list of entries + its schema version. */
export interface CharacterJournal {
	characterId: string;
	entries: CharacterJournalEntry[];
	schemaVersion: typeof CHARACTER_JOURNAL_SCHEMA_VERSION;
}

/** The durable journal slice: per-character journals keyed by character id. */
export interface CharacterJournalState {
	journals: Record<string, CharacterJournal>;
	schemaVersion: typeof CHARACTER_JOURNAL_SCHEMA_VERSION;
}

export const EMPTY_CHARACTER_JOURNAL_STATE: CharacterJournalState = Object.freeze({
	journals: {},
	schemaVersion: CHARACTER_JOURNAL_SCHEMA_VERSION,
});

/** Tolerantly hydrate a possibly-undefined/partial persisted journal slice (safe defaults). */
export function ensureCharacterJournalState(
	state: CharacterJournalState | undefined,
): CharacterJournalState {
	return {
		journals: state?.journals ?? {},
		schemaVersion: CHARACTER_JOURNAL_SCHEMA_VERSION,
	};
}

/** The journal for one character, or an empty journal when none exists yet. Pure. */
export function journalForCharacter(
	state: CharacterJournalState,
	characterId: string,
): CharacterJournal {
	return (
		state.journals[characterId] ?? {
			characterId,
			entries: [],
			schemaVersion: CHARACTER_JOURNAL_SCHEMA_VERSION,
		}
	);
}

function withJournal(
	state: CharacterJournalState,
	journal: CharacterJournal,
): CharacterJournalState {
	return {
		...state,
		journals: { ...state.journals, [journal.characterId]: journal },
	};
}

// --- Pure reducers (CHAR-012 / CHAR-016) ----------------------------------------------------------

export interface AddJournalEntryInput {
	kind: JournalEntryKind;
	title: string;
	body?: string;
	/** Optional explicit per-entry visibility; absent ⇒ the fail-closed `shared`-to-owner default. */
	visibility?: VisibilityLevel;
	/** Optional explicit extra delivery targets for a `shared` entry. The owner is always included. */
	sharedWith?: ActorId[];
}

export interface JournalEntryMeta {
	id: string;
	/** The owning character's `owner` actor — the default `shared` delivery target (CHAR-016 AC1). */
	ownerActorId: ActorId;
	authorActorId: ActorId;
	now: string;
}

/**
 * Build a new journal entry (CHAR-012 / CHAR-016 AC1). VISIBILITY FAILS CLOSED: when no visibility is
 * selected the entry defaults to `shared` delivered to the owning character's owner, so it is readable
 * by the owner and DM-auditable but NOT generally player-visible. An explicit `player-visible`/`dm-only`
 * is honored; for `shared`, the owner is always merged into `sharedWith` so the author can read their
 * own entry. Pure: takes its id/clock from `meta`.
 */
export function buildJournalEntry(
	input: AddJournalEntryInput,
	meta: JournalEntryMeta,
): CharacterJournalEntry {
	const requested = input.visibility ?? 'shared';
	const visibility = normalizeVisibilityLevel(requested);
	// The owner can always read their own entries: for a `shared` entry the owner is a delivery
	// target. For `dm-only`/`player-visible` the `sharedWith` list is irrelevant (kept empty).
	const sharedWith =
		visibility === 'shared'
			? [...new Set([meta.ownerActorId, ...(input.sharedWith ?? [])])]
			: [];
	return {
		id: meta.id,
		kind: input.kind,
		title: input.title,
		body: input.body ?? '',
		visibility,
		sharedWith,
		authorActorId: meta.authorActorId,
		createdAt: meta.now,
		updatedAt: meta.now,
		revision: 1,
	};
}

/** Prepend an entry to a character's journal (newest-first). Pure: returns a new state. */
export function addJournalEntry(
	state: CharacterJournalState,
	characterId: string,
	entry: CharacterJournalEntry,
): CharacterJournalState {
	const journal = journalForCharacter(state, characterId);
	return withJournal(state, {
		...journal,
		characterId,
		entries: [entry, ...journal.entries],
	});
}

export interface UpdateJournalEntryPatch {
	title?: string;
	body?: string;
	kind?: JournalEntryKind;
}

/**
 * Apply a content patch to one entry, bumping its revision. Returns `null` when the entry does not
 * exist (the caller rejects). Pure. Visibility is NOT changed here — it has its own reducer so the
 * cross-surface invalidation trigger is explicit (CHAR-016).
 */
export function updateJournalEntry(
	state: CharacterJournalState,
	characterId: string,
	entryId: string,
	patch: UpdateJournalEntryPatch,
	now: string,
): CharacterJournalState | null {
	const journal = state.journals[characterId];
	const existing = journal?.entries.find((e) => e.id === entryId);
	if (!journal || !existing) return null;
	const next: CharacterJournalEntry = {
		...existing,
		title: patch.title ?? existing.title,
		body: patch.body ?? existing.body,
		kind: patch.kind ?? existing.kind,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return withJournal(state, {
		...journal,
		entries: journal.entries.map((e) => (e.id === entryId ? next : e)),
	});
}

/**
 * Change ONE entry's per-entry visibility (CHAR-016). This is the explicit visibility-change trigger
 * the data-layer invalidation hangs off of: it bumps the entry revision so a stale cached view is
 * detectable, and re-resolves `sharedWith` (keeping the owner as a delivery target for `shared`).
 * Returns `null` when the entry does not exist. Pure.
 */
export function setJournalEntryVisibility(
	state: CharacterJournalState,
	characterId: string,
	entryId: string,
	ownerActorId: ActorId,
	visibility: VisibilityLevel,
	sharedWith: ActorId[] | undefined,
	now: string,
): CharacterJournalState | null {
	const journal = state.journals[characterId];
	const existing = journal?.entries.find((e) => e.id === entryId);
	if (!journal || !existing) return null;
	const level = normalizeVisibilityLevel(visibility);
	const nextShared =
		level === 'shared'
			? [...new Set([ownerActorId, ...(sharedWith ?? existing.sharedWith)])]
			: [];
	const next: CharacterJournalEntry = {
		...existing,
		visibility: level,
		sharedWith: nextShared,
		updatedAt: now,
		revision: existing.revision + 1,
	};
	return withJournal(state, {
		...journal,
		entries: journal.entries.map((e) => (e.id === entryId ? next : e)),
	});
}

/** Remove an entry from a character's journal. Returns `null` when it does not exist. Pure. */
export function removeJournalEntry(
	state: CharacterJournalState,
	characterId: string,
	entryId: string,
): CharacterJournalState | null {
	const journal = state.journals[characterId];
	if (!journal || !journal.entries.some((e) => e.id === entryId)) return null;
	return withJournal(state, {
		...journal,
		entries: journal.entries.filter((e) => e.id !== entryId),
	});
}
