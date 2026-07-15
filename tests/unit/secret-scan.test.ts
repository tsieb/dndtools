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

	it('does not flag ordinary configuration names or documentation prose', () => {
		expect(
			scanText('example.md', 'Set AWS_ACCESS_KEY_ID through OIDC; never commit a client secret.'),
		).toEqual([]);
	});
});
