import { describe, expect, it } from 'vitest';
import {
	REDACTED_SECRET,
	SECRET_CHANNELS,
	SECRET_KINDS,
	assertNoSecretLeak,
	assertSecretCategoryIsDeviceLocal,
	containsSensitiveData,
	declaredClassification,
	describeSecretCustody,
	findSecretLeak,
	requiredSecretLocation,
	scrubForChannel,
	storageCategoryForSecret,
	type SecretChannel,
} from '../src';

/**
 * SEC-004 — adversarial SECRET-LEAK coverage. A secret planted in a payload destined for ANY durable /
 * outbound channel (vault markdown, export, op-log, sync stream, player stream, diagnostics, log, error
 * message) is detected and blocked fail-closed; a token never crosses the boundary in plaintext. Every
 * secret kind maps to a device-local credential category, and the OS credential store is the required home.
 *
 * The leak guard reuses the SAME diagnostics redaction scrubber that proves support bundles / cloud payloads
 * clean — so there is one definition of "a secret", proven here against the cloud-collaboration channels.
 */

// A realistic bearer token + an OAuth-shaped credential — the exact strings a leak would expose.
const PLANTED_BEARER = 'Bearer sk-live-0xDEADBEEFc0ffee1234567890abcdef';
const PLANTED_REFRESH = 'rt_98f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3';

describe('SEC-004 — every enumerated secret kind is device-local credential-store material', () => {
	it('maps each secret kind to a device-local storage category (never cloud-syncable)', () => {
		for (const kind of SECRET_KINDS) {
			const category = storageCategoryForSecret(kind);
			expect(declaredClassification(category)).toBe('device-local');
			// The dedicated assertion must not throw for any declared secret kind.
			expect(() => assertSecretCategoryIsDeviceLocal(kind)).not.toThrow();
		}
	});

	it('requires the OS credential store when available, and a fail-closed encrypted-device-local fallback', () => {
		expect(requiredSecretLocation(true)).toBe('os-credential-store');
		expect(requiredSecretLocation(false)).toBe('encrypted-device-local');
	});

	it('describes custody for every secret kind without ever carrying a secret value', () => {
		const statuses = describeSecretCustody(true);
		expect(statuses.map((s) => s.kind)).toEqual([...SECRET_KINDS]);
		for (const status of statuses) {
			expect(status.deviceLocalOnly).toBe(true);
			expect(status.requiredLocation).toBe('os-credential-store');
			expect(status.redactedPlaceholder).toBe(REDACTED_SECRET);
			// The status surface must not embed the bearer/refresh secret strings.
			expect(JSON.stringify(status)).not.toContain(PLANTED_BEARER);
		}
	});
});

describe('SEC-004 AC1/AC2 — a planted secret never crosses a durable/outbound channel in plaintext', () => {
	it('detects a planted secret destined for EVERY channel and blocks it fail closed', () => {
		// A note/handout/log/diagnostic/sync payload salted with a token.
		const tainted = {
			noteBody: `The vault key is ${PLANTED_BEARER}.`,
			fields: { authorization: PLANTED_BEARER, refresh_token: PLANTED_REFRESH },
		};
		for (const channel of SECRET_CHANNELS) {
			const finding = findSecretLeak(tainted, channel);
			expect(finding, `channel ${channel} should detect the planted secret`).not.toBeNull();
			expect(finding?.channel).toBe(channel);
			// The finding must NOT re-leak the secret value through its reason.
			expect(finding?.reason).not.toContain(PLANTED_BEARER);
			expect(finding?.reason).not.toContain(PLANTED_REFRESH);
			expect(() => assertNoSecretLeak(tainted, channel)).toThrow();
		}
	});

	it('a clean payload passes every channel guard', () => {
		const clean = { noteBody: 'A goblin ambush at the old mill.', fields: { mood: 'tense' } };
		for (const channel of SECRET_CHANNELS) {
			expect(findSecretLeak(clean, channel)).toBeNull();
			expect(() => assertNoSecretLeak(clean, channel)).not.toThrow();
		}
	});

	it('scrubForChannel produces a payload that provably passes the boundary guard', () => {
		const tainted = { body: PLANTED_BEARER, fields: { token: PLANTED_REFRESH } };
		const channel: SecretChannel = 'sync-stream';
		// Before scrubbing it leaks; after scrubbing it is clean and the guard accepts it.
		expect(() => assertNoSecretLeak(tainted, channel)).toThrow();
		const scrubbed = scrubForChannel(tainted);
		expect(containsSensitiveData(scrubbed)).toBe(false);
		expect(() => assertNoSecretLeak(scrubbed, channel)).not.toThrow();
		// The secret-named `token` key value is replaced with the placeholder, not the raw refresh token.
		expect(JSON.stringify(scrubbed)).not.toContain(PLANTED_REFRESH);
		expect(JSON.stringify(scrubbed)).toContain(REDACTED_SECRET);
	});

	it('a token never crosses the redaction boundary even nested deep in a sync payload', () => {
		// An op-log-shaped payload with the token buried in a nested value array.
		const op = {
			id: 'op-1',
			value: { entries: [{ meta: { headers: { authorization: PLANTED_BEARER } } }] },
		};
		expect(() => assertNoSecretLeak(op, 'operation-log')).toThrow();
		const scrubbed = scrubForChannel(op);
		expect(() => assertNoSecretLeak(scrubbed, 'operation-log')).not.toThrow();
		expect(JSON.stringify(scrubbed)).not.toContain(PLANTED_BEARER);
	});
});

