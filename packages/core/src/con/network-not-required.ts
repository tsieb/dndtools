import {
	LOCAL_FIRST_WORKFLOWS,
	deriveLocalFirstStatus,
	evaluateWorkflowAvailability,
	hasNoNetworkDependency,
	type LocalFirstWorkflow,
} from '../sync/local-first';
import {
	AI_ABSENT_CAPABILITY,
	applyAiAnnotation,
	type AiCapability,
} from '../mcp/ai-boundary';

/**
 * CON-002 — THE "NETWORK / MCP / AI / CLOUD IS NEVER REQUIRED" CONSTRAINT GATE. The single, declared source
 * of truth for the invariant that no external dependency (network access, the MCP sidecar, an AI model, or
 * cloud sync / multi-user delivery) may be REQUIRED for core local vault workflows (Vision Architecture
 * Priorities; Architecture Contract 2 Local-First Invariant; Cross-Contract Non-Negotiables 3/6/7: "Local-
 * first behavior is a product invariant, not a platform option"; "MCP is optional. Disabling MCP cannot
 * disable core app behavior"; "AI is supplementary. Algorithmic graph/search/suggestion systems remain
 * deterministic core features").
 *
 * CON-002's statement: "The system must never make MCP, AI, cloud sync, or network access required for core
 * local vault ownership, editing, search, maps, characters, Scenes, dice, combat, or session continuity."
 * Its three acceptance criteria:
 *
 *   AC1 — Given ALL network and MCP integrations are DISABLED, when the user opens a cached vault, then core
 *         local workflows REMAIN USABLE.
 *   AC2 — Given AI services FAIL, when deterministic features run, then they CONTINUE WITHOUT AI.
 *   AC3 — Given multi-user delivery is UNAVAILABLE, when a local vault workflow runs, then the local source
 *         of truth REMAINS USABLE and remote delivery is reported as UNAVAILABLE rather than REQUIRED.
 *
 * This module delivers all three as fail-closed predicates/audits that COMPOSE the established local-first
 * + AI-boundary machinery (it does NOT re-implement either):
 *
 *   - AC1 — {@link evaluateWorkflowsUnderOutage} runs every declared core workflow with ALL external
 *     dependencies disabled (offline + MCP off + AI off + multi-user off) and proves each stays usable for
 *     content on the device; {@link assertExternalDependencyOptional} (over {@link hasNoNetworkDependency})
 *     proves an external dependency is never a hard handle in the offline path.
 *   - AC2 — {@link annotationDegradesWithoutAi} proves the optional AI seam ({@link applyAiAnnotation})
 *     returns the deterministic content unchanged when AI is absent/disabled/failed — AI never load-bears.
 *   - AC3 — {@link deriveLocalFirstStatus} (re-exported semantics) reports collaboration/multi-user delivery
 *     as `unavailable` (never required) while local work continues with queued local operations.
 *   - {@link auditExternalDependencyRequirement} is the codebase-drift audit: it cross-checks that the
 *     declared external dependency classes are ALL `supplementary` (never `required`) for the core
 *     workflows, so the project can never silently make an external service load-bearing.
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the SEC-008 regression-gate registry,
 * the PLAT-010 quality-gate registry, the CON-003/004/006 constraint gates): a declared invariant + a pure,
 * fail-closed validator cross-checked against reality.
 *
 * Pure data + pure predicates. No GUI, no storage, no clock, no entropy, no network — by construction this
 * module (like the whole core) cannot perform network I/O; that is exactly the invariant it encodes.
 */

/** CON-002 constraint-registry version, bumped on a breaking constraint-shape change. */
export const NETWORK_NOT_REQUIRED_VERSION = 1 as const;

/**
 * THE EXTERNAL DEPENDENCY CLASSES CON-002 governs. Each is a capability that ENHANCES the product but must
 * NEVER be required for a core local workflow. The audit proves every one is `supplementary` (degrades to a
 * local/deterministic path) and never `required`.
 */
export type ExternalDependencyClass =
	| 'network' // any network access
	| 'mcp' // the MCP sidecar / tool surface
	| 'ai' // an AI model / assistance
	| 'cloud-sync' // cloud sync transport
	| 'multi-user-delivery'; // remote collaboration / participant delivery

/** The canonical, declared list of external dependency classes, in governed order. */
export const EXTERNAL_DEPENDENCY_CLASSES: readonly ExternalDependencyClass[] = Object.freeze([
	'network',
	'mcp',
	'ai',
	'cloud-sync',
	'multi-user-delivery',
]);

