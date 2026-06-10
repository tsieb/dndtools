import type { PlatformProfileId } from '../state/widget-package-state';
import type { PlatformProfile } from './platform-profile';
import { PLATFORM_PROFILES, hasService, serviceAvailability } from './platform-profile';

/**
 * PLAT-014: the declared, structured platform SUPPORT-STATUS artifact.
 *
 * Before a release, support status for every platform profile (desktop, web/PWA, Android,
 * tablet, mobile) must be declared with explicit parity / degradation / unsupported lists. This
 * module is the single structured source a release review inspects, and it is built ON the prior
 * epic's artifacts rather than duplicating them:
 *
 *   - the per-profile capability facts come from {@link PlatformProfile} (`platform-profile.ts`);
 *   - the web/PWA cached read/write detail stays in `support-matrix.ts` (PLAT-016);
 *   - this module adds the cross-profile *command* support status and the release-gate that
 *     blocks a release when a Must-have command is unsupported on a profile without an allowed
 *     exception (AC1), plus the degradation reason/fallback a capability-status surface shows
 *     (AC2).
 *
 * Pure module: no DOM, no Node, no Svelte.
 */

/** How a command/feature is supported on a given platform profile. */
export type ProfileSupport =
	| 'parity' // works the same as the reference (desktop) profile
	| 'degraded' // works, but reduced — a reason + fallback must be declared
	| 'unsupported'; // not available on this profile

/** The product priority of a command, mirroring the requirements priority scale. */
export type CommandPriority = 'Must-have' | 'Should-have' | 'Nice-to-have';

/** Per-profile support for one command, with a required reason+fallback when degraded/unsupported. */
export interface CommandProfileStatus {
	readonly profileId: PlatformProfileId;
	readonly support: ProfileSupport;
	/** Why it is degraded/unsupported, and the user-facing action. Required unless `parity`. */
	readonly reason: string | null;
	/** What the user can do instead. Required unless `parity`. */
	readonly fallback: string | null;
	/**
	 * Set true only when a Must-have command is intentionally allowed to be unsupported on this
	 * profile (the requirement explicitly permits it). The release gate blocks unsupported
	 * Must-have commands unless this is true (AC1).
	 */
	readonly exceptionAllowed: boolean;
}

export interface CommandSupportStatus {
	readonly commandId: string;
	readonly label: string;
	readonly priority: CommandPriority;
	readonly profiles: readonly CommandProfileStatus[];
}

export interface PlatformSupportStatusArtifact {
	readonly version: number;
	/** The reference profile every other profile is compared to for parity. */
	readonly referenceProfileId: PlatformProfileId;
	readonly commands: readonly CommandSupportStatus[];
}

export const SUPPORT_STATUS_VERSION = 1 as const;

const ALL_PROFILE_IDS: readonly PlatformProfileId[] = PLATFORM_PROFILES.map((p) => p.id);

/**
 * Helper to declare parity across all profiles, overriding only the profiles that differ. Keeps
 * the artifact declarative and exhaustive: every command states a status for every profile.
 */
function commandStatus(
	commandId: string,
	label: string,
	priority: CommandPriority,
	overrides: Partial<Record<PlatformProfileId, Omit<CommandProfileStatus, 'profileId'>>> = {},
): CommandSupportStatus {
	const profiles = ALL_PROFILE_IDS.map((profileId): CommandProfileStatus => {
		const override = overrides[profileId];
		if (override) return { profileId, ...override };
		return {
			profileId,
			support: 'parity',
			reason: null,
			fallback: null,
			exceptionAllowed: false,
		};
	});
	return { commandId, label, priority, profiles };
}

const DEGRADED_OFFLINE_PRESENCE = {
	support: 'degraded',
	reason: 'Live remote participant presence requires network and is unavailable offline.',
	fallback: 'Participants show as offline until the network returns; local session state is safe.',
	exceptionAllowed: false,
} as const;

/**
 * The declared cross-profile command support status. Reference profile is desktop. The web/PWA
 * profile degrades native-only flows (filesystem vault, OS credential store) — those are
 * declared `unsupported` with an allowed exception because the requirement (PLAT-004/PLAT-016)
 * explicitly routes them to the in-browser vault / desktop app. Native shells (desktop/tablet/
 * mobile) are not yet wired in this slice, so their durable command flows are declared with the
 * web-equivalent status that the implemented prototype actually delivers.
 */
