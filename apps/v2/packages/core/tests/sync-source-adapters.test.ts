import { describe, expect, it } from 'vitest';
import {
	ADAPTER_CANONICAL_SCHEMA_VERSION,
	GOOGLE_DOCS_ADAPTER_CAPABILITY,
	GOOGLE_DOCS_SOURCE_KIND,
	LOCAL_VAULT_ADAPTER_CAPABILITY,
	OBSIDIAN_ADAPTER_CAPABILITY,
	OBSIDIAN_SOURCE_KIND,
	REGISTERED_SOURCE_KINDS,
	SYNC_OPERATION_SCHEMA_VERSION,
	adapterEmitsCanonicalOperations,
	advanceSourceCursor,
	assertAdapterEmitsCanonicalOperations,
	canonicalNoteToObsidianFile,
	capabilityForSourceKind,
	checkAuthModeSupported,
	checkSchemaVersionSupported,
	checkSourceVersionSupported,
	createFakeDriveTransport,
	createFakeVaultTransport,
	createGoogleDocsAdapter,
	createObsidianAdapter,
	deriveAuthorizationState,
	detectGoogleDocsConflict,
	extractHeadings,
	extractMarkdownLinks,
	googleDocsEntityIdForFile,
	listSourceAdapterCapabilities,
	listSourceAdapterCapabilitySummaries,
	obsidianFileToCanonicalNote,
	obsidianPresentFeatures,
	preflightSourceAdapter,
	pullGoogleDocsChanges,
	pullObsidianNote,
	pushGoogleDocsOperation,
	pushObsidianOperation,
	readDriveFile,
	readVaultFile,
	validateRegisteredSourceAdapters,
	validateSourceAdapterCapability,
	type AdapterTransformContext,
	type FakeDriveFile,
	type SourceAdapterCapability,
	type SourceCursorRecord,
	type SyncOperation,
} from '../src';
import { validateSyncOperationShape } from '../src/sync/operation-model';

/**
 * SYNC-003 / SYNC-004 / SYNC-005 / SYNC-012 / SYNC-015 / SYNC-016 — the SOURCE ADAPTER epic.
 *
 * Tests are the primary evidence:
 *   - SYNC-003: an adapter plugs in WITHOUT changing any core command/reducer contract — every op it
 *     emits passes the SAME canonical-shape conformance guard the in-process commands satisfy.
 *   - SYNC-004: the Obsidian round-trip preserves YAML properties, tags, aliases, [[wikilinks]],
 *     markdown links, headings, and user frontmatter, and ISOLATES DND Tools metadata under dndtools.*.
 *   - SYNC-005/016: the Google Docs adapter tracks file ids/cursors/revisions, reports unsupported
 *     formatting loss, and surfaces auth/rename/delete/offline-queue/conflict as EXPLICIT sync states.
 *   - SYNC-012: both pull and push are proven across notes, properties, links, headings, revisions, and
 *     unsupported formatting (round-trip over the fake transport).
 *   - SYNC-015: every adapter declares capability metadata and fails closed on an unsupported schema
 *     version, source version, auth mode, entity type, or lossy transform.
 */

const context: AdapterTransformContext = {
	vaultId: 'vault-1',
	actorId: 'actor-dm',
	issuedAt: '2026-06-05T00:00:00.000Z',
};

// ---------------------------------------------------------------------------------------------------
// SYNC-003 — adapter interface; no core-contract change
// ---------------------------------------------------------------------------------------------------

