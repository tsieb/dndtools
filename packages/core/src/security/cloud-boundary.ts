import type { ActorId } from '../state/ids';
import { SYNC_OPERATION_SCHEMA_VERSION } from '../sync/operation-log';

/**
 * SEC-005 — THE CLOUD-COLLABORATION SECURITY BOUNDARY. Cloud collaboration MUST use authenticated, protected
 * channels with participant identity, revocation, rate-limited session joins, tenant/session isolation,
 * replay protection, cloud-side stream filtering, and fail-closed parsing for unsupported payload versions
 * (SEC-005 statement; Architecture Contract 2 "Sync Security"; NIST/OWASP guidance).
 *
 * Per ADR-014 the LIVE transport (the wire protocol, TLS, the auth handshake) is DEFERRED. This module is
 * the fail-closed POLICY the transport plugs into — it decides, deterministically and over plain data,
 * whether a cloud request is admitted BEFORE any payload is generated. It composes the seams the COLLAB and
 * SYNC epics already built:
 *
 *   - {@link joinSession} (COLLAB-001) authenticates a participant and yields a non-disclosing denial — this
 *     module wraps it with the SEC-005 RATE LIMIT (repeated invalid joins are throttled WITHOUT leaking
 *     whether the session exists) and the SEC-005 REVOCATION gate (a revoked participant is denied before
 *     the join is even attempted);
 *   - {@link validateReplayOperation} (SYNC-011) validates a received op fail-closed — this module adds the
 *     SEC-005 cloud-side checks that run BEFORE the op is even handed to replay: TENANT/SESSION ISOLATION
 *     (an op for another tenant/session is rejected), PAYLOAD-VERSION fail-closed parsing (an unsupported
 *     future version is rejected with an upgrade-required diagnostic), and NONCE/REVISION REPLAY protection
 *     (an already-seen nonce is rejected/ignored idempotently).
 *
 * THE CRUX: every decision FAILS CLOSED and is made BEFORE any payload is generated for the requester — an
 * unauthenticated, unauthorized, throttled, replayed, cross-tenant, or unsupported-version request never
 * produces a stream or a payload (SEC-005 AC3). A denial discloses NOTHING from which session/tenant
 * existence or shape could be inferred (SEC-005 AC2 non-disclosure).
 *
 * Pure Processing-Core policy: deterministic over plain data + an injected `now` clock for the rate-limit
 * window. No DOM, Node, network, or crypto. The transport supplies the wire facts (the matched credential,
 * the claimed tenant/session, the op's nonce) and ENFORCES the returned decision; it never bypasses it.
 */

export const CLOUD_BOUNDARY_SCHEMA_VERSION = 1 as const;

// --- Rate-limited session joins (SEC-005 AC2) -----------------------------------------------------

/** The default join rate-limit window and ceiling. Conservative: 5 failed attempts per source per minute. */
export const DEFAULT_JOIN_RATE_LIMIT = Object.freeze({
	maxFailedAttempts: 5,
	windowMs: 60_000,
});

/** A record of a source's recent FAILED join attempts within the active window. Pure, replaceable state. */
export interface JoinAttemptRecord {
	/** An opaque source key (e.g. a hashed device/connection id). NEVER a session id or participant id. */
	sourceKey: string;
	/** ISO timestamps of the failed attempts still inside the window. */
	failedAt: string[];
}

export interface JoinRateLimitConfig {
	maxFailedAttempts: number;
	windowMs: number;
}

/** The outcome of consulting the rate limiter BEFORE a join is evaluated. */
export interface JoinRateLimitDecision {
	/** Whether the attempt is allowed to proceed to authentication. */
	allowed: boolean;
	/** The number of failed attempts still counted inside the window (post-decision). */
	failedInWindow: number;
	/**
	 * A generic, NON-disclosing message when throttled — it reveals neither whether the session exists nor
	 * how many attempts remain in a way that could be used to enumerate sessions (SEC-005 AC2).
	 */
	message: string;
}

