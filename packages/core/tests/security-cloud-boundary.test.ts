import { describe, expect, it } from 'vitest';
import {
	DEFAULT_JOIN_RATE_LIMIT,
	SYNC_OPERATION_SCHEMA_VERSION,
	authorizeCloudRequest,
	evaluateCloudJoinGate,
	evaluateJoinRateLimit,
	isQueuedOpAdmissibleAfterRevocation,
	recordFailedJoinAttempt,
	type CloudRequestContext,
	type JoinAttemptRecord,
	type ParticipantRevocation,
} from '../src';

/**
 * SEC-005 — adversarial CLOUD-AUTH coverage. Every decision is fail-closed and made BEFORE any payload is
 * generated: an unauthenticated/throttled/revoked/cross-tenant/replayed/unsupported-version request never
 * produces a stream. Denials disclose nothing about session/tenant existence (non-disclosure).
 */

const NOW = '2026-06-05T12:00:00.000Z';

function baseContext(overrides: Partial<CloudRequestContext> = {}): CloudRequestContext {
	return {
		actorTenantId: 'tenant-a',
		actorSessionId: 'session-1',
		actorParticipantId: 'actor-player',
		requestTenantId: 'tenant-a',
		requestSessionId: 'session-1',
		requestStreamParticipantId: 'actor-player',
		payloadSchemaVersion: SYNC_OPERATION_SCHEMA_VERSION,
		nonce: 'nonce-1',
		seenNonces: new Set<string>(),
		...overrides,
	};
}

describe('SEC-005 AC2 — rate-limited joins do not leak session existence', () => {
	it('throttles a source after the failed-attempt ceiling, within the window', () => {
		let record: JoinAttemptRecord | undefined;
		// Drive the source up to the ceiling of failed attempts.
		for (let i = 0; i < DEFAULT_JOIN_RATE_LIMIT.maxFailedAttempts; i += 1) {
			expect(evaluateJoinRateLimit(record, NOW).allowed).toBe(true);
			record = recordFailedJoinAttempt(record, 'src-1', NOW);
		}
		const decision = evaluateJoinRateLimit(record, NOW);
		expect(decision.allowed).toBe(false);
		expect(decision.failedInWindow).toBe(DEFAULT_JOIN_RATE_LIMIT.maxFailedAttempts);
	});

	it('the throttle message reveals neither the session nor whether it exists', () => {
		let record: JoinAttemptRecord | undefined;
		for (let i = 0; i < DEFAULT_JOIN_RATE_LIMIT.maxFailedAttempts; i += 1) {
			record = recordFailedJoinAttempt(record, 'src-1', NOW);
		}
		const msg = evaluateJoinRateLimit(record, NOW).message;
		expect(msg).not.toMatch(/session-1|tenant-a|exist|not found/i);
	});

	it('attempts outside the window are pruned, restoring access', () => {
		let record: JoinAttemptRecord | undefined;
		for (let i = 0; i < DEFAULT_JOIN_RATE_LIMIT.maxFailedAttempts; i += 1) {
			record = recordFailedJoinAttempt(record, 'src-1', NOW);
		}
		const later = '2026-06-05T12:02:00.000Z'; // 2 minutes later — outside the 60s window
		expect(evaluateJoinRateLimit(record, later).allowed).toBe(true);
		expect(evaluateJoinRateLimit(record, later).failedInWindow).toBe(0);
	});
});

describe('SEC-005 AC2 — the pre-auth cloud-join gate (rate limit + revocation), non-disclosing', () => {
	it('admits a within-limit, non-revoked claimant', () => {
		const outcome = evaluateCloudJoinGate({
			sourceKey: 'src-1',
			claimedParticipantActorId: 'actor-player',
			now: NOW,
		});
		expect(outcome.admitted).toBe(true);
	});

	it('denies a throttled source with an interchangeable generic message', () => {
		let record: JoinAttemptRecord | undefined;
		for (let i = 0; i < DEFAULT_JOIN_RATE_LIMIT.maxFailedAttempts; i += 1) {
			record = recordFailedJoinAttempt(record, 'src-1', NOW);
		}
		const outcome = evaluateCloudJoinGate({
			sourceKey: 'src-1',
			claimedParticipantActorId: 'actor-player',
			attemptRecord: record,
			now: NOW,
		});
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('rate-limited');
		expect(outcome.message).not.toMatch(/session|tenant|exist/i);
	});
});

