import type { SyncOperation } from './operation-log';
import { SYNC_OPERATION_SCHEMA_VERSION } from './operation-log';
import { validateSyncOperationShape } from './operation-model';
import {
	type ContentFeatureSupport,
	type ContentNoteFeature,
} from '../state/content-constraints';

/**
 * SYNC-003 / SYNC-015 — the SOURCE ADAPTER INTERFACE + its CAPABILITY-METADATA + FAIL-CLOSED model.
 *
 * This is the seam the architecture contract's "Sync Source Contract" defines: every external source
 * (local vault, Obsidian vault, Google Docs, and FUTURE sources) plugs in behind ONE adapter shape and
 * transforms its external content ↔ canonical {@link SyncOperation}s AT THE BOUNDARY. The crux
 * (SYNC-003) is that an adapter plugs in WITHOUT changing any Processing-Core COMMAND or REDUCER
 * contract: the canonical op is the only currency that crosses the boundary, so a new adapter is new
 * pure transform code, never a new command signature. `assertAdapterEmitsCanonicalOperations` proves
 * this — an adapter that maps external content to ops must emit ops that pass the SAME
 * `validateSyncOperationShape` conformance guard every in-process command already satisfies.
 *
 * Per ADR-014, the LIVE transports (real filesystem / Obsidian / Drive network) are DEFERRED. This
 * module delivers the adapter INTERFACE + the per-source adapter LOGIC (pure transforms, capability
 * metadata, explicit state handling) tested over an IN-MEMORY / FAKE transport (`source-transport.ts`).
 * Everything here is pure Processing-Core policy: deterministic over plain data, no DOM/Node/Svelte,
 * no clock, no entropy, no network. The transport is injected; the GUI dispatches command intents and
 * renders adapter status — it never touches raw storage/network directly.
 */

export const SOURCE_ADAPTER_SCHEMA_VERSION = 1 as const;

/** The known source KINDS. The union is open (`string`) so a FUTURE source needs no core change. */
export type SyncSourceKind = 'local-vault' | 'obsidian-vault' | 'google-docs' | (string & {});

/**
 * The auth modes an adapter can require. A LOCAL source needs `none`; a remote source needs an
 * `oauth`/`token` mode that requires a one-time network authorization (Contract 2 offline exception).
 */
export type SyncSourceAuthMode = 'none' | 'oauth' | 'token' | (string & {});

/**
 * EXPLICIT sync states (SYNC-016). A source is NEVER in a silent/ambiguous state: every condition the
 * adapter can be in is a named enum value with a derivation rule, so the GUI renders a precise status
 * and the core can reason about it. This is the typed state enum SYNC-016 requires.
 *
 *  - `idle`              — connected, authorized, nothing pending.
 *  - `auth-required`     — first-time authorization needed and not yet granted (or offline w/ no token).
 *  - `reauth-required`   — a previously-valid authorization expired/was revoked; queued work is kept.
 *  - `offline-queued`    — offline (or transport unreachable) with local edits queued for later push.
 *  - `syncing`           — a pull/push is in progress.
 *  - `renamed-remote`    — the remote entity was renamed; local identity is preserved by id.
 *  - `deleted-remote`    — the remote entity was deleted; a delete-vs-edit decision may be required.
 *  - `conflict`          — a remote revision cannot be deterministically merged with local intent.
 *  - `lossy-blocked`     — a push would lose/downgrade structure and is blocked pending acknowledgment.
 *  - `unsupported`       — the source/schema/auth/entity is unsupported on this build/profile (closed).
 */
export type SyncSourceLifecycleState =
	| 'idle'
	| 'auth-required'
	| 'reauth-required'
	| 'offline-queued'
	| 'syncing'
	| 'renamed-remote'
	| 'deleted-remote'
	| 'conflict'
	| 'lossy-blocked'
	| 'unsupported';

export const SYNC_SOURCE_LIFECYCLE_STATES: readonly SyncSourceLifecycleState[] = Object.freeze([
	'idle',
	'auth-required',
	'reauth-required',
	'offline-queued',
	'syncing',
	'renamed-remote',
	'deleted-remote',
	'conflict',
	'lossy-blocked',
	'unsupported',
]);

/**
 * The transform DIRECTIONS an adapter declares support for. `import` maps EXTERNAL content → canonical
 * ops/snapshots (a pull); `export` maps canonical ops/snapshots → external mutations (a push).
 */
export type SyncTransformDirection = 'import' | 'export';