describe('SYNC-003 adapter interface plugs in without a core-contract change', () => {
	it('the Obsidian adapter emits ops that pass the SAME canonical conformance guard as commands', () => {
		const adapter = createObsidianAdapter('obsidian-vault-a');
		const ops = adapter.toCanonical(
			{ path: 'lore/Highmoor.md', text: '---\naliases: [Keep]\n---\n# Highmoor\nA keep.' },
			context,
		);
		expect(ops).toHaveLength(1);
		// The op passes the exact structural guard every durable command op is asserted against.
		for (const op of ops) {
			expect(validateSyncOperationShape(op).conformant).toBe(true);
		}
		expect(adapterEmitsCanonicalOperations(ops)).toBe(true);
		expect(() => assertAdapterEmitsCanonicalOperations(ops)).not.toThrow();
		// The op carries the single supported canonical schema version — no new op shape.
		expect(ops[0]!.schemaVersion).toBe(SYNC_OPERATION_SCHEMA_VERSION);
		expect(ADAPTER_CANONICAL_SCHEMA_VERSION).toBe(SYNC_OPERATION_SCHEMA_VERSION);
	});

	it('the Google Docs adapter emits ops that pass the SAME canonical conformance guard', () => {
		const adapter = createGoogleDocsAdapter('gdocs-a');
		const file: FakeDriveFile = {
			fileId: 'file-1',
			name: 'Quest',
			revisionId: 'rev-1',
			markdown: '# Quest\nFind the relic.',
			deleted: false,
			unsupportedFormatting: [],
		};
		const ops = adapter.toCanonical(file, context);
		expect(adapterEmitsCanonicalOperations(ops)).toBe(true);
		expect(() => assertAdapterEmitsCanonicalOperations(ops)).not.toThrow();
	});

	it('a future adapter conforms via the same interface and op shape (no new command/reducer)', () => {
		// A minimal hand-rolled "future source" adapter that only implements the interface. It needs NO
		// core change: it just emits canonical ops. This proves SYNC-003's "future source" rule.
		const futureAdapter = {
			sourceId: 'future-source-1',
			kind: 'future-source' as const,
			capabilities: (): SourceAdapterCapability => ({
				kind: 'future-source',
				displayName: 'Future source',
				summary: 'A hypothetical future source.',
				supportedSchemaVersions: [SYNC_OPERATION_SCHEMA_VERSION],
				supportedSourceVersions: ['1'],
				supportedAuthModes: ['none'],
				supportedEntityTypes: ['content-item'],
				canRead: true,
				canWrite: false,
				canExposeRevisionHistory: false,
				canWatchChanges: false,
				offlineAvailability: 'full',
				featureSupport: { 'frontmatter-properties': 'supported' },
			}),
			toCanonical: (_entity: unknown, ctx: AdapterTransformContext): SyncOperation[] => [
				{
					id: `op-future-${ctx.issuedAt}`,
					vaultId: ctx.vaultId,
					sourceId: 'future-source-1',
					actorId: ctx.actorId,
					entityType: 'content-item',
					entityId: 'future-note',
					opType: 'content.import-from-future',
					dependencies: [],
					issuedAt: ctx.issuedAt,
					schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
				},
			],
			fromCanonical: () => [],
		};
		const ops = futureAdapter.toCanonical(null, context);
		expect(() => assertAdapterEmitsCanonicalOperations(ops)).not.toThrow();
	});

	it('a malformed adapter op fails closed at the conformance guard', () => {
		const bad = [{ id: '', vaultId: 'v', sourceId: 's' } as unknown as SyncOperation];
		expect(adapterEmitsCanonicalOperations(bad)).toBe(false);
		expect(() => assertAdapterEmitsCanonicalOperations(bad)).toThrow(/canonical/i);
	});
});

// ---------------------------------------------------------------------------------------------------
// SYNC-004 — Obsidian round-trip preservation + dndtools.* namespacing
// ---------------------------------------------------------------------------------------------------

