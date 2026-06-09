import { describe, expect, it } from 'vitest';
import {
	WEB_SUPPORT_MATRIX,
	capabilityForFeature,
	domainSupportLevel,
	matrixServiceInconsistencies,
	platformProfile,
	supportDomain,
	type SupportDomainId,
} from '../src/index';

const REQUIRED_DOMAINS: SupportDomainId[] = [
	'notes',
	'maps',
	'scenes',
	'characters',
	'sessions',
	'handouts',
	'assets',
	'search',
	'graph',
	'sync-status',
];

describe('PLAT-016: web/PWA cached read/write support matrix', () => {
	// AC1: every core domain is marked with a support level and required fallback.
	it('covers every required core domain', () => {
		const ids = WEB_SUPPORT_MATRIX.domains.map((d) => d.id);
		for (const required of REQUIRED_DOMAINS) {
			expect(ids).toContain(required);
		}
	});

	it('declares a support level and a non-empty fallback for every domain (AC1)', () => {
		const levels = new Set([
			'cached-read-write',
			'cached-read',
			'queued-write',
			'unavailable',
			'unsupported',
		]);
		for (const domain of WEB_SUPPORT_MATRIX.domains) {
			expect(levels.has(domain.support)).toBe(true);
			expect(domain.fallback.trim().length).toBeGreaterThan(0);
		}
	});

	// AC2: auth, first-time limits, cache/update policy, quota, and eviction recovery are
	// declared for each affected domain.
	it('declares auth, cache, and eviction-recovery policy for every domain (AC2)', () => {
		const authStates = new Set(['none', 'first-time-online', 'reauth-on-reconnect']);
		for (const domain of WEB_SUPPORT_MATRIX.domains) {
			expect(authStates.has(domain.auth)).toBe(true);
			expect(domain.cachePolicy.trim().length).toBeGreaterThan(0);
			expect(domain.evictionRecovery.trim().length).toBeGreaterThan(0);
			expect(domain.queuedWritePolicy.trim().length).toBeGreaterThan(0);
		}
	});

	it('models sync-status reauthorization deferral while offline (AC: auth expiry offline)', () => {
		const sync = supportDomain('sync-status');
		expect(sync?.auth).toBe('reauth-on-reconnect');
		expect(sync?.offline.toLowerCase()).toContain('queued');
	});

	it('models asset eviction recovery: missing blob reported, metadata safe (AC3)', () => {
		const assets = supportDomain('assets');
		expect(assets?.support).toBe('cached-read');
		expect(assets?.evictionRecovery.toLowerCase()).toContain('missing');
	});

	// PLAT-004 AC5: a pending SW update must preserve local writes and report the reload
	// requirement before activation. These are hard content requirements on the declared
	// cache-update policy, not merely a non-empty string.
	it('AC5 (PLAT-004): SW update policy preserves local writes and reports reload before activation', () => {
		for (const domain of WEB_SUPPORT_MATRIX.domains) {
			// Both invariants must be stated: (1) local writes are NOT discarded by an update, and
			// (2) the user is informed of any reload requirement BEFORE the SW activates.
			expect(domain.cachePolicy.toLowerCase()).toContain('preserves current local writes');
			expect(domain.cachePolicy.toLowerCase()).toContain('reload requirement');
		}
	});

	// AC5 / fail-closed: native-only features report unsupported, never a native path.
	it('lists native-only features as unsupported with an action-oriented reason (AC5)', () => {
		const ids = WEB_SUPPORT_MATRIX.unsupportedFeatures.map((f) => f.id).sort();
		expect(ids).toEqual(
			['filesystem-vault', 'mcp-sidecar', 'os-credential-store', 'protocol-handler'].sort(),
		);
		for (const feature of WEB_SUPPORT_MATRIX.unsupportedFeatures) {
			expect(feature.reason.trim().length).toBeGreaterThan(0);
		}
	});

	it('resolves unsupported capability for native-only features (fail closed)', () => {
		expect(capabilityForFeature('filesystem-vault').level).toBe('unsupported');
		expect(capabilityForFeature('mcp-sidecar').level).toBe('unsupported');
	});

	it('resolves the declared support level for a known domain', () => {
		expect(capabilityForFeature('notes').level).toBe('cached-read-write');
		expect(capabilityForFeature('assets').level).toBe('cached-read');
		expect(domainSupportLevel('scenes')).toBe('cached-read-write');
	});

	it('fails closed to unsupported for an unknown feature id', () => {
		expect(capabilityForFeature('totally-unknown-feature').level).toBe('unsupported');
		expect(domainSupportLevel('totally-unknown-domain')).toBe('unsupported');
		expect(supportDomain('totally-unknown-domain')).toBeNull();
	});

	it('is consistent with the web profile capability descriptor', () => {
		// No unsupported feature may claim a service the web profile actually has available.
		expect(matrixServiceInconsistencies(platformProfile('web'))).toEqual([]);
	});

	it('detects an inconsistency if a profile actually has a supposedly-unsupported service', () => {
		const web = platformProfile('web');
		const inconsistentProfile = {
			...web,
			capabilities: { ...web.capabilities, mcpSidecar: 'available' as const },
		};
		expect(matrixServiceInconsistencies(inconsistentProfile)).toContain('mcp-sidecar');
	});
});