/**
 * SYNC-015 — the SOURCE ADAPTER CAPABILITY metadata EVERY adapter must declare. It is the typed,
 * inspectable contract a registration/inspection surface reads and the fail-closed checks evaluate
 * against. It mirrors the existing capability-descriptor pattern (`platform/support-status.ts`,
 * `state/content-constraints.ts`): a declared support map, with anything undeclared failing CLOSED.
 *
 * The declared dimensions are exactly the ones SYNC-015 fails closed for: supported SCHEMA VERSIONS,
 * supported SOURCE VERSIONS, supported AUTH MODES, supported ENTITY TYPES, and per-feature TRANSFORM
 * fidelity (a lossy transform is gated, never silently applied).
 */
export interface SourceAdapterCapability {
	/** Stable source kind this descriptor governs. */
	readonly kind: SyncSourceKind;
	readonly displayName: string;
	/** Human-readable summary of what the source can / can't represent. */
	readonly summary: string;
	/** The canonical op schema versions this adapter can produce/consume. */
	readonly supportedSchemaVersions: readonly number[];
	/** The external SOURCE versions this adapter understands (e.g. Obsidian/Drive API versions). */
	readonly supportedSourceVersions: readonly string[];
	/** The auth modes this source accepts. A mode absent here is rejected (fail closed). */
	readonly supportedAuthModes: readonly SyncSourceAuthMode[];
	/** The entity types this adapter can read/write. An entity type absent here is rejected. */
	readonly supportedEntityTypes: readonly string[];
	/** Whether the adapter can read external content (pull). */
	readonly canRead: boolean;
	/** Whether the adapter can write external content (push). */
	readonly canWrite: boolean;
	/** Whether the source exposes per-entity revision metadata (e.g. Drive revision ids). */
	readonly canExposeRevisionHistory: boolean;
	/** Whether the source exposes an incremental change cursor (e.g. Drive change page token). */
	readonly canWatchChanges: boolean;
	/** Offline availability of already-cached content (Contract 2 capabilities). */
	readonly offlineAvailability: 'full' | 'cached' | 'none';
	/**
	 * Per-note-feature TRANSFORM fidelity, REUSING the existing content-constraint feature taxonomy +
	 * support classification. A `lossy`/`unsupported` feature is the seam the fail-closed push gate
	 * keys on (the same `dndtools.*`-aware features `content-constraints.ts` already declares).
	 */
	readonly featureSupport: Readonly<Partial<Record<ContentNoteFeature, ContentFeatureSupport>>>;
}

/** The reason a capability check fails closed (SYNC-015). One per fail-closed DIMENSION. */
export type CapabilityRejectionReason =
	| 'unsupported-schema-version'
	| 'unsupported-source-version'
	| 'unsupported-auth-mode'
	| 'unsupported-entity-type'
	| 'lossy-transform'
	| 'read-not-supported'
	| 'write-not-supported';

export interface CapabilityCheckResult {
	ok: boolean;
	reason: CapabilityRejectionReason | null;
	/** A generic, non-leaking explanation (names the DIMENSION, never raw external content). */
	message: string;
}

function ok(): CapabilityCheckResult {
	return { ok: true, reason: null, message: 'The request is within the declared source capability.' };
}

function fail(reason: CapabilityRejectionReason, message: string): CapabilityCheckResult {
	return { ok: false, reason, message };
}

/**
 * SYNC-015 — fail-closed SCHEMA-VERSION check. A payload whose canonical op schema version is not in the
 * adapter's `supportedSchemaVersions` is REJECTED with an upgrade-required diagnostic BEFORE any
 * mutation (Contract 2 "Unsupported future versions fail closed"). An unknown/empty version fails too.
 */
export function checkSchemaVersionSupported(
	capability: SourceAdapterCapability,
	schemaVersion: number,
): CapabilityCheckResult {
	if (!capability.supportedSchemaVersions.includes(schemaVersion)) {
		return fail(
			'unsupported-schema-version',
			`Schema version ${schemaVersion} is not supported by the ${capability.displayName} adapter; an upgrade is required before this payload can be parsed.`,
		);
	}
	return ok();
}

/** SYNC-015 — fail-closed SOURCE-VERSION check (e.g. an Obsidian/Drive API version the adapter knows). */
export function checkSourceVersionSupported(
	capability: SourceAdapterCapability,
	sourceVersion: string,
): CapabilityCheckResult {
	if (!capability.supportedSourceVersions.includes(sourceVersion)) {
		return fail(
			'unsupported-source-version',
			`Source version "${sourceVersion}" is not supported by the ${capability.displayName} adapter.`,
		);
	}
	return ok();
}

/** SYNC-015 — fail-closed AUTH-MODE check. An auth mode the source does not accept is rejected. */
export function checkAuthModeSupported(
	capability: SourceAdapterCapability,
	authMode: SyncSourceAuthMode,
): CapabilityCheckResult {
	if (!capability.supportedAuthModes.includes(authMode)) {
		return fail(
			'unsupported-auth-mode',
			`Auth mode "${authMode}" is not supported by the ${capability.displayName} adapter.`,
		);
	}
	return ok();
}