describe('SYNC-004 Obsidian round-trip preserves user content and isolates DND metadata', () => {
	const source = [
		'---',
		'aliases: [The Keep, Highmoor Keep]',
		'tags: [location, fortress]',
		'author: Trent',
		'status: draft',
		'dndtools.visibility: dm-only',
		'---',
		'# Highmoor Keep',
		'',
		'A weathered keep above [[Highmoor]] guarding the [pass](https://example.com/pass).',
		'',
		'## History',
		'Built #ancient by the #dwarves.',
		'',
		'See also [[Lore Index#Castles|the castle list]].',
	].join('\n');

	it('parses user frontmatter, aliases, tags, wikilinks, markdown links, and headings', () => {
		const note = obsidianFileToCanonicalNote(source);
		// User frontmatter preserved verbatim; aliases/tags surfaced as first-class (not "user props").
		expect(note.userProperties).toEqual({ author: 'Trent', status: 'draft' });
		expect(note.aliases).toEqual(['The Keep', 'Highmoor Keep']);
		expect(note.tags).toEqual(expect.arrayContaining(['location', 'fortress', 'ancient', 'dwarves']));
		// DND metadata isolated under the dndtools.* namespace — never mixed into userProperties.
		expect(note.dndtoolsMetadata['dndtools.visibility']).toBe('dm-only');
		expect(note.userProperties['dndtools.visibility']).toBeUndefined();
		// Wikilinks (internal links), markdown links, and headings all preserved.
		expect(note.wikilinks).toContain('[[Highmoor]]');
		expect(note.wikilinks).toContain('[[Lore Index#Castles|the castle list]]');
		expect(note.markdownLinks.map((l) => l.target)).toContain('https://example.com/pass');
		expect(note.headings.map((h) => h.text)).toEqual(['Highmoor Keep', 'History']);
	});

	it('round-trips parse → canonical → serialize → parse with all user content preserved', () => {
		const note = obsidianFileToCanonicalNote(source);
		const serialized = canonicalNoteToObsidianFile(note);
		const reparsed = obsidianFileToCanonicalNote(serialized);
		// Body is byte-identical (so headings, wikilinks, markdown links — which live in the body — survive).
		expect(reparsed.body).toBe(note.body);
		expect(reparsed.aliases).toEqual(note.aliases);
		expect(reparsed.tags).toEqual(note.tags);
		expect(reparsed.userProperties).toEqual(note.userProperties);
		expect(reparsed.dndtoolsMetadata).toEqual(note.dndtoolsMetadata);
		expect(reparsed.wikilinks).toEqual(note.wikilinks);
		expect(reparsed.headings).toEqual(note.headings);
		expect(extractMarkdownLinks(serialized)).toEqual(extractMarkdownLinks(source));
		expect(extractHeadings(serialized)).toEqual(extractHeadings(source));
	});

	it('writing DND metadata never collides with a user property of the same bare name', () => {
		// A user authors a `visibility` property AND DND Tools writes `dndtools.visibility`. They coexist.
		const withBoth = '---\nvisibility: public-note\ndndtools.visibility: dm-only\n---\nBody.';
		const note = obsidianFileToCanonicalNote(withBoth);
		expect(note.userProperties['visibility']).toBe('public-note');
		expect(note.dndtoolsMetadata['dndtools.visibility']).toBe('dm-only');
		const serialized = canonicalNoteToObsidianFile(note);
		// Both keys survive the serialize — DND metadata is namespaced, the user's bare key is untouched.
		expect(serialized).toMatch(/^visibility: public-note$/m);
		expect(serialized).toMatch(/^dndtools\.visibility: dm-only$/m);
	});

	it('present-features detection drives the fail-closed transform gate', () => {
		const note = obsidianFileToCanonicalNote(source);
		const features = obsidianPresentFeatures(note);
		expect(features).toEqual(
			expect.arrayContaining([
				'frontmatter-properties',
				'aliases',
				'tags',
				'wikilinks',
				'dndtools-namespaced-metadata',
			]),
		);
	});
});

// ---------------------------------------------------------------------------------------------------
// SYNC-012 — pull + push proof (Obsidian + Google Docs)
// ---------------------------------------------------------------------------------------------------

