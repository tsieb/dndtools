import type { ActorId } from '../state/ids';
import type { Actor, ActorRole, PermissionGrant, PermissionState } from '../state/permission-state';
import type { SessionState } from '../state/session-state';
import { isGrantActive } from '../permissions/grant-records';
import { CAPABILITY_SCHEMA_VERSION } from '../permissions/capability-schema';

/**
 * COLLAB-001 — the SESSION JOIN / IDENTITY model (Architecture Contract 3 "Session Join Model"; NIST
 * session/authentication guidance). The DM starts a collaborative session and issues INVITATIONS or local
 * PAIRING CODES that authenticate a joiner as DM, Player, or Observer. This module is the single pure
 * Processing-Core policy that:
 *
 *   1. AUTHENTICATES a join attempt against a DM-issued credential (invitation or local pairing code) and,
 *      on success, returns the {@link SessionJoinResult} filtered for that participant — role, participant
 *      id, grants, visible scenes, capability-schema version, and sync cursor (Contract 3 Session Join
 *      rule 3 — "On join, the participant receives role, grant, visible-scene, and sync-cursor data
 *      filtered for that participant").
 *   2. FAILS CLOSED on an EXPIRED or REVOKED credential, disclosing NO session state (COLLAB-001 AC2). A
 *      bad credential yields a single generic denial — never a role, never a participant id, never a scene
 *      list, never anything from which the existence/shape of the session could be inferred.
 *   3. Supports LOCAL PAIRED JOIN when the remote network is unavailable: a participant already
 *      authenticated by a local pairing code can continue to join according to platform capability,
 *      WITHOUT contacting a remote service (COLLAB-001 AC3 / Contract 2 "Offline: degrade").
 *
 * Per ADR-014 the LIVE invitation TRANSPORT (issuing codes over a network, the auth handshake) is
 * deferred. This is the POLICY a transport plugs into: the transport validates the wire credential, then
 * hands the matched, DM-issued {@link SessionInvitation} + the join channel to {@link joinSession}, which
 * decides — fail closed — whether the join is admitted and what filtered identity payload it receives. It
 * is pure + deterministic over plain data (apart from the `now` clock passed in for expiry) — no
 * DOM/storage/network/entropy.
 *
 * It REUSES the PERM model: grants come from {@link PermissionState} filtered to the joiner; visible scenes
 * are the scenes the joiner may see; the capability-schema version is the shared `CAPABILITY_SCHEMA_VERSION`
 * (so a capability cache can detect a schema change — Contract 3 Session Join rule 4). It does NOT
 * re-implement permission/visibility evaluation; visible scenes are supplied by the actor-filtered scene
 * read (kept out of this module to avoid a query→collab dependency cycle and to keep this policy pure).
 */

/** How a participant authenticated: a remote INVITATION token, or a LOCAL PAIRING CODE (offline-capable). */
export type JoinCredentialKind = 'invitation' | 'local-pairing-code';

/** A join CHANNEL: whether the remote network is reachable for this attempt. */
export type JoinChannel = 'remote' | 'local-paired';

/**
 * The lifecycle of a DM-issued credential, as it affects a join attempt. Only `active` admits a join; every
 * other state fails closed and discloses no session state.
 */
export type InvitationStatus = 'active' | 'expired' | 'revoked' | 'consumed';

export const SESSION_INVITATION_SCHEMA_VERSION = 1 as const;

/**
 * ONE DM-issued credential that authenticates a single participant. The credential PRE-DECLARES the role,
 * the participant id it admits, and (for a player) the grants and visible scenes that participant will
 * receive. It carries a hashed/opaque `secretFingerprint` (never a raw code — the transport matches the
 * wire credential to this record); this module never sees or compares the raw secret.
 *
 * CRITICAL (COLLAB-001 AC2): a credential that is expired/revoked/consumed must yield a join that discloses
 * NOTHING. The role/participant/grant/scene fields here are the ADMITTED identity for a SUCCESSFUL join;
 * they are returned ONLY when the credential authenticates, never on a failed attempt.
 */
