/**
 * SYNC-017 — the ENCRYPTION-PREREQUISITE enablement gate for cloud sync. Default OFF, fail-closed.
 *
 * Architecture Contract 2 + the Security requirements require that cloud sync payloads and stored
 * cloud artifacts follow the RELEASE-APPROVED encryption, key custody, rotation, and recovery model
 * for the vault BEFORE cloud sync can be enabled. ADR-014 explicitly DEFERS the real crypto
 * implementation (encryption, key custody, rotation, recovery, participant cache sealing) to a later
 * ADR. This module is the SEAM that future work plugs into: a declared, typed prerequisite checklist
 * plus a fail-closed enablement gate.
 *
 * Because the crypto implementation is deferred, the prerequisites are declared UNMET by default, so
 * the gate BLOCKS enablement and cloud sync stays DISABLED. This is the intended state today: it
 * proves the security crux (you cannot enable cloud sync without the approved model) without shipping
 * a half-built crypto stack. When a future ADR delivers the model, it supplies a satisfied checklist
 * and the same gate opens — no call-site change.
 *
 * Pure Processing-Core policy: deterministic over the declared prerequisites. No DOM, Node, Svelte,
 * or crypto APIs. The GUI renders the gate status (blocked + the unmet prerequisites) and dispatches
 * an enable intent that the core re-evaluates; it never flips the flag itself.
 */

/**
 * The release-approved security model has four required dimensions (Contract 2 / SYNC-017): the data
 * must be encrypted, keys must have a declared custodian, keys must be rotatable, and a recovery mode
 * must be declared (which MAY be "intentionally unsupported" — see {@link RecoveryDeclaration}).
 */
export type CloudSyncPrerequisiteId =
	| 'encryption-at-rest' // stored cloud artifacts are encrypted at rest
	| 'encryption-in-transit' // sync payloads are encrypted in transit
	| 'key-custody' // a declared key owner/custodian exists for the vault
	| 'key-rotation' // a revoked participant/device key cannot decrypt newly authorized artifacts
	| 'key-recovery'; // a recovery mode is declared (a limitation counts as a declared mode)

/** The ordered, canonical list of prerequisites the gate evaluates. */
export const CLOUD_SYNC_PREREQUISITE_IDS: readonly CloudSyncPrerequisiteId[] = Object.freeze([
	'encryption-at-rest',
	'encryption-in-transit',
	'key-custody',
	'key-rotation',
	'key-recovery',
]);

/** Human-facing labels for each prerequisite, for the gate-status surface. */
export const CLOUD_SYNC_PREREQUISITE_LABELS: Readonly<Record<CloudSyncPrerequisiteId, string>> =
	Object.freeze({
		'encryption-at-rest': 'Encryption at rest for stored cloud artifacts',
		'encryption-in-transit': 'Encryption in transit for sync payloads',
		'key-custody': 'Declared key owner / custody model',
		'key-rotation': 'Key rotation and revocation model',
		'key-recovery': 'Declared key recovery model',
	});

/**
 * How key recovery is offered. Per SYNC-017 AC3, recovery MAY be intentionally unsupported; that is a
 * valid, release-approved declaration, not a missing prerequisite — as long as the limitation is
 * declared so the app can report it without weakening encryption or exposing other vaults.
 */
export type RecoveryDeclaration =
	| 'supported' // a recovery path exists
	| 'unsupported-by-design' // recovery is intentionally unavailable; the limitation is declared
	| 'undeclared'; // not yet declared ⇒ the prerequisite is UNMET (fail closed)

/**
 * The declared encryption / key-custody / rotation / recovery model for a vault. Every flag defaults
 * to the FAIL-CLOSED value, so an absent or partial declaration blocks enablement. This is what a
 * future crypto ADR populates; until then it is the unmet default.
 */
export interface CloudSyncSecurityModel {
	encryptionAtRest: boolean;
	encryptionInTransit: boolean;
	keyCustodyDeclared: boolean;
	keyRotationSupported: boolean;
	recovery: RecoveryDeclaration;
}

/**
 * The declared-unmet default. ADR-014 defers the crypto model, so every flag is fail-closed and
 * recovery is `undeclared`. With this model the gate BLOCKS enablement — the correct posture today.
 */