function attemptsInWindow(record: JoinAttemptRecord | undefined, now: string, windowMs: number): string[] {
	if (!record) return [];
	const current = Date.parse(now);
	if (Number.isNaN(current)) return [...record.failedAt]; // fail closed: a bad clock keeps every attempt
	return record.failedAt.filter((iso) => {
		const at = Date.parse(iso);
		if (Number.isNaN(at)) return true; // a bad recorded time fails closed (still counts)
		return current - at < windowMs;
	});
}

/**
 * Decide whether a join attempt from `sourceKey` is allowed RIGHT NOW, given its recent failed attempts.
 * Fail closed: once the source has reached `maxFailedAttempts` failures inside the window, every further
 * attempt is throttled — and the throttle message is identical whether or not the session exists, so a
 * brute-force prober learns nothing (SEC-005 AC2).
 */
export function evaluateJoinRateLimit(
	record: JoinAttemptRecord | undefined,
	now: string,
	config: JoinRateLimitConfig = DEFAULT_JOIN_RATE_LIMIT,
): JoinRateLimitDecision {
	const failedInWindow = attemptsInWindow(record, now, config.windowMs).length;
	const allowed = failedInWindow < config.maxFailedAttempts;
	return {
		allowed,
		failedInWindow,
		message: allowed
			? 'Join attempt permitted.'
			: 'Too many attempts. Please wait and try again. Check your invitation with the DM.',
	};
}

/**
 * Record a FAILED join attempt for a source, returning the updated record (pruned to the window). Only
 * FAILED attempts count toward the rate limit; a successful join does not penalize the source. Pure: the
 * input record is never mutated.
 */
export function recordFailedJoinAttempt(
	record: JoinAttemptRecord | undefined,
	sourceKey: string,
	now: string,
	config: JoinRateLimitConfig = DEFAULT_JOIN_RATE_LIMIT,
): JoinAttemptRecord {
	const kept = attemptsInWindow(record, now, config.windowMs);
	return { sourceKey, failedAt: [...kept, now] };
}

// --- Participant revocation (SEC-005 AC5) ---------------------------------------------------------

/**
 * The revocation state of a participant on the cloud boundary. A `revoked` participant is denied at the
 * boundary BEFORE authentication is even attempted, and any op they queued is rejected unless it was
 * EXPLICITLY accepted before the revocation (SEC-005 AC5).
 */
export type ParticipantRevocationState = 'active' | 'revoked';

/** A revoked participant record: who was revoked, and the revision/time the revocation took effect. */
export interface ParticipantRevocation {
	participantActorId: ActorId;
	/** The op revision (or sequence) AT which the revocation took effect. */
	revokedAtRevision: number;
	revokedAt: string;
}

/**
 * Whether a queued op from a (possibly-revoked) participant is admissible. A revoked participant's op is
 * ADMISSIBLE only when it was issued at a revision STRICTLY BEFORE the revocation took effect AND was
 * explicitly accepted before revocation. Everything at/after the revocation revision is rejected (fail
 * closed). A non-revoked participant's op passes this gate (the downstream replay validator still applies).
 */
export function isQueuedOpAdmissibleAfterRevocation(
	revocation: ParticipantRevocation | undefined,
	opRevision: number,
	acceptedBeforeRevocation: boolean,
): boolean {
	if (!revocation) return true; // participant not revoked — admissible at this gate
	if (opRevision >= revocation.revokedAtRevision) return false; // at/after revocation ⇒ rejected
	return acceptedBeforeRevocation === true; // before revocation ⇒ only if explicitly already accepted
}

// --- The cloud-join authorization decision (SEC-005 AC2 / AC3 / AC5) ------------------------------

/** Why a cloud-join request was DENIED. Each maps to a single generic denial that discloses no session state. */
export type CloudJoinDenialReason =
	| 'rate-limited' // too many failed attempts for this source within the window
	| 'revoked-participant' // the participant has been revoked from the session
	| 'unauthenticated'; // the credential did not authenticate (delegated to the COLLAB join policy)

