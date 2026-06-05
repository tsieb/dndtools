/**
 * SYNC-003 / SYNC-005 / ADR-014 — the IN-MEMORY / FAKE transport the source adapters read and write
 * through.
 *
 * Per ADR-014 the LIVE transports (real filesystem / Obsidian vault / Google Drive network) are
 * DEFERRED. The adapters are the seam a real transport plugs into later; this module is the fake the
 * adapters are EXERCISED over so their pure transform + capability + state logic is fully testable
 * without any I/O. It is a deterministic, plain-data store with NO DOM/Node/Svelte/network and NO
 * clock — callers supply timestamps. A real transport later implements the SAME shapes (a vault file
 * map for Obsidian; a Drive file/change/revision store for Google Docs) without changing adapter code.
 */

/** A single Obsidian-style vault file: a vault-relative path + its raw markdown text. */
export interface FakeVaultFile {
	path: string;
	text: string;
}

/**
 * The fake OBSIDIAN/local-vault transport: a path → text map. Reads/writes are deterministic and
 * pure (a new map is returned on a write — the input is never mutated), mirroring the staged-commit
 * discipline the import path uses.
 */
export interface FakeVaultTransport {
	files: Readonly<Record<string, string>>;
}

export function createFakeVaultTransport(files: readonly FakeVaultFile[] = []): FakeVaultTransport {
	const map: Record<string, string> = {};
	for (const file of files) map[file.path] = file.text;
	return { files: Object.freeze(map) };
}

export function readVaultFile(transport: FakeVaultTransport, path: string): string | null {
	return Object.prototype.hasOwnProperty.call(transport.files, path) ? transport.files[path]! : null;
}

export function writeVaultFile(
	transport: FakeVaultTransport,
	path: string,
	text: string,
): FakeVaultTransport {
	return { files: Object.freeze({ ...transport.files, [path]: text }) };
}

export function deleteVaultFile(transport: FakeVaultTransport, path: string): FakeVaultTransport {
	if (!Object.prototype.hasOwnProperty.call(transport.files, path)) return transport;
	const next = { ...transport.files };
	delete next[path];
	return { files: Object.freeze(next) };
}

// --- Google Drive fake transport (SYNC-005 / SYNC-016) -------------------------------------------

/**
 * A fake Drive FILE: tracks the Drive FILE ID, current NAME (renames change this, not the id), its
 * exported markdown content, the current REVISION metadata, whether it was deleted/trashed, and the
 * unsupported-formatting present in the source doc (so an export transform can report fidelity loss).
 */
export interface FakeDriveFile {
	/** Stable Drive file id (survives a rename — identity is by id, never name). */
	fileId: string;
	/** Current display name; a rename changes this while the id is stable. */
	name: string;
	/** The Drive revision id at the current state. */
	revisionId: string;
	/** The markdown content exported from the doc. */
	markdown: string;
	/** Whether the file was deleted/trashed remotely. */
	deleted: boolean;
	/**
	 * Source-doc formatting that cannot map cleanly to markdown (e.g. `comment`, `suggestion`,
	 * `equation`, `drawing`). Carried so the export transform reports the loss explicitly (never drops
	 * it silently). Pure metadata; no real Drive payload.
	 */
	unsupportedFormatting: readonly string[];
}

/** One entry in the Drive CHANGES feed: a changed/removed file plus the page cursor it belongs to. */
export interface FakeDriveChange {
	fileId: string;
	/** `change` ⇒ the file metadata/content changed; `remove` ⇒ the file was deleted/trashed. */
	kind: 'change' | 'remove';
	/** The new name when the change is a rename (else unchanged). */
	name?: string;
	revisionId?: string;
}

/**
 * The fake DRIVE transport: a file store keyed by file id, an incremental CHANGES feed keyed by an
 * opaque page TOKEN, and the start page token. A real Drive client implements the same surface; the
 * adapter reads files/changes/revisions through these accessors only.
 */
export interface FakeDriveTransport {
	files: Readonly<Record<string, FakeDriveFile>>;
	/** Change batches keyed by the page token that returns them. */
	changesByToken: Readonly<Record<string, { changes: readonly FakeDriveChange[]; nextToken: string | null }>>;
	/** The token a fresh incremental pull starts from. */
	startPageToken: string;
}

export function createFakeDriveTransport(input: {
	files?: readonly FakeDriveFile[];
	changesByToken?: Record<string, { changes: readonly FakeDriveChange[]; nextToken: string | null }>;
	startPageToken: string;
}): FakeDriveTransport {
	const files: Record<string, FakeDriveFile> = {};
	for (const file of input.files ?? []) files[file.fileId] = file;
	return {
		files: Object.freeze(files),
		changesByToken: Object.freeze({ ...(input.changesByToken ?? {}) }),
		startPageToken: input.startPageToken,
	};
}

export function readDriveFile(transport: FakeDriveTransport, fileId: string): FakeDriveFile | null {
	return Object.prototype.hasOwnProperty.call(transport.files, fileId)
		? transport.files[fileId]!
		: null;
}

/**
 * Read the change batch at a page token. Returns the changes plus the NEXT token (null when the feed is
 * caught up). An unknown token returns an empty caught-up batch (fail safe — never throws).
 */
export function readDriveChanges(
	transport: FakeDriveTransport,
	token: string,
): { changes: readonly FakeDriveChange[]; nextToken: string | null } {
	return (
		transport.changesByToken[token] ?? { changes: [], nextToken: null }
	);
}

export function writeDriveFile(
	transport: FakeDriveTransport,
	file: FakeDriveFile,
): FakeDriveTransport {
	return {
		...transport,
		files: Object.freeze({ ...transport.files, [file.fileId]: file }),
	};
}
