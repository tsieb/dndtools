// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { scanText } from '../../scripts/secret-scan.ts';

describe('secret scan', () => {
	it('detects high-confidence credentials without printing the full value', () => {
		const key = ['AKIA', '1234567890ABCDEF'].join('');
		const findings = scanText('fixture.env', `SAFE=true\nAWS_ACCESS_KEY_ID=${key}\n`);

		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({ rule: 'aws-access-key', file: 'fixture.env', line: 2 });
		expect(findings[0].preview).not.toContain(key);
	});

	it('detects Stripe live keys and webhook signing secrets (ADR-027)', () => {
		const live = ['rk_live_', 'A1b2C3d4E5f6G7h8I9j0'].join('');
		const whsec = ['whsec_', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('');
		const findings = scanText('notes.md', `key=${live}\nsecret=${whsec}\n`);
		expect(findings.map((f) => f.rule)).toEqual(['stripe-live-secret', 'stripe-webhook-secret']);
		for (const f of findings) expect(f.preview).not.toContain('A1b2C3d4E5f6G7h8I9j0');
		// Test-mode keys are not secrets worth blocking a commit over, and prose mentions are fine.
		expect(
			scanText('doc.md', 'Paste your sk_test_… key; the whsec_… value comes from Stripe.'),
		).toEqual([]);
	});

	it('does not flag ordinary configuration names or documentation prose', () => {
		expect(
			scanText('example.md', 'Set AWS_ACCESS_KEY_ID through OIDC; never commit a client secret.'),
		).toEqual([]);
	});
});