describe('SEC-005 AC5 — a revoked participant is denied and their queued ops are rejected', () => {
	const revocation: ParticipantRevocation = {
		participantActorId: 'actor-player',
		revokedAtRevision: 10,
		revokedAt: NOW,
	};

	it('denies a revoked participant at the join gate (before any payload)', () => {
		const outcome = evaluateCloudJoinGate({
			sourceKey: 'src-1',
			claimedParticipantActorId: 'actor-player',
			revocation,
			now: NOW,
		});
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('revoked-participant');
		// Non-disclosing: never confirms the session exists.
		expect(outcome.message).not.toMatch(/session-1|tenant-a/i);
	});

	it('rejects a revoked participant op at/after the revocation revision; admits a pre-revocation accepted op', () => {
		// At/after the revocation revision ⇒ rejected even if it claims prior acceptance.
		expect(isQueuedOpAdmissibleAfterRevocation(revocation, 10, true)).toBe(false);
		expect(isQueuedOpAdmissibleAfterRevocation(revocation, 11, true)).toBe(false);
		// Before the revocation revision but NOT explicitly accepted ⇒ rejected (fail closed).
		expect(isQueuedOpAdmissibleAfterRevocation(revocation, 9, false)).toBe(false);
		// Before the revocation revision AND explicitly accepted before revocation ⇒ admissible.
		expect(isQueuedOpAdmissibleAfterRevocation(revocation, 9, true)).toBe(true);
	});

	it('a non-revoked participant op passes this gate', () => {
		expect(isQueuedOpAdmissibleAfterRevocation(undefined, 100, false)).toBe(true);
	});
});

describe('SEC-005 AC3 — tenant/session/stream isolation denied before payload generation', () => {
	it('denies a cross-tenant request', () => {
		const out = authorizeCloudRequest(baseContext({ requestTenantId: 'tenant-b' }));
		expect(out.authorized).toBe(false);
		if (out.authorized) return;
		expect(out.reason).toBe('tenant-isolation');
		expect(out.message).not.toMatch(/tenant-b/);
	});

	it('denies a cross-session request', () => {
		const out = authorizeCloudRequest(baseContext({ requestSessionId: 'session-2' }));
		expect(out.authorized).toBe(false);
		if (out.authorized) return;
		expect(out.reason).toBe('session-isolation');
	});

	it("denies a request for another participant's stream", () => {
		const out = authorizeCloudRequest(baseContext({ requestStreamParticipantId: 'actor-other' }));
		expect(out.authorized).toBe(false);
		if (out.authorized) return;
		expect(out.reason).toBe('stream-isolation');
	});

	it('authorizes an in-tenant, in-session, own-stream request', () => {
		expect(authorizeCloudRequest(baseContext()).authorized).toBe(true);
	});
});

describe('SEC-005 AC1 — unsupported payload version fails closed with upgrade-required diagnostic', () => {
	it('rejects a future payload version', () => {
		const out = authorizeCloudRequest(
			baseContext({ payloadSchemaVersion: SYNC_OPERATION_SCHEMA_VERSION + 99 }),
		);
		expect(out.authorized).toBe(false);
		if (out.authorized) return;
		expect(out.reason).toBe('unsupported-payload-version');
		expect(out.message).toMatch(/update|newer version/i);
	});
});

describe('SEC-005 AC4 — replay is rejected/ignored idempotently', () => {
	it('rejects a replayed nonce idempotently', () => {
		const out = authorizeCloudRequest(
			baseContext({ nonce: 'nonce-1', seenNonces: new Set(['nonce-1']) }),
		);
		expect(out.authorized).toBe(false);
		if (out.authorized) return;
		expect(out.reason).toBe('replayed-nonce');
		expect(out.idempotent).toBe(true);
	});

	it('a fresh nonce is authorized', () => {
		const out = authorizeCloudRequest(
			baseContext({ nonce: 'nonce-2', seenNonces: new Set(['nonce-1']) }),
		);
		expect(out.authorized).toBe(true);
	});
});
