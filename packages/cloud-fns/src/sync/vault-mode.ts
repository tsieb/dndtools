// ADR-026 phase 2 / RC-CLD-6.1 — the SERVER authority on a vault's privacy mode.
//
// The device-local flag (`apps/gm-react/src/cloud/vaultMode.ts`) is UX state. This module is the
// only thing the cloud may believe: one registration row per vault, written against the
// authenticated Cognito `sub` when the owner gives consent, and read back strongly consistent by any
// request that could widen the trust boundary (threat model T6).
//
// Fail-closed rules, each covered by vault-mode.test.ts:
//   - The mode is never taken from the request. Headers, query strings, token claims and request
//     bodies are not inputs to {@link readVaultModeRegistration} or {@link requireServerReadableVault};
//     only the owner key derived from the verified `sub` is.
//   - No row means Private. An unregistered vault can never be treated as opted in.
//   - A failed or malformed read is a refusal ({@link VaultModeUnavailable}), never a default — not
//     even Private, because a caller that sees "Private" might conclude the read succeeded.
//   - Registration alone opens nothing. {@link requireServerReadableVault} also requires the
//     Cloud-Enhanced decision record imported from `@dndtools/core` to pass `isPlaintextUploadPermitted`,
//     and that record ships unapproved until RC-CLD-6.5.
//
// Tenant isolation: the row lives in the sync table under the same `${sub}#${vaultId}` partition as
// the vault's ciphertext index, and carries `ownerSub`, which the reader re-checks. Account deletion
// (`DELETE /vaults/{vaultId}`) purges it with every other data row, so a deleted vault reads Private.
import {
	DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	isPlaintextUploadPermitted,
	isVaultPrivacyMode,
	type RegisteredVaultPrivacyMode,
} from '@dndtools/core';
import { batchDeleteItems, getItem, putItemConditional } from '../lib/aws.ts';

const SYNC_OPS_TABLE = process.env.SYNC_OPS_TABLE!;

export const MODE_REGISTRATION_SK = 'mode#registration';
const USAGE_SK = 'usage#quota';
const REGISTRATION_SCHEMA_VERSION = '1';
const MAX_OWNER_SUB_CHARS = 128;
const MAX_CONSENT_BODY_BYTES = 1024;

/**
 * Consent versions the server accepts for Cloud-Enhanced. `ADR-042-phase-1` is the disclosure the
 * client records today (`CLOUD_ENHANCED_DISCLOSURE`, which says server features are not in this
 * edition). The version is stored so RC-CLD-6.3's re-consent rule can tell that consent apart from
 * one given for server reads.
 */
export const CLOUD_ENHANCED_CONSENT_VERSIONS: readonly string[] = Object.freeze([
	'ADR-042-phase-1',
]);

/** The authenticated owner of one vault. Both parts come from the server, never the client. */
export interface VaultOwner {
	/** The verified Cognito `sub` from the JWT authorizer. */
	sub: string;
	/** The validated path vault id. */
	vaultId: string;
}

/** What the server knows about a vault's mode. `generation` 0 means no registration row exists. */
export interface VaultModeRegistration {
	mode: RegisteredVaultPrivacyMode;
	registered: boolean;
	generation: number;
	consentVersion?: string;
	consentedAt?: string;
}

/** The registration could not be read or is malformed. Callers must refuse, not default. */
export class VaultModeUnavailable extends Error {}
/** The consent request is malformed. Its message is safe to return. */
export class VaultModeRequestInvalid extends Error {}
/** The registration changed concurrently, or the vault is being purged. Safe to return. */
export class VaultModeConflict extends Error {}
/** The authority does not allow the server to read this vault's content. Safe to return. */
export class ServerReadableRefused extends Error {}

const UNREGISTERED: VaultModeRegistration = Object.freeze({
	mode: 'private-e2ee',
	registered: false,
	generation: 0,
});