export const PLATFORM_SUPPORT_STATUS: PlatformSupportStatusArtifact = {
	version: SUPPORT_STATUS_VERSION,
	referenceProfileId: 'desktop',
	commands: [
		commandStatus('scene.create', 'Create a Scene', 'Must-have'),
		commandStatus('scene.move-widget', 'Move a widget on a Scene', 'Must-have'),
		commandStatus('command-center.ensure-home', 'First-run Command Center setup', 'Must-have'),
		commandStatus('session.project-player-view', 'Project a Player View', 'Must-have', {
			web: DEGRADED_OFFLINE_PRESENCE,
			tablet: DEGRADED_OFFLINE_PRESENCE,
			mobile: DEGRADED_OFFLINE_PRESENCE,
		}),
		commandStatus('vault.open-filesystem', 'Open a filesystem vault', 'Should-have', {
			web: {
				support: 'unsupported',
				reason: 'A browser cannot open a trusted OS filesystem vault.',
				fallback: 'Use the in-browser vault, or open the desktop app for filesystem vaults.',
				exceptionAllowed: true,
			},
			tablet: {
				support: 'degraded',
				reason: 'Tablet vault access goes through Capacitor filesystem, not a desktop picker.',
				fallback: 'Use the Capacitor file import flow.',
				exceptionAllowed: false,
			},
			mobile: {
				support: 'degraded',
				reason: 'Mobile vault access goes through Capacitor filesystem, not a desktop picker.',
				fallback: 'Use the Capacitor file import flow.',
				exceptionAllowed: false,
			},
		}),
		commandStatus('diagnostics.mcp-sidecar', 'Run the MCP sidecar', 'Nice-to-have', {
			web: {
				support: 'unsupported',
				reason: 'The local MCP sidecar process runs only in the desktop shell.',
				fallback: 'MCP is optional; disabling it never disables core app behavior.',
				exceptionAllowed: true,
			},
			tablet: {
				support: 'unsupported',
				reason: 'The MCP sidecar is a desktop-only capability.',
				fallback: 'MCP is optional and not required for any core flow.',
				exceptionAllowed: true,
			},
			mobile: {
				support: 'unsupported',
				reason: 'The MCP sidecar is a desktop-only capability.',
				fallback: 'MCP is optional and not required for any core flow.',
				exceptionAllowed: true,
			},
		}),
	],
};

export type SupportStatusProblemKind =
	| 'must-have-unsupported'
	| 'missing-reason'
	| 'missing-fallback'
	| 'missing-profile'
	| 'duplicate-command';

export interface SupportStatusProblem {
	readonly commandId: string;
	readonly profileId: PlatformProfileId | null;
	readonly kind: SupportStatusProblemKind;
	readonly message: string;
}

/**
 * PLAT-014 AC1 (the release gate): validate the support-status artifact. Fails closed when:
 *
 *   - a Must-have command is `unsupported` on a profile WITHOUT an allowed exception;
 *   - a degraded/unsupported status omits its reason or fallback (AC2 needs both to render);
 *   - a command does not declare a status for every known profile (no silent gaps);
 *   - a command id is duplicated.
 *
 * Returns every problem so a release review and the regression test can fail closed. An empty
 * array means the release is not blocked by platform support status.
 */
