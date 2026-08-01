import type { SyncOperation } from './operation-log';
import {
	type AdapterTransformContext,
	type ExternalMutation,
	type SourceAdapterCapability,
	type SyncSourceAdapter,
	type SyncSourceLifecycleState,
	buildCanonicalOperation,
} from './source-adapters';
import type { PlatformProfileId } from '../state/widget-package-state';
import {
	type FakeDriveFile,
	type FakeDriveTransport,
	readDriveChanges,
	readDriveFile,
	writeDriveFile,
} from './source-transport';
import { CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import type { ContentNoteFeature } from '../state/content-constraints';

/**
 * SYNC-005 / SYNC-012 / SYNC-016 — the GOOGLE DOCS sync adapter LOGIC, over a FAKE Drive transport.
 *
 * Per ADR-014 the live Drive network is DEFERRED; this models the adapter behavior over the in-memory
 * `FakeDriveTransport`. It TRACKS the dimensions SYNC-005 names — Drive FILE IDS, change PAGE TOKENS,
 * REVISION METADATA, EXPORT/IMPORT TRANSFORMS, and UNSUPPORTED FORMATTING LOSS — and handles SYNC-016's
 * cases (AUTHORIZATION, RENAME, DELETION, OFFLINE QUEUED EDITS, UNSUPPORTED FORMATTING, CONFLICT) as
 * EXPLICIT typed sync states, never silent failures. It REUSES the content-constraint lossy descriptors:
 * Google Docs is the constrained rich-text target where front matter / wikilinks / aliases are dropped
 * and inline #tags survive as text but lose tag semantics.
 *
 * Pure Processing-Core policy: deterministic over (transport, cursor, op, context). It emits canonical
 * {@link SyncOperation}s only, so it plugs in without a core-contract change (SYNC-003).
 */

export const GOOGLE_DOCS_SOURCE_KIND = 'google-docs' as const;

/**
 * SYNC-015 — the Google Docs adapter's declared CAPABILITY metadata, reusing the constrained
 * `content-constraints.ts` feature classification: it CANNOT represent markdown front matter,
 * wikilinks, aliases, or Lamplight metadata as structured data (`unsupported`), and inline-tag TEXT
 * survives but loses tag semantics (`lossy`). It needs OAuth (network for first-time auth), exposes
 * Drive revision history + a change cursor, and offers `cached` offline availability.
 */
export const GOOGLE_DOCS_ADAPTER_CAPABILITY: SourceAdapterCapability = Object.freeze({
	kind: GOOGLE_DOCS_SOURCE_KIND,
	displayName: 'Google Docs',
	summary:
		'Rich-text Google Doc. It cannot represent front matter, wikilinks, aliases, or Lamplight metadata as structured data — these are dropped on a destructive write-back. Inline #tag text survives but loses its tag semantics. Tracks Drive file ids, change page tokens, and revision metadata.',
	supportedSchemaVersions: Object.freeze([1]),
	// The Drive API/export-format versions this adapter understands.
	supportedSourceVersions: Object.freeze(['v3']),
	supportedAuthModes: Object.freeze(['oauth']),
	supportedEntityTypes: Object.freeze([CONTENT_ITEM_ENTITY_TYPE]),
	canRead: true,
	canWrite: true,
	canRename: false,
	canDelete: true,
	canExposeRevisionHistory: true,
	canWatchChanges: true,
	offlineAvailability: 'cached',
	// Google Docs is cloud-accessible: all platform profiles can connect (subject to auth).
	supportedPlatformProfiles: Object.freeze(['desktop', 'tablet', 'mobile', 'web'] as PlatformProfileId[]),
	featureSupport: Object.freeze({
		'frontmatter-properties': 'unsupported',
		aliases: 'unsupported',
		tags: 'unsupported',
		'inline-tags': 'lossy',
		wikilinks: 'unsupported',
		'dndtools-namespaced-metadata': 'unsupported',
	}),
});

/** A stable, file-id-keyed canonical entity id for a Drive file (survives a rename — identity by id). */
export function googleDocsEntityIdForFile(fileId: string): string {
	return `gdoc-${fileId}`;
}

/** A deterministic op id (no entropy — replayable + idempotent). */
function googleDocsOperationId(
	sourceId: string,
	entityId: string,
	opType: string,
	issuedAt: string,
): string {
	return `op-gdocs-${sourceId}-${entityId}-${opType}-${issuedAt}`;
}

/**
 * The canonical note value a Drive file IMPORTS to. It records the tracked Drive metadata (file id,
 * name, revision id) plus the markdown body and — critically — the UNSUPPORTED FORMATTING the source
 * doc carried, so the import transform REPORTS the loss rather than silently dropping it (SYNC-005 AC2).
 */
export interface GoogleDocsCanonicalNote {
	fileId: string;
	name: string;
	revisionId: string;
	body: string;
	/** Source-doc formatting that could not map cleanly to markdown (reported, never silently lost). */
	unsupportedFormatting: string[];
}

/** The IMPORT-transform result: the canonical note + the explicit formatting-loss diagnostic. */
export interface GoogleDocsImportTransform {
	note: GoogleDocsCanonicalNote;
	/** True when the source doc carried formatting that does not map cleanly (a doc-level loss). */
	hasFormattingLoss: boolean;
	/** A generic, non-leaking description of the loss (names the formatting kinds, not content). */
	lossDiagnostic: string | null;
}

/**
 * SYNC-005 — the IMPORT (export-from-Drive) transform: map a Drive file to a canonical note, carrying
 * its tracked metadata and reporting any unsupported formatting as an explicit loss diagnostic. Pure.
 */
export function googleDocsFileToCanonicalNote(file: FakeDriveFile): GoogleDocsImportTransform {
	const note: GoogleDocsCanonicalNote = {
		fileId: file.fileId,
		name: file.name,
		revisionId: file.revisionId,
		body: file.markdown,
		unsupportedFormatting: [...file.unsupportedFormatting],
	};
	const hasFormattingLoss = file.unsupportedFormatting.length > 0;
	return {
		note,
		hasFormattingLoss,
		lossDiagnostic: hasFormattingLoss
			? `The Google Doc contains ${file.unsupportedFormatting.length} formatting element(s) that do not map cleanly to markdown (${file.unsupportedFormatting.join(', ')}); they are reported and not silently dropped.`
			: null,
	};
}

/**
 * SYNC-005 — the EXPORT (import-to-Drive) transform: map a canonical note body to a Drive file payload.
 * The structured markdown features Google Docs cannot represent are dropped per the capability
 * descriptor — the fail-closed push gate (in `commands`) blocks this unless acknowledged. Pure.
 */
export function canonicalNoteToGoogleDocsFile(
	note: GoogleDocsCanonicalNote,
): FakeDriveFile {
	return {
		fileId: note.fileId,
		name: note.name,
		revisionId: note.revisionId,
		markdown: note.body,
		deleted: false,
		unsupportedFormatting: [...note.unsupportedFormatting],
	};
}

/**
 * Which note features are PRESENT in a markdown body (for the fail-closed transform gate). Mirrors the
 * detection the content-constraint check performs. The presence patterns are NON-global so `.test()` is
 * stateless and deterministic across calls (a `/g` regex's `lastIndex` would otherwise alternate).
 */
const INLINE_TAG_PRESENCE = /(^|\s)#[A-Za-z][\w/-]*/;
const WIKILINK_PRESENCE = /\[\[[^\]]+?\]\]/;
const FRONTMATTER_PRESENCE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function googleDocsPresentFeatures(body: string): ContentNoteFeature[] {
	const features: ContentNoteFeature[] = [];
	if (FRONTMATTER_PRESENCE.test(body)) features.push('frontmatter-properties');
	if (WIKILINK_PRESENCE.test(body)) features.push('wikilinks');
	if (INLINE_TAG_PRESENCE.test(body)) features.push('inline-tags');
	return features;
}

