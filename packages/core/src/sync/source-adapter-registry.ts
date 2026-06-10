import {
	type CapabilityCheckResult,
	type SourceAdapterCapability,
	type SyncSourceAuthMode,
	type SyncSourceKind,
	type SyncSourceLifecycleState,
	checkAuthModeSupported,
	checkEntityTypeSupported,
	checkSchemaVersionSupported,
	checkSourceVersionSupported,
	checkTransformFidelity,
	checkWriteSupported,
} from './source-adapters';
import { OBSIDIAN_ADAPTER_CAPABILITY, OBSIDIAN_SOURCE_KIND } from './obsidian-adapter';
import {
	GOOGLE_DOCS_ADAPTER_CAPABILITY,
	GOOGLE_DOCS_SOURCE_KIND,
} from './google-docs-adapter';
import { CONTENT_ITEM_ENTITY_TYPE } from '../state/content';
import type { ContentFeatureSupport, ContentNoteFeature } from '../state/content-constraints';
import type { PlatformProfileId } from '../state/widget-package-state';

/**
 * SYNC-003 / SYNC-015 — the SOURCE ADAPTER REGISTRY: the inspectable list of declared adapter
 * capabilities + the fail-closed registration/preflight surface.
 *
 * It mirrors the existing capability-registry pattern (the MAP-020 adapter registry, the platform
 * support-status artifact): a frozen table of declared capability descriptors keyed by source kind, with
 * resolution that FAILS CLOSED to `null`/`unsupported` for an unknown kind. The local-vault descriptor is
 * declared here (it is the baseline, fully-offline source with no constrained features); the Obsidian and
 * Google Docs descriptors are imported from their adapter modules so the metadata lives next to the
 * transform logic it governs.
 *
 * The crux this surface proves (SYNC-015): registering ANY adapter requires the SAME declared metadata
 * shape, and a preflight against an unsupported schema version / source version / auth mode / entity type
 * / lossy transform is rejected with an explicit reason BEFORE any mutation. Pure data + pure functions.
 */

export const SOURCE_ADAPTER_REGISTRY_SCHEMA_VERSION = 1 as const;

/** The LOCAL-vault baseline capability — fully offline, no auth, every note feature supported. */
export const LOCAL_VAULT_ADAPTER_CAPABILITY: SourceAdapterCapability = Object.freeze({
	kind: 'local-vault',
	displayName: 'Local vault',
	summary:
		'Portable local markdown vault. Fully offline-capable; properties, aliases, tags, and headings round-trip. Obsidian [[wikilinks]] survive as literal text but lose their resolved-link semantics.',
	supportedSchemaVersions: Object.freeze([1]),
	supportedSourceVersions: Object.freeze(['1']),
	supportedAuthModes: Object.freeze(['none']),
	supportedEntityTypes: Object.freeze([CONTENT_ITEM_ENTITY_TYPE]),
	canRead: true,
	canWrite: true,
	canRename: false,
	canDelete: true,
	canExposeRevisionHistory: false,
	canWatchChanges: true,
	offlineAvailability: 'full',
	supportedPlatformProfiles: Object.freeze(['desktop', 'web'] as PlatformProfileId[]),
	featureSupport: Object.freeze({
		'frontmatter-properties': 'supported',
		aliases: 'supported',
		tags: 'supported',
		'inline-tags': 'supported',
		wikilinks: 'lossy',
		'dndtools-namespaced-metadata': 'supported',
	}),
});

/**
 * THE declared source-adapter capability table. A FUTURE source is added here with the SAME descriptor
 * shape and NO core command/reducer change (SYNC-003). The union is open, so an unknown kind resolves to
 * `null` and fails closed.
 */
export const SOURCE_ADAPTER_CAPABILITIES: Readonly<Record<string, SourceAdapterCapability>> =
	Object.freeze({
		'local-vault': LOCAL_VAULT_ADAPTER_CAPABILITY,
		[OBSIDIAN_SOURCE_KIND]: OBSIDIAN_ADAPTER_CAPABILITY,
		[GOOGLE_DOCS_SOURCE_KIND]: GOOGLE_DOCS_ADAPTER_CAPABILITY,
	});

/** The declared source kinds, in stable order. The GUI renders this as the source-capability table. */
export const REGISTERED_SOURCE_KINDS: readonly SyncSourceKind[] = Object.freeze([
	'local-vault',
	OBSIDIAN_SOURCE_KIND,
	GOOGLE_DOCS_SOURCE_KIND,
]);

/** Resolve the declared capability for a source kind, or `null` for an unknown kind (fail closed). */
export function capabilityForSourceKind(kind: string): SourceAdapterCapability | null {
	return SOURCE_ADAPTER_CAPABILITIES[kind] ?? null;
}