function partitionKey(owner: VaultOwner): string {
	if (
		typeof owner.sub !== 'string' ||
		owner.sub.length === 0 ||
		owner.sub.length > MAX_OWNER_SUB_CHARS ||
		/[#/]/.test(owner.sub) ||
		typeof owner.vaultId !== 'string' ||
		owner.vaultId.length === 0 ||
		/[#/]/.test(owner.vaultId)
	) {
		// A key component that could alias another tenant's partition is refused outright.
		throw new VaultModeUnavailable('vault owner is not a valid registration key');
	}
	return `${owner.sub}#${owner.vaultId}`;
}

function registrationKey(owner: VaultOwner) {
	return { vaultId: partitionKey(owner), sk: MODE_REGISTRATION_SK };
}

function parseRegistration(row: Record<string, string>, owner: VaultOwner): VaultModeRegistration {
	const malformed = () => new VaultModeUnavailable('vault mode registration is malformed');
	if (row.vaultId !== partitionKey(owner) || row.sk !== MODE_REGISTRATION_SK) throw malformed();
	// Defence in depth: the partition key already scopes the row, and the owner is re-checked.
	if (row.ownerSub !== owner.sub) throw malformed();
	if (row.schemaVersion !== REGISTRATION_SCHEMA_VERSION) throw malformed();
	if (!isVaultPrivacyMode(row.mode)) throw malformed();
	const generation = Number(row.generation);
	if (!/^\d+$/.test(row.generation ?? '') || !Number.isSafeInteger(generation) || generation < 1) {
		throw malformed();
	}
	if (typeof row.consentedAt !== 'string' || !Number.isFinite(Date.parse(row.consentedAt))) {
		throw malformed();
	}
	if (row.mode === 'cloud-enhanced') {
		if (!CLOUD_ENHANCED_CONSENT_VERSIONS.includes(row.consentVersion ?? '')) throw malformed();
		return {
			mode: 'cloud-enhanced',
			registered: true,
			generation,
			consentVersion: row.consentVersion,
			consentedAt: row.consentedAt,
		};
	}
	if (row.consentVersion !== undefined) throw malformed();
	return { mode: 'private-e2ee', registered: true, generation, consentedAt: row.consentedAt };
}

/**
 * Read the authoritative registration with a strongly consistent read. No row reads as Private;
 * a storage error or a malformed row throws {@link VaultModeUnavailable}.
 */
export async function readVaultModeRegistration(owner: VaultOwner): Promise<VaultModeRegistration> {
	const key = registrationKey(owner);
	let row: Record<string, string> | undefined;
	try {
		row = await getItem(SYNC_OPS_TABLE, key, true);
	} catch (err) {
		console.error('vault mode read failed closed', { sub: owner.sub.slice(0, 8), err });
		throw new VaultModeUnavailable('vault mode registration could not be read');
	}
	if (!row) return { ...UNREGISTERED };
	return parseRegistration(row, owner);
}

/**
 * THE gate every request that would let the server read vault content must pass (RC-CLD-6.2's
 * route, RC-CLD-6.4's feature adapters). Its only input is the authenticated owner. It returns the
 * registration so the caller can fence its write on `generation` against a concurrent mode change.
 */
export async function requireServerReadableVault(
	owner: VaultOwner,
): Promise<VaultModeRegistration> {
	const registration = await readVaultModeRegistration(owner);
	// The record is imported, never accepted from a caller: sanctioning is object identity.
	if (
		!isPlaintextUploadPermitted(registration.mode, DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD)
	) {
		throw new ServerReadableRefused('This vault does not allow server-readable content.');
	}
	return registration;
}

/** Whether the authority currently lets the server read this registration's content. */
export function isServerReadable(registration: VaultModeRegistration): boolean {
	return isPlaintextUploadPermitted(
		registration.mode,
		DNDTOOLS_CLOUD_ENHANCED_SECURITY_DECISION_RECORD,
	);
}

/** The public view of a registration. Generation is internal fencing state and is not returned. */
export function describeRegistration(registration: VaultModeRegistration) {
	return {
		mode: registration.mode,
		registered: registration.registered,
		...(registration.consentVersion ? { consentVersion: registration.consentVersion } : {}),
		...(registration.consentedAt ? { consentedAt: registration.consentedAt } : {}),
		serverReadable: isServerReadable(registration),
	};
}

function parseConsentRequest(body: string | undefined): {
	mode: RegisteredVaultPrivacyMode;
	consentVersion?: string;
} {
	// A consent is two short strings; refuse anything larger before parsing it.
	if (Buffer.byteLength(body ?? '', 'utf8') > MAX_CONSENT_BODY_BYTES) {
		throw new VaultModeRequestInvalid('mode registration body is too large');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(body ?? '');
	} catch {
		throw new VaultModeRequestInvalid('malformed request body');
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new VaultModeRequestInvalid('request body must be an object');
	}
	const value = parsed as Record<string, unknown>;
	// Owner, generation and timestamps are the server's. A body naming any of them is refused
	// rather than silently ignored, so a client cannot believe it set them.
	if (Object.keys(value).some((key) => key !== 'mode' && key !== 'consentVersion')) {
		throw new VaultModeRequestInvalid('mode registration contains unsupported fields');
	}
	if (!isVaultPrivacyMode(value.mode)) {
		throw new VaultModeRequestInvalid('mode must be private-e2ee or cloud-enhanced');
	}
	if (value.mode === 'cloud-enhanced') {
		if (
			typeof value.consentVersion !== 'string' ||
			!CLOUD_ENHANCED_CONSENT_VERSIONS.includes(value.consentVersion)
		) {
			throw new VaultModeRequestInvalid('Cloud-Enhanced needs a recognised consent version');
		}
		return { mode: 'cloud-enhanced', consentVersion: value.consentVersion };
	}
	if (value.consentVersion !== undefined) {
		throw new VaultModeRequestInvalid('Private mode takes no consent version');
	}
	return { mode: 'private-e2ee' };
}

async function vaultAcceptsWrites(owner: VaultOwner): Promise<boolean> {
	let usage: Record<string, string> | undefined;
	try {
		usage = await getItem(SYNC_OPS_TABLE, { vaultId: partitionKey(owner), sk: USAGE_SK }, true);
	} catch (err) {
		console.error('vault mode purge-state read failed closed', { sub: owner.sub.slice(0, 8), err });
		throw new VaultModeUnavailable('vault state could not be read');
	}
	// No usage row: the vault never stored ciphertext, so no purge can be running.
	return !usage || usage.state === 'active';
}

/**
 * Record the owner's consent for a mode. The mode in the body is the owner's choice, and this is
 * the only route that accepts one; owner, generation and consent time are set here. Writes are
 * conditional on the generation read, so two racing consents cannot both believe they won.
 */
export async function recordVaultModeConsent(
	owner: VaultOwner,
	body: string | undefined,
): Promise<VaultModeRegistration> {
	const request = parseConsentRequest(body);
	const current = await readVaultModeRegistration(owner);
	if (
		current.registered &&
		current.mode === request.mode &&
		current.consentVersion === request.consentVersion
	) {
		return current; // replay: keep the original consent time
	}
	const purging = 'This cloud backup is being removed and cannot record a storage mode.';
	if (!(await vaultAcceptsWrites(owner))) throw new VaultModeConflict(purging);
	const key = registrationKey(owner);
	const consentedAt = new Date().toISOString();
	const generation = current.generation + 1;
	const written = await putItemConditional(
		SYNC_OPS_TABLE,
		{
			...key,
			ownerSub: owner.sub,
			mode: request.mode,
			consentVersion: request.consentVersion,
			consentedAt,
			generation,
			schemaVersion: Number(REGISTRATION_SCHEMA_VERSION),
			updatedAt: consentedAt,
		},
		current.registered
			? {
					expression: '#generation = :generation AND #owner = :owner',
					names: { '#generation': 'generation', '#owner': 'ownerSub' },
					values: { ':generation': current.generation, ':owner': owner.sub },
				}
			: { expression: 'attribute_not_exists(#vault)', names: { '#vault': 'vaultId' } },
	);
	if (!written) {
		throw new VaultModeConflict('The storage mode changed on another device. Try again.');
	}
	// Account purge writes its marker before it lists rows. Re-reading after our write means either
	// the purge listing sees this row, or this check sees the marker and removes the row itself.
	if (!(await vaultAcceptsWrites(owner))) {
		await batchDeleteItems(SYNC_OPS_TABLE, [key]);
		throw new VaultModeConflict(purging);
	}
	return {
		mode: request.mode,
		registered: true,
		generation,
		...(request.consentVersion ? { consentVersion: request.consentVersion } : {}),
		consentedAt,
	};
}
