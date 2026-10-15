import type { ActorId } from './ids';
import type { VisibilityLevel } from '../permissions/visibility-filter';
import { normalizeVisibilityLevel } from '../permissions/visibility-filter';
import { singularGrantsOnEntity } from '../permissions/grant-records';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from '../commands/types';

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

/**
 * The categories a journal entry can be. A free `note` covers session highlights/anything else.
 * RC-ENG-8.12 — `rest`, `combat` and `level-up` are HISTORY kinds: the core appends them when the
 * event happens ({@link withCharacterHistory}); they are not authorable through
 * `character.add-journal-entry`, so a player cannot fabricate a level-up record.
 */
export type JournalEntryKind =
	| 'bookmark'
	| 'npc-impression'
	| 'personal-quest'
	| 'session-highlight'
	| 'note'
	| 'downtime'
	| HistoryEntryKind;

/** RC-ENG-8.12 — the journal kinds the core writes itself when a character event happens. */
export type HistoryEntryKind = 'rest' | 'combat' | 'level-up';

export const HISTORY_ENTRY_KINDS: readonly HistoryEntryKind[] = [
	'rest',
	'combat',
	'level-up',
] as const;

/** Automatic records cannot be re-authored by Journal Undo, so they cannot be deleted. */
export function isHistoryEntryKind(kind: string): kind is HistoryEntryKind {
	return HISTORY_ENTRY_KINDS.some((historyKind) => historyKind === kind);
}

export const JOURNAL_ENTRY_KINDS: readonly JournalEntryKind[] = [
	'bookmark',
	'npc-impression',
	'personal-quest',
	'session-highlight',
	'note',
	'downtime',
] as const;

/**
 * RC-CHR-2.2 — the structured fields a `downtime` entry carries on top of the common title/body:
 * the activity (e.g. "Crafting", "Carousing"), days spent, an optional cost, an optional outcome
 * narrative, and an optional link to another entry (typically a `note`) the activity produced.
 */
export interface DowntimeDetails {
	activityType: string;
	days: number;
	cost?: number;
	outcome?: string;
	linkedNoteId?: string;
}

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
	/** RC-CHR-2.2 — present only when `kind: 'downtime'`; the structured downtime fields. */
	downtime?: DowntimeDetails;
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
	/** RC-CHR-2.2 — required by the command layer when `kind: 'downtime'`. */
	downtime?: DowntimeDetails;
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
		visibility === 'shared' ? [...new Set([meta.ownerActorId, ...(input.sharedWith ?? [])])] : [];
	return {
		id: meta.id,
		kind: input.kind,
		title: input.title,
		body: input.body ?? '',
		visibility,
		sharedWith,
		...(input.kind === 'downtime' && input.downtime ? { downtime: input.downtime } : {}),
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
		level === 'shared' ? [...new Set([ownerActorId, ...(sharedWith ?? existing.sharedWith)])] : [];
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

/** Remove an authored entry. Returns `null` for absent or automatic history entries. Pure. */
export function removeJournalEntry(
	state: CharacterJournalState,
	characterId: string,
	entryId: string,
): CharacterJournalState | null {
	const journal = state.journals[characterId];
	const entry = journal?.entries.find((e) => e.id === entryId);
	if (!journal || !entry || isHistoryEntryKind(entry.kind)) return null;
	return withJournal(state, {
		...journal,
		entries: journal.entries.filter((e) => e.id !== entryId),
	});
}

// --- RC-ENG-8.12 — automatic history: rests, combats and level-ups ------------------------------

/**
 * One character event the history records: which character, which kind, and the (English) title and
 * body the entry carries. Built by the event's own module — `restHistoryRecords`
 * (`character-resources.ts`), `levelUpHistoryRecords` (`character-advancement.ts`) and
 * `combatHistoryRecords` (`combat-tracker.ts`) — from an ACCEPTED command result.
 */
export interface CharacterHistoryRecord {
	characterId: string;
	kind: HistoryEntryKind;
	title: string;
	body: string;
	/** The actor whose command caused the event (the entry's author). */
	actorId: ActorId;
}

/** Reads the history records an accepted command produced, from its next state and events. */
export type CharacterHistoryCollector = (
	nextState: CoreStateSlice,
	events: readonly CoreEvent[],
) => CharacterHistoryRecord[];

/**
 * The visibility a history entry gets, by the journal's own rules. It never says more than the
 * character does and never more than a hand-written entry would:
 *
 *   - a character with an owner gets the journal's fail-closed default — `shared` delivered to the
 *     owner — so the owner and the DM read it and no other player does (CHAR-016 AC1);
 *   - a `dm-only` character, or one nobody owns (a DM-run NPC or sidekick), gets `dm-only`, so only
 *     the DM reads it.
 *
 * `player-visible` is never chosen implicitly, matching {@link buildJournalEntry}. The owner or the DM
 * may widen an entry afterwards with `character.set-journal-entry-visibility`. Pure.
 */
export function historyEntryVisibility(
	characterVisibility: VisibilityLevel,
	ownerActorId: ActorId | null,
): VisibilityLevel {
	if (ownerActorId === null) return 'dm-only';
	return normalizeVisibilityLevel(characterVisibility) === 'dm-only' ? 'dm-only' : 'shared';
}

/**
 * Append the history entries an accepted command produced (RC-ENG-8.12). Each record becomes a dated
 * journal entry on its character, newest-first like every other entry, so it is read through the
 * actor-scoped journal query and filtered by the same per-entry visibility. A rejected result, or one
 * with no records, is returned untouched.
 *
 * No extra op is appended: the event's own op (`character.rest.*`, `character.commit-advancement`,
 * `combat.end`, …) is the durable record and the entry rides in the same state commit, so the sync
 * log gains no side entity. Each entry still emits `character.journal-changed` so cached journal views
 * are invalidated exactly as for a hand-written entry (CHAR-016 AC2).
 */
export function withCharacterHistory(
	env: CoreEnvironment,
	result: CommandResult,
	collect: CharacterHistoryCollector,
): CommandResult {
	if (result.status !== 'accepted') return result;
	const records = collect(result.nextState, result.events);
	if (records.length === 0) return result;
	const characters = result.nextState.characters;
	let journals = ensureCharacterJournalState(characters.journals);
	const events: CoreEvent[] = [];
	const now = env.clock();
	for (const record of records) {
		const character = characters.characters[record.characterId];
		if (!character) continue;
		const owner =
			singularGrantsOnEntity(
				result.nextState.permissions.grants,
				'character',
				record.characterId,
			)[0]?.playerActorId ?? null;
		const entry = buildJournalEntry(
			{
				kind: record.kind,
				title: record.title,
				body: record.body,
				visibility: historyEntryVisibility(character.visibility, owner),
			},
			{ id: env.ids(), ownerActorId: owner ?? record.actorId, authorActorId: record.actorId, now },
		);
		journals = addJournalEntry(journals, record.characterId, entry);
		events.push({
			kind: 'character.journal-changed',
			characterId: record.characterId,
			entryId: entry.id,
			visibility: entry.visibility,
			ownerActorId: owner,
			invalidatedActorIds: entry.visibility === 'shared' ? [...entry.sharedWith] : [],
			actorId: record.actorId,
		});
	}
	if (events.length === 0) return result;
	return {
		...result,
		nextState: { ...result.nextState, characters: { ...characters, journals } },
		events: [...result.events, ...events],
	};
}
