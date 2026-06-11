// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	evaluateGate,
	fingerprint,
	isExpired,
	mergeViolations,
	normalizeSelector,
	type AxeViolationInput,
	type KnownViolationRegister,
} from '../../scripts/lib/a11y-axe-policy.ts';

const NOW = new Date('2026-06-08T12:00:00Z');

function violation(overrides: Partial<AxeViolationInput> = {}): AxeViolationInput {
	return {
		id: 'color-contrast',
		impact: 'serious',
		route: '/session',
		project: 'desktop-chromium',
		selector: '.recipient:nth-child(2) > input',
		help: 'help',
		helpUrl: 'https://example.test',
		...overrides,
	};
}

const emptyRegister: KnownViolationRegister = { version: 1, violations: [] };

describe('a11y axe policy — fingerprint determinism (UX-A11Y-017 AC3)', () => {
	it('strips volatile uuid/hex/numeric id fragments so reruns match', () => {
		const a = normalizeSelector('#widget-3f2a9c01-1b2c-4d5e-8f90-abcdef012345 > .row:nth-child(7)');
		const b = normalizeSelector('#widget-99887766-aaaa-bbbb-cccc-ddddeeeeffff > .row:nth-child(7)');
		expect(a).toBe(b);
	});

	it('de-duplicates the same logical violation reported by two parallel workers', () => {
		const worker1 = [
			violation({
				project: 'desktop-chromium',
				selector: '.member.svelte-1a2b3c4d:nth-child(2) > input',
			}),
		];
		const worker2 = [
			violation({
				project: 'mobile-chromium',
				selector: '.member.svelte-9z8y7x6w:nth-child(2) > input',
			}),
		];
		const merged = mergeViolations([worker1, worker2]);
		expect(merged).toHaveLength(1);
		expect(fingerprint(worker1[0]!)).toBe(fingerprint(worker2[0]!));
	});
});

describe('a11y axe policy — severity gating (UX-A11Y-001 AC1)', () => {
	it('always blocks a critical violation, even though it cannot be approved', () => {
		const result = evaluateGate([violation({ impact: 'critical' })], emptyRegister, NOW);
		expect(result.ok).toBe(false);
		expect(result.blocking).toHaveLength(1);
	});

	it('blocks a serious violation with no approving register entry', () => {
		const result = evaluateGate([violation({ impact: 'serious' })], emptyRegister, NOW);
		expect(result.ok).toBe(false);
	});

	it('never blocks on moderate or minor findings', () => {
		const result = evaluateGate(
			[violation({ impact: 'moderate' }), violation({ impact: 'minor', selector: '.x' })],
			emptyRegister,
			NOW,
		);
		expect(result.ok).toBe(true);
		expect(result.blocking).toHaveLength(0);
	});
});

describe('a11y axe policy — known-violation approval + expiry (UX-A11Y-001 AC3 / UX-A11Y-017 AC4)', () => {
	const register: KnownViolationRegister = {
		version: 1,
		violations: [
			{
				id: 'target-size',
				route: '/session',
				impact: 'serious',
				owner: 'team',
				reason: 'tracked',
				targetResolutionDate: '2026-09-30',
			},
		],
	};

	it('passes a serious violation matched by an active (future-dated) entry', () => {
		const result = evaluateGate([violation({ id: 'target-size' })], register, NOW);
		expect(result.ok).toBe(true);
		expect(result.violations[0]!.known).toBe(true);
		expect(result.blocking).toHaveLength(0);
	});

	it('FAILS once the entry remediation date has passed (negative probe)', () => {
		const future = new Date('2026-10-01T12:00:00Z');
		const result = evaluateGate([violation({ id: 'target-size' })], register, future);
		expect(result.ok).toBe(false);
		expect(result.expiredRegisterEntries).toHaveLength(1);
		expect(result.violations[0]!.blocking).toBe(true);
		expect(result.violations[0]!.expired).toBe(true);
	});

	it('fails on an expired entry even when no current violation matches it', () => {
		const future = new Date('2026-10-01T12:00:00Z');
		const result = evaluateGate([], register, future);
		expect(result.ok).toBe(false);
		expect(result.expiredRegisterEntries[0]!.daysOverdue).toBeGreaterThan(0);
	});

	it('treats an unparseable remediation date as expired', () => {
		expect(
			isExpired(
				{ id: 'x', route: '*', owner: 'o', reason: 'r', targetResolutionDate: 'nope' },
				NOW,
			),
		).toBe(true);
	});

	it('honours the "*" wildcard route in a register entry', () => {
		const wildcard: KnownViolationRegister = {
			version: 1,
			violations: [
				{
					id: 'region',
					route: '*',
					impact: 'serious',
					owner: 'o',
					reason: 'r',
					targetResolutionDate: '2026-12-31',
				},
			],
		};
		const result = evaluateGate([violation({ id: 'region', route: '/atlas' })], wildcard, NOW);
		expect(result.ok).toBe(true);
	});
});