/** SYNC-015 — fail-closed ENTITY-TYPE check. An entity type the adapter cannot map is rejected. */
export function checkEntityTypeSupported(
	capability: SourceAdapterCapability,
	entityType: string,
): CapabilityCheckResult {
	if (!capability.supportedEntityTypes.includes(entityType)) {
		return fail(
			'unsupported-entity-type',
			`Entity type "${entityType}" is not supported by the ${capability.displayName} adapter.`,
		);
	}
	return ok();
}

/**
 * SYNC-015 — fail-closed TRANSFORM-FIDELITY check for a PUSH. Given the note features actually present,
 * a feature the source classifies `lossy` or `unsupported` blocks the write UNLESS the matching
 * acknowledgment token is supplied (the same fail-closed posture as `isContentWriteAcknowledged`). A
 * faithful transform (every present feature `supported`) needs no acknowledgment.
 */
export function checkTransformFidelity(
	capability: SourceAdapterCapability,
	presentFeatures: readonly ContentNoteFeature[],
	acknowledged: boolean,
): CapabilityCheckResult {
	const affected = presentFeatures.filter((feature) => {
		const support = capability.featureSupport[feature] ?? 'unsupported';
		return support !== 'supported';
	});
	if (affected.length > 0 && !acknowledged) {
		return fail(
			'lossy-transform',
			`Writing to ${capability.displayName} would lose or downgrade ${affected.length} note structure(s); acknowledge the loss before the write.`,
		);
	}
	return ok();
}

/**
 * The OUTCOME of authorizing a source. `authorized` is granted only when the auth mode is supported AND
 * (for a remote source) the transport reports a valid token. Offline without a token is `auth-required`
 * (a remote source), but local-cached workflows continue (Contract 2: local-first invariant).
 */
export interface AuthorizationOutcome {
	state: Extract<SyncSourceLifecycleState, 'idle' | 'auth-required' | 'reauth-required' | 'unsupported'>;
	/** A generic, non-leaking explanation. Never carries a token or credential. */
	message: string;
}

export interface AuthorizationInput {
	authMode: SyncSourceAuthMode;
	/** Whether the device currently has network. A remote first-time auth requires network. */
	online: boolean;
	/** Whether a valid (unexpired, unrevoked) token already exists for this source on this device. */
	hasValidToken: boolean;
	/** Whether a token existed before but is now expired/revoked (⇒ reauth, queued work kept). */
	tokenExpired?: boolean;
}

/**
 * SYNC-016 — derive the EXPLICIT authorization state for a source, fail closed. A local source
 * (`authMode: 'none'`) is always `idle`. A remote source is:
 *
 *   - `unsupported`     when the auth mode is not in the declared capability;
 *   - `reauth-required` when a token existed but is now expired/revoked (queued work is preserved);
 *   - `idle`            when a valid token exists;
 *   - `auth-required`   when no valid token exists (first-time auth — needs network; offline keeps
 *                       cached content readable but reports auth unavailable).
 *
 * Crucially this NEVER drops queued operations or blocks local cached reads — it only reports the
 * remote auth posture.
 */
export function deriveAuthorizationState(
	capability: SourceAdapterCapability,
	input: AuthorizationInput,
): AuthorizationOutcome {
	const supported = checkAuthModeSupported(capability, input.authMode);
	if (!supported.ok) {
		return { state: 'unsupported', message: supported.message };
	}
	if (input.authMode === 'none') {
		return { state: 'idle', message: 'Local source is available offline; no authorization is required.' };
	}
	if (input.tokenExpired === true) {
		return {
			state: 'reauth-required',
			message:
				'Authorization expired. Local work stays available and queued changes are kept; re-authorize to resume remote sync.',
		};
	}
	if (input.hasValidToken) {
		return { state: 'idle', message: 'The source is authorized and reachable.' };
	}
	// No valid token: first-time authorization. It requires network; cached content stays readable.
	return {
		state: 'auth-required',
		message: input.online
			? 'First-time authorization is required for this source. Cached content remains readable.'
			: 'First-time authorization requires network and is unavailable offline. Cached content remains readable.',
	};
}

/**
 * SYNC-003 — the SYNC SOURCE ADAPTER interface. An adapter is a PURE policy object: it declares its
 * capability metadata and transforms external source content ↔ canonical {@link SyncOperation}s. It
 * does NOT define new commands or reducers — the canonical op is the only thing that crosses into the
 * Processing Core, so adding an adapter never changes a core command/reducer contract.
 *
 * The adapter is bound to an INJECTED fake/real transport (a real filesystem/Drive client later; an
 * in-memory fake here per ADR-014) by the standalone pull/push helpers in each adapter module — the
 * adapter's own methods are pure transforms over the `ExternalEntity` it reads/writes, so the adapter
 * never reaches for ambient I/O. The `ExternalEntity` type parameter is the external payload shape the
 * adapter transforms (a vault file for Obsidian; a Drive file for Google Docs).
 */