/**
 * The result of a PULL through the changes feed: the canonical ops produced, the NEXT page cursor to
 * store for the next incremental pull, the explicit per-file states (rename/delete/loss), and the
 * doc-level formatting-loss diagnostics. SYNC-005 AC1: the new cursor is stored for future sync.
 */
export interface GoogleDocsPullResult {
	operations: SyncOperation[];
	/** The change page token to persist for the next incremental pull (SYNC-005 AC1). */
	nextCursor: string;
	/** Per-file explicit states encountered in this pull (rename/delete/conflict/loss). */
	fileStates: GoogleDocsFileState[];
}

export interface GoogleDocsFileState {
	fileId: string;
	entityId: string;
	state: Extract<SyncSourceLifecycleState, 'idle' | 'renamed-remote' | 'deleted-remote' | 'conflict'>;
	/** Generic, non-leaking explanation. */
	message: string;
	/** The Drive revision id observed (when available). */
	revisionId: string | null;
	/** True when this pulled file carried unsupported formatting (reported, never dropped). */
	hasFormattingLoss: boolean;
}

/**
 * SYNC-005 / SYNC-012 / SYNC-016 — PULL incremental changes from the Drive changes feed starting at a
 * stored cursor. For each change it emits a canonical op (an import for a change, a delete for a remove)
 * and records the EXPLICIT state: a rename (id preserved, name updated), a delete (delete intent, never a
 * silent resurrection), or a normal change. It walks the feed to the end and returns the NEXT cursor to
 * persist (SYNC-005 AC1). Pure + deterministic over the transport and the supplied issue time.
 */