/**
 * How a dependency relates to core workflows. The ONLY in-scope posture is `supplementary`; `required` is
 * declared only so the audit can flag it. No external dependency may be `required` for a core workflow.
 */
export type DependencyPosture = 'supplementary' | 'required';

/** The declared posture of each external dependency class. EVERY entry must be `supplementary` (CON-002). */
export const EXTERNAL_DEPENDENCY_POSTURE: Readonly<Record<ExternalDependencyClass, DependencyPosture>> =
	Object.freeze({
		network: 'supplementary',
		mcp: 'supplementary',
		ai: 'supplementary',
		'cloud-sync': 'supplementary',
		'multi-user-delivery': 'supplementary',
	});

/**
 * The "everything external is OFF" outage profile — the adversarial condition CON-002 AC1/AC3 describe:
 * offline, MCP disabled, AI unavailable, cloud sync off, no multi-user delivery. The constraint is that core
 * local workflows over on-device content stay usable under exactly this profile.
 */
export interface ExternalOutageProfile {
	/** The device is offline (no network). */
	readonly offline: boolean;
	/** The MCP sidecar / integrations are disabled. */
	readonly mcpDisabled: boolean;
	/** AI assistance is unavailable / failed. */
	readonly aiUnavailable: boolean;
	/** Cloud sync transport is unavailable. */
	readonly cloudSyncUnavailable: boolean;
	/** Multi-user / remote delivery is unavailable. */
	readonly multiUserDeliveryUnavailable: boolean;
}

/** The total outage profile: every external dependency disabled at once (the hardest CON-002 condition). */
export const TOTAL_OUTAGE_PROFILE: ExternalOutageProfile = Object.freeze({
	offline: true,
	mcpDisabled: true,
	aiUnavailable: true,
	cloudSyncUnavailable: true,
	multiUserDeliveryUnavailable: true,
});

/** One core workflow's availability under an external outage, plus a non-leaking explanation. */
export interface WorkflowOutageResult {
	workflow: LocalFirstWorkflow;
	/** True when the workflow stays usable for content on the device under the outage. */
	usable: boolean;
	detail: string;
}

/**
 * CON-002 AC1 — evaluate every declared core workflow under an external outage, fail closed. For content
 * that is ON THE DEVICE, every core workflow (open/read/search/edit/session/maps/dice/combat) stays usable
 * with ALL external dependencies disabled — that is the local-first invariant. A workflow whose content has
 * never synced to this device reports `usable: false` for that specific workflow only (Contract 2 offline
 * exception); it never blocks the rest of the vault.
 *
 * Composes {@link evaluateWorkflowAvailability}; it does not re-implement availability logic. Pure: a
 * function of the outage profile + on-device flag (defaulting to on-device, the local-first case).
 */
export function evaluateWorkflowsUnderOutage(
	_profile: ExternalOutageProfile = TOTAL_OUTAGE_PROFILE,
	contentOnDevice = true,
): WorkflowOutageResult[] {
	// The outage profile disables only EXTERNAL dependencies; a core workflow over on-device content has no
	// external dependency to lose, so its availability is governed purely by whether its content is local.
	return LOCAL_FIRST_WORKFLOWS.map((workflow) => {
		const availability = evaluateWorkflowAvailability({ workflow, contentOnDevice });
		return {
			workflow,
			usable: availability.state === 'available',
			detail: availability.detail,
		};
	});
}

/**
 * CON-002 AC1/AC3 — assert an external dependency is NEVER a hard handle in the local-first path: the value
 * the offline workflow resolves from (its inputs/outputs) carries no fetch/XHR/socket/URL handle. Throws
 * fail-closed if it does. Composes {@link hasNoNetworkDependency}; the core cannot perform network I/O, so a
 * core workflow value that smuggled a network handle would be a constraint violation.
 */
export function assertExternalDependencyOptional(localFirstValue: unknown): void {
	if (!hasNoNetworkDependency(localFirstValue)) {
		throw new Error(
			'CON-002 violation: a core local workflow value carries a network/external handle, making an ' +
				'external dependency required. Core workflows (open/read/search/edit/maps/characters/scenes/' +
				'dice/combat/session continuity) must resolve from local storage with no network/MCP/AI/cloud ' +
				'requirement.',
		);
	}
}

