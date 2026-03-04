// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cohortPercentFromKey, evaluateStagedRollout } from './update-service.js';

describe('update rollout helpers', () => {
	it('derives a deterministic rollout cohort from installation key', () => {
		const a = cohortPercentFromKey('installation-a:2.0.0');
		const b = cohortPercentFromKey('installation-a:2.0.0');
		const c = cohortPercentFromKey('installation-b:2.0.0');
		expect(a).toBeGreaterThanOrEqual(0);
		expect(a).toBeLessThan(100);
		expect(b).toBe(a);
		expect(c).not.toBe(a);
	});

	it('does not stage non-major updates', () => {
		const result = evaluateStagedRollout({
			currentVersion: '1.4.2',
			nextVersion: '1.5.0',
			releaseDate: '2026-03-01T00:00:00.000Z',
			installationId: 'install-non-major',
			now: new Date('2026-03-04T00:00:00.000Z'),
			dailyPercent: 20,
		});
		expect(result.active).toBe(false);
		expect(result.reason).toBe('not_major');
		expect(result.eligible).toBe(true);
		expect(result.allowedPercent).toBe(100);
	});

	it('computes staged eligibility for major releases with daily rollout percentage', () => {
		const now = new Date('2026-03-04T00:00:00.000Z');
		const result = evaluateStagedRollout({
			currentVersion: '1.9.0',
			nextVersion: '2.0.0',
			releaseDate: '2026-03-03T00:00:00.000Z',
			installationId: 'install-major',
			now,
			dailyPercent: 20,
		});
		expect(result.active).toBe(true);
		expect(result.reason).toBe('major');
		expect(result.daysSinceRelease).toBe(1);
		expect(result.allowedPercent).toBe(40);
		expect(result.eligible).toBe(result.cohortPercent < result.allowedPercent);
	});
});