export interface SessionInvitation {
	id: string;
	sessionId: string;
	/** The role this credential admits. An observer credential can never carry write grants (Contract 3). */
	role: ActorRole;
	/** The participant actor id this credential admits. The joiner is bound to this identity. */
	participantActorId: ActorId;
	/** How the participant authenticates (invitation token vs local pairing code). */
	credentialKind: JoinCredentialKind;
	/**
	 * The credential lifecycle. Fail closed: anything other than `active` denies the join with no
	 * disclosure. Absent ⇒ treated as `revoked` on hydrate (the most protective default).
	 */
	status: InvitationStatus;
	/**
	 * Optional ISO expiry. When set and at/before `now`, the credential is EXPIRED and the join fails
	 * closed regardless of `status`. Absent/`null` ⇒ the credential does not expire by time.
	 */
	expiresAt?: string | null;
	/**
	 * Whether this credential is usable for a LOCAL PAIRED join when the remote network is unavailable
	 * (COLLAB-001 AC3). A local pairing code is offline-capable; a remote invitation requires the network.
	 */
	localPairingCapable: boolean;
	issuedBy: ActorId;
	issuedAt: string;
}

/**
 * The result of a SUCCESSFUL join — the participant identity payload, filtered for that participant
 * (Contract 3 Session Join Model `SessionJoinResult`). Every field is scoped to the joiner: the grants are
 * the joiner's active grants only; the visible scenes are the scenes the joiner may see; the sync cursor is
 * the joiner's catch-up cursor (null for a fresh join). The capability-schema version lets a participant
 * cache detect a schema change and re-evaluate (Contract 3 Session Join rule 4).
 */
export interface SessionJoinResult {
	sessionId: string;
	participantActorId: ActorId;
	role: ActorRole;
	/** The joiner's ACTIVE grants only (expired/revoked grants are excluded — never restored on join). */
	grants: PermissionGrant[];
	/** The scene ids the joiner may see (supplied by the actor-filtered scene read). */
	visibleSceneIds: string[];
	/** The capability-set schema version, so a participant cache can detect a schema change. */
	capabilitySchemaVersion: string;
	/** The joiner's sync cursor (the last op id they have applied), or null for a fresh join. */
	syncCursor: string | null;
}

/** Why a join attempt was DENIED. Each maps to a single generic denial that discloses no session state. */
export type JoinDenialReason =
	| 'invalid-credential' // no matching credential, or the credential is revoked/consumed
	| 'expired-credential' // the credential's expiry has passed
	| 'network-unavailable' // a remote-only credential attempted over an unreachable network
	| 'identity-mismatch' // the credential's participant id is not a registered participant
	| 'role-mismatch'; // the registered actor's role does not match the credential's admitted role

/**
 * The outcome of a join attempt. A success carries the filtered {@link SessionJoinResult}. A failure
 * carries ONLY a structured reason + a generic message — NO role, NO participant id, NO scenes, NOTHING
 * from which session state could be inferred (COLLAB-001 AC2 non-disclosure).
 */
export type SessionJoinOutcome =
	| { admitted: true; result: SessionJoinResult }
	| { admitted: false; reason: JoinDenialReason; message: string };

const DENIAL_MESSAGES: Record<JoinDenialReason, string> = {
	'invalid-credential': 'This invitation is not valid. Ask the DM for a new invitation.',
	'expired-credential': 'This invitation has expired. Ask the DM for a new invitation.',
	'network-unavailable':
		'You are offline and this invitation needs a connection. Reconnect or use a local pairing code.',
	'identity-mismatch': 'This invitation could not be matched to a participant.',
	'role-mismatch': 'This invitation could not be matched to a participant.',
};

function deny(reason: JoinDenialReason): SessionJoinOutcome {
	return { admitted: false, reason, message: DENIAL_MESSAGES[reason] };
}

/**
 * Whether a credential is EXPIRED relative to `now`. Fail closed: a malformed `expiresAt` is treated as
 * expired (a credential whose expiry cannot be parsed must not admit a join).
 */
export function isInvitationExpired(invitation: SessionInvitation, now?: string): boolean {
	const expiresAt = invitation.expiresAt;
	if (expiresAt === undefined || expiresAt === null) return false;
	const expiry = Date.parse(expiresAt);
	if (Number.isNaN(expiry)) return true; // unparsable expiry ⇒ fail closed (expired)
	if (now === undefined) return false; // no clock supplied ⇒ time-expiry not evaluated
	const current = Date.parse(now);
	if (Number.isNaN(current)) return true; // unparsable clock ⇒ fail closed
	return current >= expiry;
}

/**
 * Inputs for building the filtered identity payload of a SUCCESSFUL join. The visible scene ids are
 * supplied by the caller (the actor-filtered scene read) so this module stays pure and free of a
 * query-layer dependency. The sync cursor is the joiner's last-applied op id (null for a fresh join).
 */
export interface JoinIdentityInput {
	session: SessionState;
	permission: PermissionState;
	/** The scene ids the joiner may see, from the actor-filtered scene read. */
	visibleSceneIds: readonly string[];
	/** The joiner's sync cursor (last applied op id), or null for a fresh join. */
	syncCursor?: string | null;
	/** The current time, for grant-expiry filtering. Absent ⇒ expiry is not applied. */
	now?: string;
}