export function pullGoogleDocsChanges(
	adapter: SyncSourceAdapter<FakeDriveFile>,
	transport: FakeDriveTransport,
	cursor: string,
	context: AdapterTransformContext,
): GoogleDocsPullResult {
	const operations: SyncOperation[] = [];
	const fileStates: GoogleDocsFileState[] = [];
	let token: string | null = cursor;
	let nextCursor = cursor;
	// Walk every change page to the end. The fake feed is finite; a real client paginates the same way.
	const visited = new Set<string>();
	while (token !== null && !visited.has(token)) {
		visited.add(token);
		const batch = readDriveChanges(transport, token);
		for (const change of batch.changes) {
			const entityId = googleDocsEntityIdForFile(change.fileId);
			if (change.kind === 'remove') {
				operations.push(
					buildCanonicalOperation({
						id: googleDocsOperationId(adapter.sourceId, entityId, 'delete', context.issuedAt),
						vaultId: context.vaultId,
						sourceId: adapter.sourceId,
						actorId: context.actorId,
						entityType: CONTENT_ITEM_ENTITY_TYPE,
						entityId,
						opType: 'content.delete-from-google-docs',
						path: `content/items/${entityId}`,
						value: { fileId: change.fileId, reason: 'deleted-remote' },
						issuedAt: context.issuedAt,
					}),
				);
				fileStates.push({
					fileId: change.fileId,
					entityId,
					state: 'deleted-remote',
					message:
						'The Google Doc was deleted remotely. A delete intent is recorded; deleted content is never silently resurrected.',
					revisionId: change.revisionId ?? null,
					hasFormattingLoss: false,
				});
				continue;
			}
			const file = readDriveFile(transport, change.fileId);
			if (!file || file.deleted) {
				// A change whose file is gone is treated as a delete (fail safe).
				fileStates.push({
					fileId: change.fileId,
					entityId,
					state: 'deleted-remote',
					message: 'The changed Google Doc is no longer readable; a delete intent is recorded.',
					revisionId: change.revisionId ?? null,
					hasFormattingLoss: false,
				});
				continue;
			}
			const transform = googleDocsFileToCanonicalNote(file);
			// A rename is signalled by the change carrying a `name` that differs from the file's prior
			// name. Identity is keyed by the stable Drive file id, so a rename never forks the entity.
			const renamed = change.name !== undefined && change.name !== file.name;
			operations.push(...adapter.toCanonical(file, context));
			fileStates.push({
				fileId: change.fileId,
				entityId,
				state: renamed ? 'renamed-remote' : 'idle',
				message: renamed
					? 'The Google Doc was renamed remotely. Local identity is preserved by Drive file id; the name is updated.'
					: transform.hasFormattingLoss
						? (transform.lossDiagnostic ?? 'Pulled with reported formatting loss.')
						: 'Pulled successfully.',
				revisionId: file.revisionId,
				hasFormattingLoss: transform.hasFormattingLoss,
			});
		}
		nextCursor = batch.nextToken ?? token;
		token = batch.nextToken;
	}
	return { operations, nextCursor, fileStates };
}

/**
 * SYNC-012 — PUSH a canonical op back to the Drive transport, returning the new transport (staged
 * commit — input never mutated). A delete op marks the file deleted; a write op upserts the file. The
 * fail-closed lossy gate is enforced by the capability check BEFORE the op is built; this applies an
 * already-validated op.
 */
export function pushGoogleDocsOperation(
	adapter: SyncSourceAdapter<FakeDriveFile>,
	transport: FakeDriveTransport,
	operation: SyncOperation,
): FakeDriveTransport {
	let next = transport;
	for (const mutation of adapter.fromCanonical(operation)) {
		if (mutation.op === 'delete') {
			const existing = readDriveFile(next, mutation.externalId);
			if (existing) next = writeDriveFile(next, { ...existing, deleted: true });
		} else if (mutation.op === 'write' && mutation.entity) {
			next = writeDriveFile(next, mutation.entity);
		}
	}
	return next;
}

/**
 * SYNC-016 — the CONFLICT record an offline-queued local edit raises against a diverged remote revision.
 * It carries the LOCAL markdown, the REMOTE revision metadata, the unsupported-format diagnostics, and
 * the safe RESOLUTION actions — never a silent overwrite. This is the explicit `conflict` state's payload.
 */