/** All declared capabilities, in registered order — the inspectable registry (SYNC-015 AC1). */
export function listSourceAdapterCapabilities(): SourceAdapterCapability[] {
	return REGISTERED_SOURCE_KINDS.map((kind) => SOURCE_ADAPTER_CAPABILITIES[kind]!);
}

/** A flattened, GUI-friendly capability summary for one source (supported/lossy/unsupported features). */
export interface SourceAdapterCapabilitySummary {
	kind: SyncSourceKind;
	displayName: string;
	summary: string;
	supportedSchemaVersions: number[];
	supportedSourceVersions: string[];
	supportedAuthModes: SyncSourceAuthMode[];
	supportedEntityTypes: string[];
	canRead: boolean;
	canWrite: boolean;
	canExposeRevisionHistory: boolean;
	offlineAvailability: 'full' | 'cached' | 'none';
	supportedFeatures: ContentNoteFeature[];
	lossyFeatures: ContentNoteFeature[];
	unsupportedFeatures: ContentNoteFeature[];
}

const ALL_NOTE_FEATURES: readonly ContentNoteFeature[] = [
	'frontmatter-properties',
	'aliases',
	'tags',
	'inline-tags',
	'wikilinks',
	'dndtools-namespaced-metadata',
];

/** Summarize a capability descriptor into supported/lossy/unsupported feature lists. Pure. */
export function summarizeSourceAdapterCapability(
	capability: SourceAdapterCapability,
): SourceAdapterCapabilitySummary {
	const supportedFeatures: ContentNoteFeature[] = [];
	const lossyFeatures: ContentNoteFeature[] = [];
	const unsupportedFeatures: ContentNoteFeature[] = [];
	for (const feature of ALL_NOTE_FEATURES) {
		const support: ContentFeatureSupport = capability.featureSupport[feature] ?? 'unsupported';
		if (support === 'supported') supportedFeatures.push(feature);
		else if (support === 'lossy') lossyFeatures.push(feature);
		else unsupportedFeatures.push(feature);
	}
	return {
		kind: capability.kind,
		displayName: capability.displayName,
		summary: capability.summary,
		supportedSchemaVersions: [...capability.supportedSchemaVersions],
		supportedSourceVersions: [...capability.supportedSourceVersions],
		supportedAuthModes: [...capability.supportedAuthModes],
		supportedEntityTypes: [...capability.supportedEntityTypes],
		canRead: capability.canRead,
		canWrite: capability.canWrite,
		canExposeRevisionHistory: capability.canExposeRevisionHistory,
		offlineAvailability: capability.offlineAvailability,
		supportedFeatures,
		lossyFeatures,
		unsupportedFeatures,
	};
}

/** All capability summaries, in registered order. */
export function listSourceAdapterCapabilitySummaries(): SourceAdapterCapabilitySummary[] {
	return listSourceAdapterCapabilities().map(summarizeSourceAdapterCapability);
}

/**
 * SYNC-015 — a full PREFLIGHT request to validate against a source's declared capability BEFORE any
 * mutation. Each supplied dimension is checked fail-closed; an undeclared/unsupported value rejects with
 * the precise reason. Omitted dimensions are not checked (a pull need not declare a write fidelity, etc.).
 */
export interface SourceAdapterPreflightRequest {
	schemaVersion?: number;
	sourceVersion?: string;
	authMode?: SyncSourceAuthMode;
	entityType?: string;
	/** For a WRITE: the note features present + whether the lossy transform was acknowledged. */
	write?: { presentFeatures: readonly ContentNoteFeature[]; acknowledged: boolean };
	/** For a READ: assert the source can read. */
	read?: boolean;
}

export interface SourceAdapterPreflightResult {
	ok: boolean;
	/** Every failing dimension (so the caller sees ALL reasons it must fix), in check order. */
	rejections: CapabilityCheckResult[];
	/** True when the source kind itself was unknown (every dimension then fails closed). */
	unknownKind: boolean;
}

/**
 * SYNC-015 — run the full fail-closed preflight for a source kind. An UNKNOWN kind fails closed (no
 * permissive default). Each supplied dimension is checked against the declared capability and every
 * rejection is collected, so a registration/preflight reports precisely which dimension(s) block the
 * operation. An empty `rejections` with `ok: true` means the operation is within the declared capability.
 */