describe('SYNC-012 Obsidian pull + push round-trip over the fake transport', () => {
	it('pulls a note to canonical ops and pushes them back without losing structure', () => {
		const text = '---\naliases: [Keep]\ntags: [loc]\n---\n# Keep\nA [[Highmoor]] keep.';
		const transport = createFakeVaultTransport([{ path: 'lore/Keep.md', text }]);
		const adapter = createObsidianAdapter('obsidian-a');

		// PULL
		const ops = pullObsidianNote(adapter, transport, 'lore/Keep.md', context);
		expect(ops).toHaveLength(1);
		expect(ops[0]!.entityType).toBe('content-item');
		expect(ops[0]!.opType).toBe('content.import-from-obsidian');

		// PUSH back to a NEW path (the transform is reversible).
		const pushed = pushObsidianOperation(adapter, transport, ops[0]!);
		const written = readVaultFile(pushed, 'lore/Keep.md');
		expect(written).not.toBeNull();
		// The written file re-parses to the same canonical content (round-trip stable).
		const reparsed = obsidianFileToCanonicalNote(written!);
		const original = obsidianFileToCanonicalNote(text);
		expect(reparsed.body).toBe(original.body);
		expect(reparsed.aliases).toEqual(original.aliases);
		expect(reparsed.wikilinks).toEqual(original.wikilinks);
	});

	it('a pull of a missing file yields no ops (fail safe, never throws)', () => {
		const adapter = createObsidianAdapter('obsidian-a');
		const transport = createFakeVaultTransport([]);
		expect(pullObsidianNote(adapter, transport, 'missing.md', context)).toEqual([]);
	});
});

describe('SYNC-012 / SYNC-005 Google Docs pull + push with revision + formatting loss', () => {
	function buildDriveTransport() {
		const files: FakeDriveFile[] = [
			{
				fileId: 'file-quest',
				name: 'Quest',
				revisionId: 'rev-1',
				markdown: '# Quest\nFind the relic. #urgent',
				deleted: false,
				unsupportedFormatting: ['comment', 'suggestion'],
			},
		];
		return createFakeDriveTransport({
			files,
			startPageToken: 'token-0',
			changesByToken: {
				'token-0': { changes: [{ fileId: 'file-quest', kind: 'change' }], nextToken: 'token-1' },
				'token-1': { changes: [], nextToken: null },
			},
		});
	}

	it('pulls changes, tracks the next cursor, and reports unsupported formatting loss', () => {
		const adapter = createGoogleDocsAdapter('gdocs-a');
		const transport = buildDriveTransport();
		const result = pullGoogleDocsChanges(adapter, transport, transport.startPageToken, context);

		expect(result.operations).toHaveLength(1);
		expect(result.operations[0]!.entityId).toBe(googleDocsEntityIdForFile('file-quest'));
		// The new cursor is stored for the next incremental pull (SYNC-005 AC1).
		expect(result.nextCursor).toBe('token-1');
		// Revision metadata + explicit formatting-loss diagnostic (SYNC-005 AC2).
		const state = result.fileStates[0]!;
		expect(state.revisionId).toBe('rev-1');
		expect(state.hasFormattingLoss).toBe(true);
		const value = result.operations[0]!.value as { hasFormattingLoss: boolean; lossDiagnostic: string };
		expect(value.hasFormattingLoss).toBe(true);
		expect(value.lossDiagnostic).toMatch(/comment/);
	});

	it('pushes a canonical op back to Drive, preserving the tracked file id + revision (SYNC-005 AC3)', () => {
		const adapter = createGoogleDocsAdapter('gdocs-a');
		const transport = buildDriveTransport();
		const ops = pullGoogleDocsChanges(adapter, transport, transport.startPageToken, context).operations;
		const pushed = pushGoogleDocsOperation(adapter, transport, ops[0]!);
		const file = readDriveFile(pushed, 'file-quest');
		expect(file).not.toBeNull();
		expect(file!.fileId).toBe('file-quest');
		expect(file!.revisionId).toBe('rev-1');
		// The unsupported-format diagnostic is NOT lost on the write-back.
		expect(file!.unsupportedFormatting).toContain('comment');
	});

	it('advances a durable source cursor record after a pull', () => {
		const record: SourceCursorRecord = {
			sourceId: 'gdocs-a',
			kind: GOOGLE_DOCS_SOURCE_KIND,
			cursor: 'token-0',
			state: 'idle',
			lastRevisionId: null,
			lastPulledAt: null,
		};
		const advanced = advanceSourceCursor(record, {
			cursor: 'token-1',
			state: 'idle',
			lastRevisionId: 'rev-1',
			pulledAt: context.issuedAt,
		});
		expect(advanced.cursor).toBe('token-1');
		expect(advanced.lastRevisionId).toBe('rev-1');
		expect(advanced.lastPulledAt).toBe(context.issuedAt);
		// Input untouched (pure).
		expect(record.cursor).toBe('token-0');
	});
});