export interface GoogleDocsConflict {
	entityId: string;
	fileId: string;
	reason: 'source-revision-diverged' | 'delete-vs-update';
	/** The local markdown the queued offline edit would write. */
	localMarkdown: string;
	/** The remote revision id the local edit diverged from. */
	remoteRevisionId: string;
	/** The base revision the local edit started from (where known). */
	baseRevisionId: string | null;
	/** Unsupported-format diagnostics from the remote doc (reported, never lost). */
	unsupportedFormatting: string[];
	/** Safe resolution actions a DM can take (never an auto-overwrite). */
	resolutionActions: readonly ('keep-local' | 'keep-remote' | 'keep-both')[];
}

/**
 * SYNC-016 — detect whether a queued offline edit CONFLICTS with the current remote revision. A conflict
 * exists when the remote revision id has moved past the base the local edit started from (a divergence),
 * OR the remote file was deleted while a local edit is queued (delete-vs-update). Returns the explicit
 * conflict record, or null when the queued edit can be pushed idempotently. Pure.
 */
export function detectGoogleDocsConflict(input: {
	transport: FakeDriveTransport;
	fileId: string;
	localMarkdown: string;
	/** The remote revision the local edit was based on. */
	baseRevisionId: string;
}): GoogleDocsConflict | null {
	const entityId = googleDocsEntityIdForFile(input.fileId);
	const file = readDriveFile(input.transport, input.fileId);
	if (!file || file.deleted) {
		return {
			entityId,
			fileId: input.fileId,
			reason: 'delete-vs-update',
			localMarkdown: input.localMarkdown,
			remoteRevisionId: file?.revisionId ?? 'deleted',
			baseRevisionId: input.baseRevisionId,
			unsupportedFormatting: file ? [...file.unsupportedFormatting] : [],
			resolutionActions: ['keep-local', 'keep-remote', 'keep-both'],
		};
	}
	if (file.revisionId !== input.baseRevisionId) {
		return {
			entityId,
			fileId: input.fileId,
			reason: 'source-revision-diverged',
			localMarkdown: input.localMarkdown,
			remoteRevisionId: file.revisionId,
			baseRevisionId: input.baseRevisionId,
			unsupportedFormatting: [...file.unsupportedFormatting],
			resolutionActions: ['keep-local', 'keep-remote', 'keep-both'],
		};
	}
	return null;
}

/**
 * The GOOGLE DOCS adapter instance, bound to a source id + injected via the fake Drive transport. The
 * transforms are pure; reads/writes flow through the transport accessors only.
 */
export function createGoogleDocsAdapter(
	sourceId: string,
): SyncSourceAdapter<FakeDriveFile> {
	return {
		sourceId,
		kind: GOOGLE_DOCS_SOURCE_KIND,
		capabilities: () => GOOGLE_DOCS_ADAPTER_CAPABILITY,
		toCanonical(file, context: AdapterTransformContext): SyncOperation[] {
			const transform = googleDocsFileToCanonicalNote(file);
			const entityId = googleDocsEntityIdForFile(file.fileId);
			return [
				buildCanonicalOperation({
					id: googleDocsOperationId(sourceId, entityId, 'import', context.issuedAt),
					vaultId: context.vaultId,
					sourceId,
					actorId: context.actorId,
					entityType: CONTENT_ITEM_ENTITY_TYPE,
					entityId,
					opType: 'content.import-from-google-docs',
					path: `content/items/${entityId}`,
					value: {
						note: transform.note,
						hasFormattingLoss: transform.hasFormattingLoss,
						lossDiagnostic: transform.lossDiagnostic,
					},
					...(context.dependencies ? { dependencies: context.dependencies } : {}),
					issuedAt: context.issuedAt,
				}),
			];
		},
		fromCanonical(operation: SyncOperation): ExternalMutation<FakeDriveFile>[] {
			const value = (operation.value ?? {}) as {
				note?: GoogleDocsCanonicalNote;
				fileId?: unknown;
			};
			if (operation.opType.endsWith('delete') || operation.opType.endsWith('delete-from-google-docs')) {
				const fileId = typeof value.fileId === 'string' ? value.fileId : entityIdToFileId(operation.entityId);
				return [{ op: 'delete', externalId: fileId }];
			}
			const note = value.note;
			if (!note) return [];
			return [{ op: 'write', externalId: note.fileId, entity: canonicalNoteToGoogleDocsFile(note) }];
		},
	};
}

/** Recover a Drive file id from a `gdoc-<fileId>` entity id (the inverse of `googleDocsEntityIdForFile`). */
function entityIdToFileId(entityId: string): string {
	return entityId.startsWith('gdoc-') ? entityId.slice('gdoc-'.length) : entityId;
}