export interface SyncSourceAdapter<ExternalEntity = unknown> {
	/** Stable source id for this adapter instance. */
	readonly sourceId: string;
	/** The source kind (`local-vault` / `obsidian-vault` / `google-docs` / future). */
	readonly kind: SyncSourceKind;
	/** The declared capability metadata (SYNC-015). Inspected on registration; fail-closed checks use it. */
	capabilities(): SourceAdapterCapability;
	/**
	 * PULL: map an external entity (read from the injected transport) to canonical sync operations. This
	 * is the IMPORT transform direction. The returned ops must conform to the canonical shape — proven by
	 * {@link assertAdapterEmitsCanonicalOperations}. Pure given (entity, vaultId, actorId, issuedAt).
	 */
	toCanonical(
		entity: ExternalEntity,
		context: AdapterTransformContext,
	): SyncOperation[];
	/**
	 * PUSH: map a canonical sync operation to the external mutation(s) the transport would apply. This is
	 * the EXPORT transform direction. Pure given the op; the transport applies the returned mutation.
	 */
	fromCanonical(operation: SyncOperation): ExternalMutation<ExternalEntity>[];
}

/** The deterministic context a `toCanonical` transform needs (no clock/entropy — all supplied). */
export interface AdapterTransformContext {
	vaultId: string;
	actorId: string;
	/** A deterministic issue time supplied by the caller (never `Date.now()`). */
	issuedAt: string;
	/** Op ids this op depends on (Contract 2 explicit ordering). Defaults to none. */
	dependencies?: readonly string[];
}

/** An external mutation a push would apply to the transport: a write or a delete of one external entity. */
export interface ExternalMutation<ExternalEntity = unknown> {
	op: 'write' | 'delete';
	/** The external entity ref (e.g. vault-relative path, or Drive file id). */
	externalId: string;
	/** The external entity payload for a `write` (the serialized note); absent for a `delete`. */
	entity?: ExternalEntity;
}

/**
 * SYNC-003 (the no-core-contract-change PROOF). Assert that the operations an adapter emits are
 * CANONICALLY CONFORMANT — they pass the EXACT SAME `validateSyncOperationShape` guard that every
 * in-process command's emitted op satisfies. This is the structural proof that an adapter plugs in
 * WITHOUT a new op shape, a new command, or a reducer change: it produces the one canonical currency
 * the core already accepts. Throws (fail closed) naming the first non-conformant op.
 */
export function assertAdapterEmitsCanonicalOperations(operations: readonly SyncOperation[]): void {
	for (const operation of operations) {
		const result = validateSyncOperationShape(operation);
		if (!result.conformant) {
			const detail = result.problems.map((p) => `${p.field}: ${p.message}`).join('; ');
			throw new Error(
				`Source adapter emitted a non-canonical operation; an adapter must transform external content into the canonical operation shape without changing any core contract: ${detail}`,
			);
		}
	}
}

/** Whether every op an adapter emits conforms to the canonical shape (the SYNC-003 predicate). */
export function adapterEmitsCanonicalOperations(operations: readonly SyncOperation[]): boolean {
	return operations.every((operation) => validateSyncOperationShape(operation).conformant);
}

/** The canonical op schema version every adapter in this build targets (single supported version). */
export const ADAPTER_CANONICAL_SCHEMA_VERSION = SYNC_OPERATION_SCHEMA_VERSION;

/**
 * Build a canonical op from an adapter transform, stamping the single supported schema version and the
 * supplied deterministic context. Centralizes op construction so every adapter emits the SAME shape.
 */
export function buildCanonicalOperation(input: {
	id: string;
	vaultId: string;
	sourceId: string;
	actorId: string;
	entityType: string;
	entityId: string;
	opType: string;
	path?: string;
	value?: unknown;
	beforeRevision?: number;
	afterRevision?: number;
	dependencies?: readonly string[];
	issuedAt: string;
}): SyncOperation {
	return {
		id: input.id,
		vaultId: input.vaultId,
		sourceId: input.sourceId,
		actorId: input.actorId,
		entityType: input.entityType,
		entityId: input.entityId,
		opType: input.opType,
		...(input.path !== undefined ? { path: input.path } : {}),
		...(input.value !== undefined ? { value: input.value } : {}),
		...(input.beforeRevision !== undefined ? { beforeRevision: input.beforeRevision } : {}),
		...(input.afterRevision !== undefined ? { afterRevision: input.afterRevision } : {}),
		dependencies: input.dependencies ? [...input.dependencies] : [],
		issuedAt: input.issuedAt,
		schemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
	};
}