// ---------------------------------------------------------------------------------------------------
// SYNC-016 — explicit Google Docs sync states (auth / rename / delete / offline / conflict)
// ---------------------------------------------------------------------------------------------------

describe('SYNC-016 explicit Google Docs sync states', () => {
	it('authorization: first-time auth required, offline keeps cached content readable', () => {
		const offline = deriveAuthorizationState(GOOGLE_DOCS_ADAPTER_CAPABILITY, {
			authMode: 'oauth',
			online: false,
			hasValidToken: false,
		});
		expect(offline.state).toBe('auth-required');
		expect(offline.message).toMatch(/cached content remains readable/i);

		const authorized = deriveAuthorizationState(GOOGLE_DOCS_ADAPTER_CAPABILITY, {
			authMode: 'oauth',
			online: true,
			hasValidToken: true,
		});
		expect(authorized.state).toBe('idle');
	});

	it('reauthorization: an expired token reports reauth-required and KEEPS queued work', () => {
		const reauth = deriveAuthorizationState(GOOGLE_DOCS_ADAPTER_CAPABILITY, {
			authMode: 'oauth',
			online: true,
			hasValidToken: false,
			tokenExpired: true,
		});
		expect(reauth.state).toBe('reauth-required');
		expect(reauth.message).toMatch(/queued changes are kept/i);
	});

	it('an unsupported auth mode for a source fails closed to unsupported', () => {
		const local = deriveAuthorizationState(GOOGLE_DOCS_ADAPTER_CAPABILITY, {
			authMode: 'none',
			online: true,
			hasValidToken: true,
		});
		expect(local.state).toBe('unsupported');
	});

	it('rename: a remote rename preserves identity by file id and reports renamed-remote', () => {
		const adapter = createGoogleDocsAdapter('gdocs-a');
		// The file store still carries the OLD name; the change announces the NEW name (the Drive changes
		// feed carries updated metadata). The adapter detects the divergence as a rename and keeps the
		// entity identity keyed by the stable file id.
		const transport = createFakeDriveTransport({
			files: [
				{
					fileId: 'file-1',
					name: 'Old Name',
					revisionId: 'rev-2',
					markdown: '# Doc body',
					deleted: false,
					unsupportedFormatting: [],
				},
			],
			startPageToken: 'token-0',
			changesByToken: {
				'token-0': {
					changes: [{ fileId: 'file-1', kind: 'change', name: 'New Name' }],
					nextToken: null,
				},
			},
		});
		const result = pullGoogleDocsChanges(adapter, transport, 'token-0', context);
		const state = result.fileStates[0]!;
		expect(state.state).toBe('renamed-remote');
		expect(state.message).toMatch(/preserved by Drive file id/i);
		// Identity is preserved by id regardless of name.
		expect(state.entityId).toBe(googleDocsEntityIdForFile('file-1'));
	});

	it('deletion: a remote delete records delete intent and never silently resurrects content', () => {
		const adapter = createGoogleDocsAdapter('gdocs-a');
		const transport = createFakeDriveTransport({
			files: [],
			startPageToken: 'token-0',
			changesByToken: {
				'token-0': { changes: [{ fileId: 'file-gone', kind: 'remove' }], nextToken: null },
			},
		});
		const result = pullGoogleDocsChanges(adapter, transport, 'token-0', context);
		expect(result.fileStates[0]!.state).toBe('deleted-remote');
		expect(result.operations[0]!.opType).toBe('content.delete-from-google-docs');
		expect(result.fileStates[0]!.message).toMatch(/never silently resurrected/i);
	});

	it('conflict: an offline edit against a diverged remote revision creates an explicit conflict record', () => {
		const transport = createFakeDriveTransport({
			files: [
				{
					fileId: 'file-1',
					name: 'Doc',
					revisionId: 'rev-5',
					markdown: '# Doc remote',
					deleted: false,
					unsupportedFormatting: ['equation'],
				},
			],
			startPageToken: 'token-0',
		});
		const conflict = detectGoogleDocsConflict({
			transport,
			fileId: 'file-1',
			localMarkdown: '# Doc local',
			baseRevisionId: 'rev-3',
		});
		expect(conflict).not.toBeNull();
		expect(conflict!.reason).toBe('source-revision-diverged');
		// The conflict carries local markdown, the remote revision, and the unsupported-format diagnostics.
		expect(conflict!.localMarkdown).toBe('# Doc local');
		expect(conflict!.remoteRevisionId).toBe('rev-5');
		expect(conflict!.baseRevisionId).toBe('rev-3');
		expect(conflict!.unsupportedFormatting).toContain('equation');
		expect(conflict!.resolutionActions).toEqual(['keep-local', 'keep-remote', 'keep-both']);
	});

	it('conflict: a delete-vs-update race records delete-vs-update, not a silent overwrite', () => {
		const transport = createFakeDriveTransport({
			files: [
				{
					fileId: 'file-1',
					name: 'Doc',
					revisionId: 'rev-5',
					markdown: '# Doc',
					deleted: true,
					unsupportedFormatting: [],
				},
			],
			startPageToken: 'token-0',
		});
		const conflict = detectGoogleDocsConflict({
			transport,
			fileId: 'file-1',
			localMarkdown: '# Local edit',
			baseRevisionId: 'rev-5',
		});
		expect(conflict).not.toBeNull();
		expect(conflict!.reason).toBe('delete-vs-update');
	});

	it('no conflict when the queued edit is based on the current remote revision (idempotent push)', () => {
		const transport = createFakeDriveTransport({
			files: [
				{
					fileId: 'file-1',
					name: 'Doc',
					revisionId: 'rev-5',
					markdown: '# Doc',
					deleted: false,
					unsupportedFormatting: [],
				},
			],
			startPageToken: 'token-0',
		});
		const conflict = detectGoogleDocsConflict({
			transport,
			fileId: 'file-1',
			localMarkdown: '# Local edit',
			baseRevisionId: 'rev-5',
		});
		expect(conflict).toBeNull();
	});
});

