import {
	containsSensitiveData,
	redactValue,
	REDACTED_SECRET,
} from '../diagnostics/redaction';
import {
	declaredClassification,
	type StorageDataCategory,
} from '../sync/storage-classification';

/**
 * SEC-004 — THE SECRET-CUSTODY POLICY. Auth tokens, refresh tokens, session secrets, cloud credentials,
 * and MCP agent secrets MUST live in the OS / platform credential store where one is available, and MUST
 * NEVER be written — in plaintext — to vault markdown, an exported package, a log, a diagnostics bundle,
 * the durable operation log, a sync stream, or a player stream "by default" (SEC-004 statement;
 * Architecture Contract 2 "Device-local only"; NIST session-secret guidance).
 *
 * This module does NOT introduce a parallel secrets store or a crypto framework (ADR-014 defers real key
 * custody/crypto). It is the single declared POLICY + the fail-closed BOUNDARY GUARD that composes the two
 * security choke-points already in this codebase:
 *
 *   1. the diagnostics REDACTION guard (`diagnostics/redaction.ts`) — the same secret-shaped/path scrubber
 *      that already scrubs support bundles, MCP responses, and content exports; and
 *   2. the SYNC STORAGE-CLASSIFICATION registry (`sync/storage-classification.ts`) — which already declares
 *      `auth-refresh-token` / `os-credential-record` as `device-local` (never cloud-syncable).
 *
 * What this module adds is the SECRET-KIND catalogue (the exact secret material SEC-004 enumerates and the
 * device-local storage category it must occupy), the OS/platform credential-store PREFERENCE policy (where
 * the secret should live, and the fail-closed fallback when no OS store is available), and a single
 * `assertNoSecretLeak` boundary guard that proves — fail closed — that a payload destined for a durable
 * "channel" (vault / op-log / sync stream / export / diagnostics / log / error message / player stream)
 * carries NO secret in plaintext. The guard reuses `containsSensitiveData`, so the SAME scrubber that proves
 * a support bundle is clean proves these channels are clean too — there is one definition of "a secret",
 * never two that can drift.
 *
 * Pure Processing-Core policy: deterministic over plain data. No DOM, Node, Svelte, OS-keychain, or crypto
 * APIs — the app's platform adapter implements the actual OS credential-store read/write behind this policy
 * (the seam), and the core only decides WHERE a secret must live and PROVES it never crosses a boundary.
 */

export const SECRET_CUSTODY_SCHEMA_VERSION = 1 as const;

/**
 * Every kind of secret material SEC-004 enumerates. Each is device-local-only and credential-store-preferred.
 * The union is closed (no `string & {}`) on purpose: a NEW secret kind must be DECLARED here so it inherits
 * the custody policy and the leak guard, rather than silently escaping classification (fail closed).
 */
export type SecretKind =
	| 'auth-token' // a short-lived auth/access token
	| 'refresh-token' // a long-lived refresh token
	| 'session-secret' // a session secret / signing key for a live session
	| 'cloud-credential' // a cloud provider credential (e.g. an OAuth client secret / API key)
	| 'mcp-agent-secret'; // an MCP sidecar agent secret / agent identity token

/** The ordered, canonical list of secret kinds the policy governs. */
export const SECRET_KINDS: readonly SecretKind[] = Object.freeze([
	'auth-token',
	'refresh-token',
	'session-secret',
	'cloud-credential',
	'mcp-agent-secret',
]);

/**
 * Where a secret of a given kind MUST be stored. `os-credential-store` is the required home when the
 * platform offers one (OS keychain / Keystore / Credential Manager); `encrypted-device-local` is the
 * fail-closed fallback used ONLY when no OS store is available — never plaintext, never cloud. A secret is
 * NEVER `vault-markdown`, `cloud`, `operation-log`, or `export`; those are not even options.
 */
export type SecretStorageLocation = 'os-credential-store' | 'encrypted-device-local';

/**
 * The storage category every secret kind maps to in the SYNC classification registry. All secret kinds map
 * to a device-local category, so the existing cloud-payload guard already refuses to ship them to the cloud.
 * `auth-token` / `refresh-token` / `session-secret` are `auth-refresh-token`; `cloud-credential` /
 * `mcp-agent-secret` are `os-credential-record`.
 */
const SECRET_STORAGE_CATEGORY: Readonly<Record<SecretKind, StorageDataCategory>> = Object.freeze({
	'auth-token': 'auth-refresh-token',
	'refresh-token': 'auth-refresh-token',
	'session-secret': 'auth-refresh-token',
	'cloud-credential': 'os-credential-record',
	'mcp-agent-secret': 'os-credential-record',
});

/** Human-facing labels for each secret kind, for a custody-status / settings surface. */
export const SECRET_KIND_LABELS: Readonly<Record<SecretKind, string>> = Object.freeze({
	'auth-token': 'Authentication token',
	'refresh-token': 'Refresh token',
	'session-secret': 'Session secret',
	'cloud-credential': 'Cloud credential',
	'mcp-agent-secret': 'MCP agent secret',
});

/** The device-local storage category a secret kind must occupy (never a cloud-syncable category). */
export function storageCategoryForSecret(kind: SecretKind): StorageDataCategory {
	return SECRET_STORAGE_CATEGORY[kind];
}

/**
 * The REQUIRED storage location for a secret kind, given whether the platform exposes an OS credential
 * store. Fail closed: when an OS store IS available, the secret MUST live there; when it is not, the
 * secret falls back to `encrypted-device-local` — never plaintext, never the vault, never the cloud. This
 * is the WHERE policy; the app's platform adapter implements the actual read/write.
 */