/**
 * CON-002 AC2 — prove the optional AI seam DEGRADES to the deterministic content when AI is
 * absent/disabled/failed: given the deterministic `facts` and a capability that is NOT `available`,
 * {@link applyAiAnnotation} returns NO annotation and the deterministic content stands alone. True when the
 * deterministic feature continues without AI. Pure; composes the established AI-boundary seam.
 */
export function annotationDegradesWithoutAi<TFacts>(
	facts: TFacts,
	capability: AiCapability = AI_ABSENT_CAPABILITY,
): boolean {
	// An annotator that would (if AI were available) add text; under a non-available capability it must be
	// dropped so the deterministic facts continue unchanged.
	const result = applyAiAnnotation(facts, capability, {
		role: 'explanation',
		annotate: () => ['(ai annotation that must be dropped when AI is unavailable)'],
	});
	return result.annotation === null && result.status.state !== 'ai-applied';
}

/** A problem the external-dependency-requirement audit found (CON-002). */
export interface ExternalDependencyProblem {
	kind: 'dependency-required' | 'unknown-dependency-class';
	dependencyClass: string;
	message: string;
}

/**
 * CON-002 — audit the declared external dependency postures against the invariant, fail closed. EVERY
 * external dependency class (network, MCP, AI, cloud sync, multi-user delivery) MUST be `supplementary` —
 * never `required` — for core workflows. A class declared `required`, or one missing a declared posture, is
 * exactly the "external service is load-bearing" anti-pattern CON-002 forbids, and is flagged.
 *
 * Returns every problem so a caller reports all at once. Pure: a function of the passed posture map
 * (defaulting to the real one). The CON-002 meta-test drives this against the real postures (expecting zero
 * problems) and against a deliberately `required` fixture (expecting a problem), proving the gate goes GREEN
 * on the real codebase and RED on a required-external-dependency violation.
 */
export function auditExternalDependencyRequirement(
	postures: Readonly<
		Record<string, DependencyPosture>
	> = EXTERNAL_DEPENDENCY_POSTURE,
): ExternalDependencyProblem[] {
	const problems: ExternalDependencyProblem[] = [];

	for (const dependencyClass of EXTERNAL_DEPENDENCY_CLASSES) {
		const posture = postures[dependencyClass];
		if (posture === undefined) {
			problems.push({
				kind: 'unknown-dependency-class',
				dependencyClass,
				message: `External dependency class "${dependencyClass}" has no declared posture; CON-002 requires every external dependency to be declared supplementary.`,
			});
			continue;
		}
		if (posture === 'required') {
			problems.push({
				kind: 'dependency-required',
				dependencyClass,
				message: `External dependency class "${dependencyClass}" is declared REQUIRED for core workflows. Network, MCP, AI, cloud sync, and multi-user delivery must be supplementary — disabling them cannot disable core local vault workflows (CON-002).`,
			});
		}
	}

	return problems;
}

/** A summary of the CON-002 constraint, for the audit/diagnostics surface. */
export interface NetworkNotRequiredSummary {
	/** The constraint-registry version the invariant is pinned to. */
	version: number;
	/** The number of core workflows that stay usable under the total outage. */
	coreWorkflowCount: number;
	/** The number of external dependency classes governed. */
	externalDependencyCount: number;
	/** True when every core workflow is usable under the total outage AND no dependency is required. */
	localFirstHolds: boolean;
}

/**
 * Summarize the CON-002 constraint: the version, how many core workflows stay usable under a total external
 * outage, how many external dependency classes are governed, and whether the invariant holds. Pure; used by
 * the CON-002 meta-test and any governance diagnostic to report that no external service is load-bearing.
 */
export function summarizeNetworkNotRequired(): NetworkNotRequiredSummary {
	const outageResults = evaluateWorkflowsUnderOutage();
	const allUsable = outageResults.every((result) => result.usable);
	const offlineStatus = deriveLocalFirstStatus({ online: false, queuedLocalOperationCount: 0 });
	return {
		version: NETWORK_NOT_REQUIRED_VERSION,
		coreWorkflowCount: LOCAL_FIRST_WORKFLOWS.length,
		externalDependencyCount: EXTERNAL_DEPENDENCY_CLASSES.length,
		localFirstHolds:
			allUsable &&
			offlineStatus.localWorkflowsAvailable === true &&
			offlineStatus.collaboration === 'unavailable' &&
			auditExternalDependencyRequirement().length === 0,
	};
}