export function preflightSourceAdapter(
	kind: string,
	request: SourceAdapterPreflightRequest,
): SourceAdapterPreflightResult {
	const capability = capabilityForSourceKind(kind);
	if (!capability) {
		return {
			ok: false,
			unknownKind: true,
			rejections: [
				{
					ok: false,
					reason: 'unsupported-source-version',
					message: `"${kind}" is not a registered source adapter; the request is rejected fail-closed.`,
				},
			],
		};
	}
	const rejections: CapabilityCheckResult[] = [];
	if (request.schemaVersion !== undefined) {
		const result = checkSchemaVersionSupported(capability, request.schemaVersion);
		if (!result.ok) rejections.push(result);
	}
	if (request.sourceVersion !== undefined) {
		const result = checkSourceVersionSupported(capability, request.sourceVersion);
		if (!result.ok) rejections.push(result);
	}
	if (request.authMode !== undefined) {
		const result = checkAuthModeSupported(capability, request.authMode);
		if (!result.ok) rejections.push(result);
	}
	if (request.entityType !== undefined) {
		const result = checkEntityTypeSupported(capability, request.entityType);
		if (!result.ok) rejections.push(result);
	}
	if (request.read === true && !capability.canRead) {
		rejections.push({
			ok: false,
			reason: 'read-not-supported',
			message: `The ${capability.displayName} adapter does not support reading.`,
		});
	}
	if (request.write) {
		const writeCheck = checkWriteSupported(capability);
		if (!writeCheck.ok) {
			rejections.push(writeCheck);
		} else {
			const result = checkTransformFidelity(
				capability,
				request.write.presentFeatures,
				request.write.acknowledged,
			);
			if (!result.ok) rejections.push(result);
		}
	}
	return { ok: rejections.length === 0, rejections, unknownKind: false };
}

/**
 * SYNC-015 — a structured problem report for an adapter capability descriptor itself, so a registration
 * surface (and the regression test) can fail closed if a NEW adapter is mis-declared. A descriptor is
 * invalid when it declares no schema version, no source version, no entity type, no auth mode, or claims
 * write without declaring per-feature fidelity. Returns every problem.
 */
export type CapabilityDescriptorProblemKind =
	| 'no-schema-version'
	| 'no-source-version'
	| 'no-auth-mode'
	| 'no-entity-type'
	| 'no-platform-profile'
	| 'write-without-feature-support';

export interface CapabilityDescriptorProblem {
	kind: SyncSourceKind;
	problem: CapabilityDescriptorProblemKind;
	message: string;
}

export function validateSourceAdapterCapability(
	capability: SourceAdapterCapability,
): CapabilityDescriptorProblem[] {
	const problems: CapabilityDescriptorProblem[] = [];
	const add = (problem: CapabilityDescriptorProblemKind, message: string): void => {
		problems.push({ kind: capability.kind, problem, message });
	};
	if (capability.supportedSchemaVersions.length === 0) {
		add('no-schema-version', 'A source adapter must declare at least one supported schema version.');
	}
	if (capability.supportedSourceVersions.length === 0) {
		add('no-source-version', 'A source adapter must declare at least one supported source version.');
	}
	if (capability.supportedAuthModes.length === 0) {
		add('no-auth-mode', 'A source adapter must declare at least one supported auth mode.');
	}
	if (capability.supportedEntityTypes.length === 0) {
		add('no-entity-type', 'A source adapter must declare at least one supported entity type.');
	}
	if (capability.supportedPlatformProfiles.length === 0) {
		add('no-platform-profile', 'A source adapter must declare at least one supported platform profile.');
	}
	if (capability.canWrite && Object.keys(capability.featureSupport).length === 0) {
		add(
			'write-without-feature-support',
			'A writable adapter must declare per-feature transform fidelity so lossy writes can fail closed.',
		);
	}
	return problems;
}

/** Validate EVERY registered adapter descriptor (the registry-wide fail-closed guard). */
export function validateRegisteredSourceAdapters(): CapabilityDescriptorProblem[] {
	return listSourceAdapterCapabilities().flatMap(validateSourceAdapterCapability);
}

/**
 * SYNC-005 / SYNC-016 — a durable per-source CURSOR record: the stored change page token a source uses
 * for the next incremental pull, plus its last observed lifecycle state and revision metadata. This is
 * the SyncState `source cursors` shape (Contract 2) the future transport persists; modeled here as plain
 * data the adapter pull updates.
 */
export interface SourceCursorRecord {
	sourceId: string;
	kind: SyncSourceKind;
	/** The stored change page token (Drive) or null for a non-incremental source. */
	cursor: string | null;
	/** The last lifecycle state observed for the source. */
	state: SyncSourceLifecycleState;
	/** The last observed revision id (when the source exposes revisions). */
	lastRevisionId: string | null;
	/** A deterministic last-pulled timestamp (supplied by the caller; never `Date.now()`). */
	lastPulledAt: string | null;
}

/** Advance a source cursor record after a pull. Pure — returns a new record. */
export function advanceSourceCursor(
	record: SourceCursorRecord,
	update: { cursor: string; state: SyncSourceLifecycleState; lastRevisionId?: string | null; pulledAt: string },
): SourceCursorRecord {
	return {
		...record,
		cursor: update.cursor,
		state: update.state,
		lastRevisionId: update.lastRevisionId ?? record.lastRevisionId,
		lastPulledAt: update.pulledAt,
	};
}
