import Dexie, { type Table } from 'dexie';

/**
 * RC-CHR-4.1 — the PLAYER-PRIVATE device-local store (ADR-035, amending ADR-004/019).
 *
 * Everything a player writes here is theirs alone: private notes, private annotations on the things
 * the DM shared with them, and their running impressions of NPCs. None of it is table state, so none
 * of it may enter `CoreStateSlice`, the operation log, the replicated player snapshot, a cloud
 * backup, or an MCP read.
 *
 * The guarantee is STRUCTURAL, not a promise:
 *
 *  - the records live in their OWN Dexie database, `dndtools-private-<characterId>` — a different
 *    database from `dndtools-v2` (`coreStore.ts`), which is the only database the sync/backup and
 *    MCP paths know how to read. There is no code path that enumerates databases and ships them;
 *  - nothing in this module returns anything a command payload accepts, and the module is imported
 *    by exactly one screen (`screens/play/Journal.tsx`). `privateStore.test.ts` asserts that import
 *    allowlist mechanically, so a future edit that wires private records into `net/` replication or
 *    the MCP layer fails a test rather than leaking silently;
 *  - one database PER CHARACTER, because a shared device may seat two players in turn and neither
 *    should be able to open the other's notes by switching characters.
 *
 * Sharing is the explicit exception and never happens here: the player presses "Share with the DM",
 * the screen sends a `character.add-journal-entry` command REQUEST, and only that one entry's text
 * crosses to the table. The private record keeps a local `sharedAt` stamp so the screen can say the
 * DM has seen it; the stamp itself is still private.
 */

/** Schema version of one private database. Additive changes bump this and add a `version()` line. */
const PRIVATE_DB_VERSION = 1;

/** The database name for a character's private store. Exported so tests can assert the isolation. */
export function privateDatabaseName(characterId: string): string {
	return `dndtools-private-${characterId}`;
}

/** A free-form private note. The DM never sees these — there is no share affordance for a note. */
export interface PrivateNoteRecord {
	id: string;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}

/** What a bookmark points at. `id` is the SHARED thing's id; only the annotation is private. */
export type PrivateBookmarkTargetKind = 'journal-entry' | 'handout' | 'scene';

/** A private annotation pinned to something the DM shared. */
export interface PrivateBookmarkRecord {
	id: string;
	targetKind: PrivateBookmarkTargetKind;
	targetId: string;
	/** The shared thing's title, copied at bookmark time so the list still reads after a retitle. */
	targetTitle: string;
	annotation: string;
	createdAt: string;
	updatedAt: string;
}

/** A running private impression of an NPC, linked to the shared note the player read them in. */
export interface PrivateImpressionRecord {
	id: string;
	/** The shared note/handout this NPC was met in, or null when the player typed a bare name. */
	npcNoteId: string | null;
	npcName: string;
	body: string;
	/** ISO stamp of the moment this impression was shared with the DM; null while unshared. */
	sharedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

class PrivateDatabase extends Dexie {
	notes!: Table<PrivateNoteRecord, string>;
	bookmarks!: Table<PrivateBookmarkRecord, string>;
	impressions!: Table<PrivateImpressionRecord, string>;

	constructor(characterId: string) {
		super(privateDatabaseName(characterId));
		this.version(PRIVATE_DB_VERSION).stores({
			notes: '&id, updatedAt',
			bookmarks: '&id, targetId, updatedAt',
			impressions: '&id, npcNoteId, updatedAt',
		});
	}
}

// One open handle per character. A player switches characters rarely, so the map stays tiny; keeping
// the handle avoids re-opening (and re-running the version check) on every keystroke-driven save.
const openDatabases = new Map<string, PrivateDatabase>();

function db(characterId: string): PrivateDatabase {
	const key = requireCharacterId(characterId);
	let existing = openDatabases.get(key);
	if (!existing) {
		existing = new PrivateDatabase(key);
		openDatabases.set(key, existing);
	}
	return existing;
}

/**
 * Fail closed on a missing character id. Without this an empty id would open one shared
 * `dndtools-private-` database that every seat on the device could read — the exact leak the
 * per-character split exists to prevent.
 */
function requireCharacterId(characterId: string): string {
	const trimmed = typeof characterId === 'string' ? characterId.trim() : '';
	if (trimmed.length === 0) {
		throw new Error('Private notes need a character. No private store was opened.');
	}
	return trimmed;
}

/** A local, non-cryptographic id. Private records never leave the device, so uniqueness is enough. */
function privateRecordId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
	return new Date().toISOString();
}

// --- notes ---------------------------------------------------------------------------------------