export function requiredSecretLocation(osCredentialStoreAvailable: boolean): SecretStorageLocation {
	return osCredentialStoreAvailable ? 'os-credential-store' : 'encrypted-device-local';
}

/**
 * Assert that a candidate storage category for a secret is device-local. EVERY secret kind maps to a
 * device-local category by construction, so this composes the SYNC classification registry to PROVE — fail
 * closed — that the registry never reclassifies a secret-bearing category as cloud-syncable. A secret whose
 * declared category resolves to `cloud-syncable` is a policy violation and throws.
 */
export function assertSecretCategoryIsDeviceLocal(kind: SecretKind): void {
	const category = storageCategoryForSecret(kind);
	if (declaredClassification(category) !== 'device-local') {
		throw new Error(
			`Secret kind "${kind}" maps to storage category "${category}", which must be device-local but ` +
				`is declared cloud-syncable. Secrets must never be eligible for cloud storage (SEC-004).`,
		);
	}
}

/** The durable / outbound CHANNEL a payload is destined for — the boundary the secret-leak guard protects. */
export type SecretChannel =
	| 'vault-markdown' // durable vault note/handout markdown
	| 'export-package' // an exported vault / content package
	| 'operation-log' // the durable operation log
	| 'sync-stream' // an outbound cloud sync stream
	| 'player-stream' // a player/observer replication stream
	| 'diagnostics' // a diagnostics / support bundle
	| 'log' // an application log line
	| 'error-message'; // a user-/log-facing error message

/** The canonical list of channels the leak guard protects (every place SEC-004 forbids a plaintext secret). */
export const SECRET_CHANNELS: readonly SecretChannel[] = Object.freeze([
	'vault-markdown',
	'export-package',
	'operation-log',
	'sync-stream',
	'player-stream',
	'diagnostics',
	'log',
	'error-message',
]);

/** A secret-leak finding: the channel the leak was about to cross + the structured reason. */
export interface SecretLeakFinding {
	channel: SecretChannel;
	/** A generic, NON-leaking explanation. Never carries the secret value itself. */
	reason: string;
}

/**
 * Inspect a payload destined for a channel for an unredacted secret, fail closed. The detection reuses the
 * diagnostics redaction guard (`containsSensitiveData`): a value carrying a secret-shaped token, an
 * authorization/bearer string, or a secret-named key whose value is not the redaction placeholder is a leak.
 *
 * CRITICAL: this returns the finding WITHOUT the secret in it — the reason is generic, so a leak can be
 * reported (and a test can assert it) without re-leaking the value through the finding/log.
 */
export function findSecretLeak(payload: unknown, channel: SecretChannel): SecretLeakFinding | null {
	if (!containsSensitiveData(payload)) return null;
	return {
		channel,
		reason:
			`A payload destined for the "${channel}" channel still contains a plaintext secret or ` +
			`absolute path. Secrets (auth/refresh/session/cloud/MCP) must be redacted or kept in the ` +
			`device-local credential store; they may never cross this boundary in plaintext (SEC-004).`,
	};
}

/**
 * Assert that a payload destined for a channel carries NO plaintext secret. Throws fail-closed with the
 * generic finding reason (never the secret). This is the single boundary guard the vault-write / export /
 * op-log-append / sync-send / diagnostics-export / log paths call before a payload is durably written or
 * sent — and the assertion the adversarial tests use as hard evidence (SEC-004 AC1 + AC2).
 */
export function assertNoSecretLeak(payload: unknown, channel: SecretChannel): void {
	const finding = findSecretLeak(payload, channel);
	if (finding) throw new Error(finding.reason);
}

/**
 * Scrub a payload destined for a channel: redact any secret-shaped token / absolute path so it is safe to
 * cross the boundary. This is the same scrub the diagnostics/export paths already use; exposed here so a
 * caller that WANTS to emit a sanitized payload (rather than throw) has one fail-closed scrubber. The result
 * provably passes `assertNoSecretLeak`.
 */
export function scrubForChannel<T>(payload: T): T {
	return redactValue(payload, false) as T;
}

/**
 * The custody status of one secret kind, for an inspectable settings/diagnostics surface. It declares WHERE
 * the secret must live and confirms it is device-local + redaction-guarded — without ever exposing a value.
 */
export interface SecretCustodyStatus {
	kind: SecretKind;
	label: string;
	storageCategory: StorageDataCategory;
	requiredLocation: SecretStorageLocation;
	/** Always true: every secret kind is device-local and never cloud-eligible. */
	deviceLocalOnly: boolean;
	/** The placeholder a leaked-and-then-redacted value would become, for surfacing in a status view. */
	redactedPlaceholder: typeof REDACTED_SECRET;
}

/**
 * Compute the custody status for every secret kind given whether an OS credential store is available. Pure,
 * deterministic, and leak-free (no secret values). The GUI renders this so a user can confirm where their
 * secrets live; the core proves the invariants.
 */
export function describeSecretCustody(osCredentialStoreAvailable: boolean): SecretCustodyStatus[] {
	return SECRET_KINDS.map((kind) => ({
		kind,
		label: SECRET_KIND_LABELS[kind],
		storageCategory: storageCategoryForSecret(kind),
		requiredLocation: requiredSecretLocation(osCredentialStoreAvailable),
		deviceLocalOnly: declaredClassification(storageCategoryForSecret(kind)) === 'device-local',
		redactedPlaceholder: REDACTED_SECRET,
	}));
}