export const UNMET_CLOUD_SYNC_SECURITY_MODEL: CloudSyncSecurityModel = Object.freeze({
	encryptionAtRest: false,
	encryptionInTransit: false,
	keyCustodyDeclared: false,
	keyRotationSupported: false,
	recovery: 'undeclared',
});

/** True when a recovery declaration counts as satisfying the recovery prerequisite. */
function recoveryPrerequisiteMet(recovery: RecoveryDeclaration): boolean {
	// A declared limitation (`unsupported-by-design`) satisfies the prerequisite (SYNC-017 AC3); only
	// an `undeclared` recovery mode is unmet.
	return recovery === 'supported' || recovery === 'unsupported-by-design';
}

/** The evaluated status of a single prerequisite. */
export interface CloudSyncPrerequisiteStatus {
	id: CloudSyncPrerequisiteId;
	label: string;
	met: boolean;
	/**
	 * Explanation for the user. Unmet prerequisites carry the action needed to satisfy them. For the
	 * `key-recovery` prerequisite specifically, this is ALWAYS populated: when recovery is
	 * `unsupported-by-design`, the limitation is reported to the user even when the prerequisite is
	 * met (SYNC-017 AC3). For other prerequisites the detail is only meaningful when unmet.
	 */
	detail: string;
}

const UNMET_DETAIL: Readonly<Record<CloudSyncPrerequisiteId, string>> = Object.freeze({
	'encryption-at-rest':
		'Stored cloud artifacts must be encrypted at rest under the release-approved model before cloud sync can be enabled.',
	'encryption-in-transit':
		'Sync payloads must be encrypted in transit under the release-approved model before cloud sync can be enabled.',
	'key-custody':
		'A key owner / custody model must be declared and approved before cloud sync can be enabled.',
	'key-rotation':
		'A key rotation/revocation model must be in place so a revoked key cannot decrypt newly authorized artifacts.',
	'key-recovery':
		'A key recovery model (including an intentional "no recovery" declaration) must be declared before cloud sync can be enabled.',
});

const MET_DETAIL = 'Satisfied by the release-approved cloud security model.' as const;

/**
 * Returns a user-facing description of the key-recovery declaration for the `key-recovery`
 * prerequisite status (SYNC-017 AC3). When recovery is `unsupported-by-design`, the approved
 * recovery LIMITATION is surfaced so the app can report it to a user who attempts recovery,
 * without weakening encryption or exposing other vaults.
 */
export function describeRecoveryDeclaration(declaration: RecoveryDeclaration): string {
	switch (declaration) {
		case 'supported':
			return MET_DETAIL;
		case 'unsupported-by-design':
			return (
				'Key recovery is intentionally unsupported by design under the current model. ' +
				'If device access or the local key is lost, encrypted cloud data cannot be recovered. ' +
				'This limitation is declared in the release-approved cloud security decision record.'
			);
		case 'undeclared':
			return UNMET_DETAIL['key-recovery'];
	}
}

/** Evaluate every prerequisite against the declared security model. */
export function evaluateCloudSyncPrerequisites(
	model: CloudSyncSecurityModel = UNMET_CLOUD_SYNC_SECURITY_MODEL,
): CloudSyncPrerequisiteStatus[] {
	const met: Record<CloudSyncPrerequisiteId, boolean> = {
		'encryption-at-rest': model.encryptionAtRest === true,
		'encryption-in-transit': model.encryptionInTransit === true,
		'key-custody': model.keyCustodyDeclared === true,
		'key-rotation': model.keyRotationSupported === true,
		'key-recovery': recoveryPrerequisiteMet(model.recovery),
	};
	return CLOUD_SYNC_PREREQUISITE_IDS.map((id) => ({
		id,
		label: CLOUD_SYNC_PREREQUISITE_LABELS[id],
		met: met[id],
		// key-recovery always surfaces its declaration detail (SYNC-017 AC3: the app must report the
		// approved recovery limitation — including an "unsupported-by-design" declaration — so a user
		// who attempts recovery sees the limitation without weakening encryption or exposing other vaults.
		detail: id === 'key-recovery' ? describeRecoveryDeclaration(model.recovery) : met[id] ? MET_DETAIL : UNMET_DETAIL[id],
	}));
}