/**
 * The joiner's ACTIVE grants only. An expired/revoked grant is EXCLUDED — a join never restores a stale
 * capability from a credential or cache (this is the join-time half of the COLLAB-002 "revoked grants are
 * not restored" guarantee). Observers never carry grants (Contract 3), so an observer always gets `[]`.
 */
export function activeGrantsForParticipant(
	permission: PermissionState,
	participant: Actor,
	now?: string,
): PermissionGrant[] {
	if (participant.role !== 'player') return [];
	return permission.grants
		.filter((grant) => grant.playerActorId === participant.id && isGrantActive(grant, now))
		.slice()
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * COLLAB-001 — AUTHENTICATE a join attempt and, on success, return the filtered {@link SessionJoinResult}.
 *
 * The transport has already matched the wire credential to `invitation` (this module never sees the raw
 * secret). Given the matched credential + the join channel + the live permission/session state, this
 * decides — fail closed — whether the join is admitted:
 *
 *   1. CREDENTIAL VALID — `status === 'active'`, else `invalid-credential` (revoked/consumed) with NO
 *      disclosure.
 *   2. NOT EXPIRED — `expiresAt` not at/before `now`, else `expired-credential` with NO disclosure.
 *   3. CHANNEL — a `local-paired` channel (remote network unavailable) is admitted only when the credential
 *      is `localPairingCapable`; a remote-only credential over a `local-paired` channel fails closed with
 *      `network-unavailable` (COLLAB-001 AC3 degrade). A `remote` channel admits any active credential.
 *   4. IDENTITY — the credential's `participantActorId` must be a REGISTERED participant, and that actor's
 *      role must MATCH the credential's admitted role (fail closed: a credential can never elevate an
 *      actor's role, e.g. admit an observer actor as a player).
 *
 * Only when ALL checks pass does the result expose the role/participant/grants/scenes/cursor — and even
 * then only the joiner's own filtered data. A failure exposes only a generic reason + message.
 */
export function joinSession(
	invitation: SessionInvitation,
	channel: JoinChannel,
	identity: JoinIdentityInput,
	now?: string,
): SessionJoinOutcome {
	// 1. CREDENTIAL VALID — only an `active` credential admits a join; anything else discloses nothing.
	if (invitation.status !== 'active') return deny('invalid-credential');

	// 2. NOT EXPIRED — an expired credential discloses nothing (COLLAB-001 AC2).
	if (isInvitationExpired(invitation, now)) return deny('expired-credential');

	// 3. CHANNEL — local paired join requires a local-pairing-capable credential when remote is unavailable.
	if (channel === 'local-paired' && !invitation.localPairingCapable) {
		return deny('network-unavailable');
	}

	// 4. IDENTITY — the credential binds to a registered participant whose role matches the admitted role.
	const actor = identity.permission.actors[invitation.participantActorId];
	if (!actor) return deny('identity-mismatch');
	if (actor.role !== invitation.role) return deny('role-mismatch');

	const result: SessionJoinResult = {
		sessionId: invitation.sessionId,
		participantActorId: actor.id,
		role: actor.role,
		grants: activeGrantsForParticipant(identity.permission, actor, now ?? identity.now),
		visibleSceneIds: [...identity.visibleSceneIds].sort(),
		capabilitySchemaVersion: CAPABILITY_SCHEMA_VERSION,
		syncCursor: identity.syncCursor ?? null,
	};
	return { admitted: true, result };
}

/**
 * Hydrate a possibly-partial persisted invitation fail-closed: an absent `status` becomes `revoked` (the
 * most protective default — an unrecognized/partial credential never admits a join), and `localPairingCapable`
 * defaults to `false` (a credential is offline-capable only when explicitly declared so).
 */
export function ensureSessionInvitation(
	invitation: Partial<SessionInvitation> & Pick<SessionInvitation, 'id' | 'sessionId'>,
): SessionInvitation {
	return {
		id: invitation.id,
		sessionId: invitation.sessionId,
		role: invitation.role ?? 'observer',
		participantActorId: invitation.participantActorId ?? '',
		credentialKind: invitation.credentialKind ?? 'invitation',
		status: invitation.status ?? 'revoked',
		expiresAt: invitation.expiresAt ?? null,
		localPairingCapable: invitation.localPairingCapable ?? false,
		issuedBy: invitation.issuedBy ?? '',
		issuedAt: invitation.issuedAt ?? '',
	};
}