/** Every private note for a character, newest edit first. */
export async function listPrivateNotes(characterId: string): Promise<PrivateNoteRecord[]> {
	const rows = await db(characterId).notes.toArray();
	return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Create a private note and return the stored record. */
export async function addPrivateNote(
	characterId: string,
	draft: { title: string; body: string },
): Promise<PrivateNoteRecord> {
	const stamp = now();
	const record: PrivateNoteRecord = {
		id: privateRecordId('note'),
		title: draft.title.trim(),
		body: draft.body,
		createdAt: stamp,
		updatedAt: stamp,
	};
	await db(characterId).notes.put(record);
	return record;
}

/** Edit a private note. Returns the updated record, or null when the note is already gone. */
export async function updatePrivateNote(
	characterId: string,
	id: string,
	patch: { title?: string; body?: string },
): Promise<PrivateNoteRecord | null> {
	const table = db(characterId).notes;
	const existing = await table.get(id);
	if (!existing) return null;
	const record: PrivateNoteRecord = {
		...existing,
		...(patch.title === undefined ? {} : { title: patch.title.trim() }),
		...(patch.body === undefined ? {} : { body: patch.body }),
		updatedAt: now(),
	};
	await table.put(record);
	return record;
}

/** Delete a private note. Deleting is local and final — nothing was ever replicated to undo. */
export async function removePrivateNote(characterId: string, id: string): Promise<void> {
	await db(characterId).notes.delete(id);
}

// --- bookmarks -----------------------------------------------------------------------------------

/** Every bookmark for a character, newest edit first. */
export async function listPrivateBookmarks(characterId: string): Promise<PrivateBookmarkRecord[]> {
	const rows = await db(characterId).bookmarks.toArray();
	return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Bookmark a shared thing with a private annotation. One bookmark per target: re-bookmarking the
 * same entry rewrites its annotation instead of stacking duplicates in the list.
 */
export async function putPrivateBookmark(
	characterId: string,
	draft: {
		targetKind: PrivateBookmarkTargetKind;
		targetId: string;
		targetTitle: string;
		annotation: string;
	},
): Promise<PrivateBookmarkRecord> {
	const table = db(characterId).bookmarks;
	const existing = (await table.toArray()).find(
		(row) => row.targetId === draft.targetId && row.targetKind === draft.targetKind,
	);
	const stamp = now();
	const record: PrivateBookmarkRecord = {
		id: existing?.id ?? privateRecordId('bookmark'),
		targetKind: draft.targetKind,
		targetId: draft.targetId,
		targetTitle: draft.targetTitle,
		annotation: draft.annotation,
		createdAt: existing?.createdAt ?? stamp,
		updatedAt: stamp,
	};
	await table.put(record);
	return record;
}

/** Remove a bookmark. The shared thing it pointed at is untouched. */
export async function removePrivateBookmark(characterId: string, id: string): Promise<void> {
	await db(characterId).bookmarks.delete(id);
}

// --- NPC impressions -----------------------------------------------------------------------------

/** Every NPC impression for a character, newest edit first. */
export async function listPrivateImpressions(
	characterId: string,
): Promise<PrivateImpressionRecord[]> {
	const rows = await db(characterId).impressions.toArray();
	return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Write an impression of an NPC. Editing an impression that was already shared CLEARS `sharedAt`:
 * the DM holds the text as it was sent, so claiming the new text is shared would be a false success.
 */
export async function putPrivateImpression(
	characterId: string,
	draft: { id?: string; npcNoteId: string | null; npcName: string; body: string },
): Promise<PrivateImpressionRecord> {
	const table = db(characterId).impressions;
	const existing = draft.id ? ((await table.get(draft.id)) ?? null) : null;
	const stamp = now();
	const record: PrivateImpressionRecord = {
		id: existing?.id ?? privateRecordId('impression'),
		npcNoteId: draft.npcNoteId,
		npcName: draft.npcName.trim(),
		body: draft.body,
		sharedAt: existing && existing.body === draft.body ? existing.sharedAt : null,
		createdAt: existing?.createdAt ?? stamp,
		updatedAt: stamp,
	};
	await table.put(record);
	return record;
}

/**
 * Record that this impression's text reached the DM. Called only AFTER the command request was
 * accepted, so the screen never shows "shared" for a request the table declined.
 */
export async function markImpressionShared(
	characterId: string,
	id: string,
): Promise<PrivateImpressionRecord | null> {
	const table = db(characterId).impressions;
	const existing = await table.get(id);
	if (!existing) return null;
	const record: PrivateImpressionRecord = { ...existing, sharedAt: now() };
	await table.put(record);
	return record;
}

/** Delete an impression. A previously shared copy stays in the character's journal at the table. */
export async function removePrivateImpression(characterId: string, id: string): Promise<void> {
	await db(characterId).impressions.delete(id);
}

// --- lifecycle -----------------------------------------------------------------------------------

/**
 * Erase a character's private store entirely — the "forget my notes on this device" path, and the
 * reset every test needs. Deletes the whole database rather than clearing tables, so nothing about
 * the shape of what was there survives.
 */
export async function resetPrivateStore(characterId: string): Promise<void> {
	const key = requireCharacterId(characterId);
	const existing = openDatabases.get(key);
	if (existing) {
		existing.close();
		openDatabases.delete(key);
	}
	await Dexie.delete(privateDatabaseName(key));
}

/** Close the open handles without deleting anything (leaving the device, switching seats). */
export function closePrivateStores(): void {
	for (const handle of openDatabases.values()) handle.close();
	openDatabases.clear();
}