// ---------------------------------------------------------------------------------------------------
// SYNC-015 — capability metadata + fail-closed across every dimension
// ---------------------------------------------------------------------------------------------------

describe('SYNC-015 every adapter declares capability metadata and fails closed', () => {
	it('the registry lists a declared capability for every registered source kind', () => {
		const caps = listSourceAdapterCapabilities();
		expect(caps.map((c) => c.kind)).toEqual([...REGISTERED_SOURCE_KINDS]);
		for (const capability of caps) {
			// Every adapter declares the SYNC-015 dimensions.
			expect(capability.supportedSchemaVersions.length).toBeGreaterThan(0);
			expect(capability.supportedSourceVersions.length).toBeGreaterThan(0);
			expect(capability.supportedAuthModes.length).toBeGreaterThan(0);
			expect(capability.supportedEntityTypes.length).toBeGreaterThan(0);
		}
		// Every declared descriptor is well-formed (the registry-wide fail-closed guard).
		expect(validateRegisteredSourceAdapters()).toEqual([]);
		expect(validateSourceAdapterCapability(GOOGLE_DOCS_ADAPTER_CAPABILITY)).toEqual([]);
	});

	it('summaries classify Google Docs constrained features as unsupported/lossy, Obsidian all supported', () => {
		const summaries = listSourceAdapterCapabilitySummaries();
		const gdocs = summaries.find((s) => s.kind === GOOGLE_DOCS_SOURCE_KIND)!;
		expect(gdocs.unsupportedFeatures).toEqual(
			expect.arrayContaining(['frontmatter-properties', 'aliases', 'wikilinks']),
		);
		expect(gdocs.lossyFeatures).toContain('inline-tags');
		const obsidian = summaries.find((s) => s.kind === OBSIDIAN_SOURCE_KIND)!;
		expect(obsidian.unsupportedFeatures).toEqual([]);
		expect(obsidian.lossyFeatures).toEqual([]);
	});

	it('fails closed on an unsupported SCHEMA version with an upgrade-required reason', () => {
		const result = checkSchemaVersionSupported(GOOGLE_DOCS_ADAPTER_CAPABILITY, 999);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('unsupported-schema-version');
		expect(result.message).toMatch(/upgrade is required/i);
	});

	it('fails closed on an unsupported SOURCE version', () => {
		const result = checkSourceVersionSupported(GOOGLE_DOCS_ADAPTER_CAPABILITY, 'v99');
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('unsupported-source-version');
	});

	it('fails closed on an unsupported AUTH mode', () => {
		const result = checkAuthModeSupported(OBSIDIAN_ADAPTER_CAPABILITY, 'oauth');
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('unsupported-auth-mode');
	});

	it('the preflight rejects an unknown source kind fail-closed', () => {
		const result = preflightSourceAdapter('does-not-exist', { read: true });
		expect(result.ok).toBe(false);
		expect(result.unknownKind).toBe(true);
	});

	it('the preflight collects EVERY failing dimension for a registered source', () => {
		const result = preflightSourceAdapter(GOOGLE_DOCS_SOURCE_KIND, {
			schemaVersion: 999,
			sourceVersion: 'v99',
			authMode: 'token',
			entityType: 'map',
		});
		expect(result.ok).toBe(false);
		const reasons = result.rejections.map((r) => r.reason);
		expect(reasons).toEqual(
			expect.arrayContaining([
				'unsupported-schema-version',
				'unsupported-source-version',
				'unsupported-auth-mode',
				'unsupported-entity-type',
			]),
		);
	});

	it('the preflight blocks a LOSSY write unless acknowledged, then allows it once acknowledged', () => {
		// A Google Docs write with frontmatter present is lossy (unsupported feature) — fail closed.
		const blocked = preflightSourceAdapter(GOOGLE_DOCS_SOURCE_KIND, {
			write: { presentFeatures: ['frontmatter-properties', 'wikilinks'], acknowledged: false },
		});
		expect(blocked.ok).toBe(false);
		expect(blocked.rejections[0]!.reason).toBe('lossy-transform');

		const acknowledged = preflightSourceAdapter(GOOGLE_DOCS_SOURCE_KIND, {
			write: { presentFeatures: ['frontmatter-properties', 'wikilinks'], acknowledged: true },
		});
		expect(acknowledged.ok).toBe(true);
	});

	it('a faithful write (only supported features) needs no acknowledgment', () => {
		const result = preflightSourceAdapter(OBSIDIAN_SOURCE_KIND, {
			write: { presentFeatures: ['frontmatter-properties', 'aliases', 'wikilinks'], acknowledged: false },
		});
		expect(result.ok).toBe(true);
	});

	it('an unknown source kind resolves to null capability (fail closed)', () => {
		expect(capabilityForSourceKind('nope')).toBeNull();
		expect(capabilityForSourceKind(OBSIDIAN_SOURCE_KIND)).toBe(OBSIDIAN_ADAPTER_CAPABILITY);
	});

	it('the local-vault baseline is fully offline and supports every note feature (wikilinks lossy)', () => {
		expect(LOCAL_VAULT_ADAPTER_CAPABILITY.offlineAvailability).toBe('full');
		expect(LOCAL_VAULT_ADAPTER_CAPABILITY.supportedAuthModes).toEqual(['none']);
		expect(LOCAL_VAULT_ADAPTER_CAPABILITY.featureSupport['wikilinks']).toBe('lossy');
	});
});
