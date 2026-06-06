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