describe('SEC-004 AC1 — raw JWT value in free-text field (no Bearer prefix, non-secret key name)', () => {
	// A realistic JWT-shaped token embedded in a text field whose key name is NOT a secret key.
	// Before the JWT_VALUE_PATTERN fix, this string passed through `containsSensitiveData` → false,
	// meaning the boundary guard would NOT catch it.  These tests prove the gap is now closed.
	const RAW_JWT =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
		'eyJzdWIiOiJ1c2VyLTEyMzQiLCJleHAiOjE3MTcwMDAwMDB9.' +
		'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

	it('containsSensitiveData detects a raw JWT in a free-text field with a non-secret key name', () => {
		// `detail` does not match the secret-key pattern; only the value-level JWT scan catches this.
		const payload = { detail: `Sync source status: ${RAW_JWT}` };
		expect(containsSensitiveData(payload)).toBe(true);
	});

	it('scrubForChannel removes a raw JWT embedded in a non-secret-named field', () => {
		const payload = { detail: `Token info: ${RAW_JWT}`, normal: 'safe text' };
		const scrubbed = scrubForChannel(payload);
		const serialized = JSON.stringify(scrubbed);
		expect(serialized).not.toContain(RAW_JWT);
		expect(serialized).toContain(REDACTED_SECRET);
		// Non-sensitive field is untouched.
		expect(serialized).toContain('safe text');
		expect(containsSensitiveData(scrubbed)).toBe(false);
	});

	it('assertNoSecretLeak blocks a diagnostics payload carrying a raw JWT', () => {
		const payload = { status: 'ok', context: RAW_JWT };
		expect(() => assertNoSecretLeak(payload, 'diagnostics')).toThrow();
		// After scrubbing the guard must pass.
		const cleaned = scrubForChannel(payload);
		expect(() => assertNoSecretLeak(cleaned, 'diagnostics')).not.toThrow();
	});

	it('assertNoSecretLeak blocks an export-package payload carrying a raw JWT', () => {
		const payload = { frontMatter: { notes: `Bearer token: ${RAW_JWT}` } };
		// Even when the JWT follows some prefix text (not `Bearer ` prefix), it is still caught.
		expect(() => assertNoSecretLeak(payload, 'export-package')).toThrow();
		const cleaned = scrubForChannel(payload);
		expect(containsSensitiveData(cleaned)).toBe(false);
	});

	it('a Bearer-prefixed JWT is still fully redacted (Bearer pattern and JWT pattern compose)', () => {
		const bearerJwt = `Bearer ${RAW_JWT}`;
		// scrubForChannel should produce `Bearer [redacted]` (Bearer pattern fires first).
		const result = scrubForChannel({ auth: bearerJwt });
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain(RAW_JWT);
		expect(containsSensitiveData(result)).toBe(false);
	});
});