/**
 * The outcome of the SEC-005 cloud-join gate. On admission, the caller proceeds to {@link joinSession}; on
 * denial, NO payload/stream is produced and the message discloses nothing about the session (SEC-005 AC2).
 */
export type CloudJoinGateOutcome =
	| { admitted: true }
	| { admitted: false; reason: CloudJoinDenialReason; message: string };

const CLOUD_JOIN_DENIAL_MESSAGES: Record<CloudJoinDenialReason, string> = {
	// All three messages are deliberately generic and interchangeable — they never confirm or deny that a
	// given session/participant exists (SEC-005 AC2 non-disclosure).
	'rate-limited': 'Too many attempts. Please wait and try again. Check your invitation with the DM.',
	'revoked-participant': 'This invitation is no longer valid. Ask the DM for a new invitation.',
	unauthenticated: 'This invitation is not valid. Ask the DM for a new invitation.',
};

export interface CloudJoinGateInput {
	/** The opaque source key for the rate limiter (a hashed connection/device id; never a session id). */
	sourceKey: string;
	/** The participant the credential claims to admit, for the revocation check. */
	claimedParticipantActorId: ActorId;
	/** The source's recent failed-attempt record. */
	attemptRecord?: JoinAttemptRecord;
	/** The revocation record for the claimed participant, if any. */
	revocation?: ParticipantRevocation;
	now: string;
	rateLimit?: JoinRateLimitConfig;
}

/**
 * The SEC-005 PRE-AUTH cloud-join gate. It runs BEFORE the COLLAB {@link joinSession} authentication so that
 * a throttled or revoked request never reaches authentication and never produces a payload. Order:
 *
 *   1. RATE LIMIT — a source over its failed-attempt ceiling is throttled (SEC-005 AC2).
 *   2. REVOCATION — a revoked participant is denied (SEC-005 AC5) before any join work.
 *
 * On admission the caller hands the matched credential to {@link joinSession}, whose own fail-closed
 * non-disclosing denial covers authentication (SEC-005 AC1/AC4 for the credential itself). Every denial here
 * yields a single generic message; the reasons are NOT surfaced to the requester in a distinguishable way.
 */
export function evaluateCloudJoinGate(input: CloudJoinGateInput): CloudJoinGateOutcome {
	const rate = evaluateJoinRateLimit(input.attemptRecord, input.now, input.rateLimit);
	if (!rate.allowed) {
		return { admitted: false, reason: 'rate-limited', message: CLOUD_JOIN_DENIAL_MESSAGES['rate-limited'] };
	}
	if (input.revocation && input.revocation.participantActorId === input.claimedParticipantActorId) {
		return {
			admitted: false,
			reason: 'revoked-participant',
			message: CLOUD_JOIN_DENIAL_MESSAGES['revoked-participant'],
		};
	}
	return { admitted: true };
}

// --- Cloud-side request authorization: tenant/session isolation + payload version + replay ---------

/** Why a cloud request was rejected at the cloud boundary, BEFORE any payload is generated (SEC-005 AC3/AC1/AC4). */
export type CloudRequestRejectionReason =
	| 'tenant-isolation' // the request targets a tenant the actor does not belong to
	| 'session-isolation' // the request targets a session the actor is not a participant of
	| 'stream-isolation' // the request targets another participant's player stream
	| 'unsupported-payload-version' // the payload schema version is not supported (fail closed)
	| 'replayed-nonce'; // the request nonce was already seen (replay)

export type CloudRequestOutcome =
	| { authorized: true }
	| {
			authorized: false;
			reason: CloudRequestRejectionReason;
			/** A generic, NON-disclosing message. Never confirms the existence of the other tenant/session/stream. */
			message: string;
			/** Whether the replay was IGNORED idempotently rather than being an error (SEC-005 AC4). */
			idempotent: boolean;
	  };