export function validateSupportStatus(
	artifact: PlatformSupportStatusArtifact = PLATFORM_SUPPORT_STATUS,
	knownProfileIds: readonly PlatformProfileId[] = ALL_PROFILE_IDS,
): SupportStatusProblem[] {
	const problems: SupportStatusProblem[] = [];
	const seen = new Set<string>();

	for (const command of artifact.commands) {
		if (seen.has(command.commandId)) {
			problems.push({
				commandId: command.commandId,
				profileId: null,
				kind: 'duplicate-command',
				message: `Duplicate command id "${command.commandId}" in support status.`,
			});
		}
		seen.add(command.commandId);

		const declaredProfiles = new Set(command.profiles.map((p) => p.profileId));
		for (const profileId of knownProfileIds) {
			if (!declaredProfiles.has(profileId)) {
				problems.push({
					commandId: command.commandId,
					profileId,
					kind: 'missing-profile',
					message: `Command "${command.commandId}" does not declare support status for profile "${profileId}".`,
				});
			}
		}

		for (const status of command.profiles) {
			if (status.support === 'unsupported') {
				if (command.priority === 'Must-have' && !status.exceptionAllowed) {
					problems.push({
						commandId: command.commandId,
						profileId: status.profileId,
						kind: 'must-have-unsupported',
						message: `Must-have command "${command.commandId}" is unsupported on "${status.profileId}" with no allowed exception; release is blocked (PLAT-014 AC1).`,
					});
				}
			}
			if (status.support !== 'parity') {
				if (!status.reason || status.reason.trim() === '') {
					problems.push({
						commandId: command.commandId,
						profileId: status.profileId,
						kind: 'missing-reason',
						message: `"${command.commandId}" on "${status.profileId}" is ${status.support} but declares no reason (PLAT-014 AC2).`,
					});
				}
				if (!status.fallback || status.fallback.trim() === '') {
					problems.push({
						commandId: command.commandId,
						profileId: status.profileId,
						kind: 'missing-fallback',
						message: `"${command.commandId}" on "${status.profileId}" is ${status.support} but declares no fallback (PLAT-014 AC2).`,
					});
				}
			}
		}
	}

	return problems;
}

/**
 * Resolve the parity / degradation summary for one profile: the lists a capability-status
 * surface and a release review render (AC2). Reason+fallback are carried through for the
 * degraded and unsupported entries.
 */
export interface ProfileSupportSummary {
	readonly profileId: PlatformProfileId;
	readonly parity: readonly string[];
	readonly degraded: readonly {
		readonly commandId: string;
		readonly label: string;
		readonly reason: string;
		readonly fallback: string;
	}[];
	readonly unsupported: readonly {
		readonly commandId: string;
		readonly label: string;
		readonly reason: string;
		readonly fallback: string;
		readonly exceptionAllowed: boolean;
	}[];
}

export function summarizeProfileSupport(
	profileId: PlatformProfileId,
	artifact: PlatformSupportStatusArtifact = PLATFORM_SUPPORT_STATUS,
): ProfileSupportSummary {
	const parity: string[] = [];
	const degraded: ProfileSupportSummary['degraded'][number][] = [];
	const unsupported: ProfileSupportSummary['unsupported'][number][] = [];

	for (const command of artifact.commands) {
		const status = command.profiles.find((p) => p.profileId === profileId);
		if (!status) continue;
		if (status.support === 'parity') {
			parity.push(command.commandId);
		} else if (status.support === 'degraded') {
			degraded.push({
				commandId: command.commandId,
				label: command.label,
				reason: status.reason ?? '',
				fallback: status.fallback ?? '',
			});
		} else {
			unsupported.push({
				commandId: command.commandId,
				label: command.label,
				reason: status.reason ?? '',
				fallback: status.fallback ?? '',
				exceptionAllowed: status.exceptionAllowed,
			});
		}
	}

	return { profileId, parity, degraded, unsupported };
}

/**
 * Cross-check the declared support status against live profile capabilities: an `unsupported`
 * command must not be claimed unsupported on a profile that actually has the service it needs.
 * The check is intentionally narrow (filesystem vault → trustedFilesystem; MCP → mcpSidecar) so
 * the declared artifact cannot drift away from the capability descriptors it builds on. Returns
 * the command ids whose declared unsupported-status contradicts the live profile.
 */
const COMMAND_REQUIRED_SERVICE: Readonly<Record<string, keyof PlatformProfile['capabilities']>> = {
	'vault.open-filesystem': 'trustedFilesystem',
	'diagnostics.mcp-sidecar': 'mcpSidecar',
};

export function supportStatusServiceInconsistencies(
	profile: PlatformProfile,
	artifact: PlatformSupportStatusArtifact = PLATFORM_SUPPORT_STATUS,
): string[] {
	const problems: string[] = [];
	for (const command of artifact.commands) {
		const requiredService = COMMAND_REQUIRED_SERVICE[command.commandId];
		if (!requiredService) continue;
		const status = command.profiles.find((p) => p.profileId === profile.id);
		if (!status || status.support !== 'unsupported') continue;
		// If the profile genuinely has the required service available, it must not be declared
		// unsupported for this command.
		if (
			hasService(profile, requiredService) &&
			serviceAvailability(profile, requiredService) === 'available'
		) {
			problems.push(command.commandId);
		}
	}
	return problems;
}