/** The result of the enablement gate: whether cloud sync MAY be enabled, and why not. */
export interface CloudSyncGateResult {
	/** Whether cloud sync may be enabled right now. Fail-closed: false unless ALL prerequisites met. */
	canEnable: boolean;
	/** Whether cloud sync is currently enabled. Defaults to false (cloud sync is opt-in, off by default). */
	enabled: boolean;
	prerequisites: CloudSyncPrerequisiteStatus[];
	/** The unmet prerequisite ids, in canonical order. Empty ⇒ the gate would open. */
	unmetPrerequisiteIds: CloudSyncPrerequisiteId[];
	/** A generic, action-oriented summary for the gate-status surface. */
	summary: string;
}

export interface CloudSyncGateInput {
	/** The declared security model. Defaults to the fail-closed unmet model (ADR-014 deferred crypto). */
	securityModel?: CloudSyncSecurityModel;
	/**
	 * Whether cloud sync is currently enabled for the vault. Defaults to false. The gate NEVER reports
	 * `enabled: true` while prerequisites are unmet — an inconsistent stored flag is forced back to
	 * disabled (fail-closed), so a stale/forced flag can never bypass the security model.
	 */
	currentlyEnabled?: boolean;
}

/**
 * The cloud-sync enablement gate (SYNC-017). Fail-closed and default-off:
 *
 *   - `canEnable` is true ONLY when every prerequisite is met. With the deferred-crypto default
 *     model, prerequisites are unmet and `canEnable` is false.
 *   - `enabled` defaults to false (cloud sync is opt-in per vault). Even if a caller passes
 *     `currentlyEnabled: true`, the gate reports `enabled: false` while prerequisites are unmet — a
 *     stored/forced flag can never override the security model.
 *
 * The GUI renders the unmet prerequisites and offers an enable intent; the core re-runs this gate
 * and only the core may consider cloud sync enabled.
 */
export function evaluateCloudSyncGate(input: CloudSyncGateInput = {}): CloudSyncGateResult {
	const model = input.securityModel ?? UNMET_CLOUD_SYNC_SECURITY_MODEL;
	const prerequisites = evaluateCloudSyncPrerequisites(model);
	const unmetPrerequisiteIds = prerequisites.filter((p) => !p.met).map((p) => p.id);
	const canEnable = unmetPrerequisiteIds.length === 0;
	// Fail closed: cloud sync can only be considered enabled when the gate would allow it.
	const enabled = canEnable && input.currentlyEnabled === true;

	const summary = canEnable
		? enabled
			? 'Cloud sync is enabled for this vault under the release-approved security model.'
			: 'Cloud sync is available under the release-approved security model but is not enabled. It is off by default.'
		: `Cloud sync is disabled. ${unmetPrerequisiteIds.length} security prerequisite${
				unmetPrerequisiteIds.length === 1 ? '' : 's'
			} must be satisfied by the release-approved encryption, key custody, rotation, and recovery model before it can be enabled.`;

	return { canEnable, enabled, prerequisites, unmetPrerequisiteIds, summary };
}

/**
 * Convenience predicate: can cloud sync be enabled for this vault right now? Fail-closed — false
 * unless ALL prerequisites are met. Defaults to the deferred-crypto unmet model, so the default
 * answer is false (the security crux this epic proves).
 */
export function canEnableCloudSync(
	model: CloudSyncSecurityModel = UNMET_CLOUD_SYNC_SECURITY_MODEL,
): boolean {
	return evaluateCloudSyncGate({ securityModel: model }).canEnable;
}

/**
 * Whether cloud sync is currently ENABLED for a vault, fail-closed. Cloud sync is opt-in and off by
 * default; it is only ever enabled when the gate allows it AND the stored flag is true. A
 * stored/forced `true` while prerequisites are unmet resolves to `false`.
 */
export function isCloudSyncEnabled(input: CloudSyncGateInput = {}): boolean {
	return evaluateCloudSyncGate(input).enabled;
}