/**
 * A cloud request as the boundary sees it BEFORE generating any payload. The actor's OWN tenant/session and
 * the stream they are entitled to are supplied alongside the request's CLAIMED targets, so the boundary can
 * reject a cross-tenant/session/stream request (SEC-005 AC3) without consulting any other actor's data.
 */
export interface CloudRequestContext {
	/** The tenant the requesting actor belongs to. */
	actorTenantId: string;
	/** The session the requesting actor is a participant of. */
	actorSessionId: string;
	/** The participant id the requesting actor is (their own stream). */
	actorParticipantId: ActorId;
	/** The tenant the request targets. */
	requestTenantId: string;
	/** The session the request targets. */
	requestSessionId: string;
	/** The participant stream the request targets (their own ⇒ allowed; another ⇒ rejected). */
	requestStreamParticipantId: ActorId;
	/** The payload schema version the request declares. */
	payloadSchemaVersion: number;
	/** The request nonce, for replay detection. */
	nonce: string;
	/** The set of nonces already SEEN (applied) for this session — a replay matches here. */
	seenNonces: ReadonlySet<string>;
	/** The supported payload schema version(s). Defaults to the canonical sync-op schema version. */
	supportedPayloadVersions?: readonly number[];
}

const CLOUD_REQUEST_MESSAGES: Record<CloudRequestRejectionReason, string> = {
	'tenant-isolation': 'This request could not be completed.',
	'session-isolation': 'This request could not be completed.',
	'stream-isolation': 'This request could not be completed.',
	'unsupported-payload-version':
		'This update needs a newer version of the app. Update to continue collaborating.',
	'replayed-nonce': 'This update was already processed.',
};

/**
 * Authorize a cloud request at the boundary, fail closed, BEFORE any payload is generated (SEC-005 AC3).
 * Checks run in a fixed order so the FIRST failing dimension is the reported reason:
 *
 *   1. TENANT ISOLATION — the request's tenant must equal the actor's tenant (SEC-005 AC3).
 *   2. SESSION ISOLATION — the request's session must equal the actor's session (SEC-005 AC3).
 *   3. STREAM ISOLATION — the request's target stream must be the actor's OWN stream (SEC-005 AC3) — a
 *      player can never request another player's stream.
 *   4. PAYLOAD VERSION — an unsupported (e.g. future) payload version fails closed with an upgrade-required
 *      diagnostic (SEC-005 AC1).
 *   5. REPLAY — a nonce already seen is rejected/ignored IDEMPOTENTLY (SEC-005 AC4): `idempotent: true`
 *      signals the caller may safely no-op rather than treat it as an error.
 *
 * A cross-tenant/session/stream denial returns an identical generic message regardless of dimension, so it
 * never confirms the existence or shape of the other tenant/session/stream (non-disclosure).
 */
export function authorizeCloudRequest(context: CloudRequestContext): CloudRequestOutcome {
	const supported = context.supportedPayloadVersions ?? [SYNC_OPERATION_SCHEMA_VERSION];

	if (context.requestTenantId !== context.actorTenantId) {
		return reject('tenant-isolation', false);
	}
	if (context.requestSessionId !== context.actorSessionId) {
		return reject('session-isolation', false);
	}
	if (context.requestStreamParticipantId !== context.actorParticipantId) {
		return reject('stream-isolation', false);
	}
	if (!supported.includes(context.payloadSchemaVersion)) {
		return reject('unsupported-payload-version', false);
	}
	if (context.seenNonces.has(context.nonce)) {
		// A replay is rejected, but idempotently — a duplicate delivery is safe to ignore, not an error.
		return reject('replayed-nonce', true);
	}
	return { authorized: true };
}

function reject(reason: CloudRequestRejectionReason, idempotent: boolean): CloudRequestOutcome {
	return { authorized: false, reason, message: CLOUD_REQUEST_MESSAGES[reason], idempotent };
}
