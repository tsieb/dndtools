import { describe, expect, it } from 'vitest';
import {
	PLATFORM_PROFILES,
	PLATFORM_SUPPORT_STATUS,
	platformProfile,
	summarizeProfileSupport,
	supportStatusServiceInconsistencies,
	validateSupportStatus,
	type CommandSupportStatus,
	type PlatformSupportStatusArtifact,
} from '../src/index';

const PROFILE_IDS = PLATFORM_PROFILES.map((p) => p.id);

describe('PLAT-014 platform support-status artifact', () => {
	it('declares a status for every known profile on every command (no silent gaps)', () => {
		for (const command of PLATFORM_SUPPORT_STATUS.commands) {
			const ids = command.profiles.map((p) => p.profileId);
			for (const profileId of PROFILE_IDS) {
				expect(ids).toContain(profileId);
			}
		}
	});

	it('validates clean: no Must-have command is unsupported without an allowed exception (AC1)', () => {
		expect(validateSupportStatus()).toEqual([]);
	});

	it('every degraded/unsupported entry declares a reason and a fallback (AC2)', () => {
		for (const command of PLATFORM_SUPPORT_STATUS.commands) {
			for (const status of command.profiles) {
				if (status.support !== 'parity') {
					expect(status.reason?.trim()).toBeTruthy();
					expect(status.fallback?.trim()).toBeTruthy();
				}
			}
		}
	});

	it('BLOCKS release when a Must-have command is unsupported with no exception (AC1 negative)', () => {
		const blocked: CommandSupportStatus = {
			commandId: 'scene.create',
			label: 'Create a Scene',
			priority: 'Must-have',
			profiles: PROFILE_IDS.map((profileId) => ({
				profileId,
				support: profileId === 'web' ? 'unsupported' : 'parity',
				reason: profileId === 'web' ? 'broken on web' : null,
				fallback: profileId === 'web' ? 'use desktop' : null,
				exceptionAllowed: false,
			})),
		};
		const artifact: PlatformSupportStatusArtifact = {
			version: 1,
			referenceProfileId: 'desktop',
			commands: [blocked],
		};
		const problems = validateSupportStatus(artifact, PROFILE_IDS);
		const blocker = problems.find((p) => p.kind === 'must-have-unsupported');
		expect(blocker).toBeDefined();
		expect(blocker?.profileId).toBe('web');
	});

	it('does NOT block when a Must-have command is unsupported WITH an allowed exception (AC1)', () => {
		const allowed: CommandSupportStatus = {
			commandId: 'scene.create',
			label: 'Create a Scene',
			priority: 'Must-have',
			profiles: PROFILE_IDS.map((profileId) => ({
				profileId,
				support: profileId === 'web' ? 'unsupported' : 'parity',
				reason: profileId === 'web' ? 'native-only' : null,
				fallback: profileId === 'web' ? 'use desktop' : null,
				exceptionAllowed: profileId === 'web',
			})),
		};
		const artifact: PlatformSupportStatusArtifact = {
			version: 1,
			referenceProfileId: 'desktop',
			commands: [allowed],
		};
		expect(
			validateSupportStatus(artifact, PROFILE_IDS).some((p) => p.kind === 'must-have-unsupported'),
		).toBe(false);
	});

	it('flags a degraded entry missing its reason or fallback (AC2 negative)', () => {
		const artifact: PlatformSupportStatusArtifact = {
			version: 1,
			referenceProfileId: 'desktop',
			commands: [
				{
					commandId: 'x',
					label: 'X',
					priority: 'Should-have',
					profiles: PROFILE_IDS.map((profileId) => ({
						profileId,
						support: profileId === 'web' ? 'degraded' : 'parity',
						reason: null,
						fallback: null,
						exceptionAllowed: false,
					})),
				},
			],
		};
		const problems = validateSupportStatus(artifact, PROFILE_IDS);
		expect(problems.some((p) => p.kind === 'missing-reason')).toBe(true);
		expect(problems.some((p) => p.kind === 'missing-fallback')).toBe(true);
	});

	it('summarizes parity / degraded / unsupported lists for a profile (AC2)', () => {
		const web = summarizeProfileSupport('web');
		expect(web.parity.length).toBeGreaterThan(0);
		// web has the degraded player-view projection and unsupported filesystem/MCP.
		expect(web.unsupported.map((u) => u.commandId)).toContain('vault.open-filesystem');
		expect(web.unsupported.map((u) => u.commandId)).toContain('diagnostics.mcp-sidecar');
		for (const entry of web.degraded) {
			expect(entry.reason).not.toBe('');
			expect(entry.fallback).not.toBe('');
		}
	});

	it('stays consistent with the live profile capability descriptors (no drift)', () => {
		// The web profile genuinely lacks the filesystem/MCP services, so declaring those commands
		// unsupported is consistent — zero inconsistencies.
		const web = platformProfile('web');
		expect(supportStatusServiceInconsistencies(web)).toEqual([]);
	});
});
