import { describe, expect, it } from 'vitest';
import {
	AI_ABSENT_CAPABILITY,
	EXTERNAL_DEPENDENCY_CLASSES,
	EXTERNAL_DEPENDENCY_POSTURE,
	LOCAL_FIRST_WORKFLOWS,
	NETWORK_NOT_REQUIRED_VERSION,
	TOTAL_OUTAGE_PROFILE,
	annotationDegradesWithoutAi,
	assertExternalDependencyOptional,
	auditExternalDependencyRequirement,
	deriveLocalFirstStatus,
	evaluateWorkflowsUnderOutage,
	summarizeNetworkNotRequired,
	type DependencyPosture,
	type ExternalDependencyProblem,
} from '../src';

/**
 * CON-002 — THE "NETWORK / MCP / AI / CLOUD IS NEVER REQUIRED" CONSTRAINT GATE. CON-002's statement: "The
 * system must never make MCP, AI, cloud sync, or network access required for core local vault ownership,
 * editing, search, maps, characters, Scenes, dice, combat, or session continuity." Its acceptance criteria:
 *
 *   AC1 — Given ALL network and MCP integrations are DISABLED, when the user opens a cached vault, then core
 *         local workflows REMAIN USABLE.
 *   AC2 — Given AI services FAIL, when deterministic features run, then they CONTINUE WITHOUT AI.
 *   AC3 — Given multi-user delivery is UNAVAILABLE, when a local vault workflow runs, then the local source
 *         of truth REMAINS USABLE and remote delivery is reported as UNAVAILABLE rather than REQUIRED.
 *
 * This file IS the gate. It mirrors the established mechanical-gate meta-tests (CON-003/004/006, SEC-008,
 * PLAT-010): the constraint is the single source of truth, and reality is cross-checked against it so the
 * project can never silently make an external service load-bearing. The adversarial blocks at the bottom
 * prove the gate goes RED on a deliberate required-external-dependency and GREEN on the real codebase.
 */

function kinds(problems: ExternalDependencyProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('CON-002 AC1 — core local workflows remain usable with all external integrations disabled', () => {
	it('every core workflow stays usable under the TOTAL outage (offline + MCP + AI + cloud + multi-user off)', () => {
		const results = evaluateWorkflowsUnderOutage(TOTAL_OUTAGE_PROFILE);
		expect(results).toHaveLength(LOCAL_FIRST_WORKFLOWS.length);
		for (const result of results) {
			expect(result.usable, `"${result.workflow}" should stay usable offline`).toBe(true);
		}
	});

	it('opening a cached vault and running open/read/search/edit/session/maps/dice/combat all stay usable', () => {
		const usable = new Map(evaluateWorkflowsUnderOutage().map((r) => [r.workflow, r.usable]));
		for (const workflow of LOCAL_FIRST_WORKFLOWS) {
			expect(usable.get(workflow), `"${workflow}"`).toBe(true);
		}
	});

	it('content NEVER synced to this device reports unavailable for THAT workflow only (Contract 2 exception)', () => {
		const results = evaluateWorkflowsUnderOutage(TOTAL_OUTAGE_PROFILE, /* contentOnDevice */ false);
		for (const result of results) {
			expect(result.usable).toBe(false); // the specific workflow's content is not on the device...
		}
		// ...but the local-first status still reports the vault as usable (it never blocks the whole vault).
		const status = deriveLocalFirstStatus({ online: false });
		expect(status.localWorkflowsAvailable).toBe(true);
	});

	it('the local-first path carries no network handle (assertExternalDependencyOptional passes)', () => {
		const offlineEditInput = {
			workflow: 'edit',
			entityId: 'note-1',
			value: { body: 'edited locally', tags: ['local'] },
		};
		expect(() => assertExternalDependencyOptional(offlineEditInput)).not.toThrow();
	});

	it('a value that smuggled a network handle into the local-first path is rejected fail closed', () => {
		expect(() => assertExternalDependencyOptional({ fetch: () => undefined })).toThrow(/CON-002/);
		expect(() => assertExternalDependencyOptional({ url: 'https://cloud.example/sync' })).toThrow(
			/CON-002/,
		);
	});
});

describe('CON-002 AC2 — deterministic features continue without AI when AI services fail', () => {
	it('the AI annotation degrades to deterministic when AI is absent (the default)', () => {
		expect(annotationDegradesWithoutAi({ finding: 'deterministic-fact' })).toBe(true);
	});

	it('the AI annotation degrades to deterministic when AI is enabled-but-unreachable (services failed)', () => {
		expect(
			annotationDegradesWithoutAi(
				{ finding: 'deterministic-fact' },
				{ state: 'unavailable', detail: 'AI offline' },
			),
		).toBe(true);
	});

	it('the AI annotation degrades to deterministic when a model is present but disabled by the DM', () => {
		expect(
			annotationDegradesWithoutAi({ finding: 'x' }, { state: 'present-but-disabled', detail: null }),
		).toBe(true);
	});

	it('the absent capability is the fail-closed default', () => {
		expect(AI_ABSENT_CAPABILITY.state).toBe('absent');
	});
});

describe('CON-002 AC3 — local source of truth usable; multi-user delivery reported unavailable, not required', () => {
	it('offline: local workflows available and collaboration reported unavailable (never required)', () => {
		const status = deriveLocalFirstStatus({ online: false, queuedLocalOperationCount: 2 });
		expect(status.localWorkflowsAvailable).toBe(true);
		expect(status.collaboration).toBe('unavailable');
		expect(status.queuedLocalOperationCount).toBe(2);
		expect(status.summary).toMatch(/queued locally|collaboration is unavailable/i);
	});

	it('online: collaboration becomes available but local work is still primary', () => {
		const status = deriveLocalFirstStatus({ online: true });
		expect(status.collaboration).toBe('available');
		expect(status.localWorkflowsAvailable).toBe(true);
	});
});

describe('CON-002 — every external dependency is supplementary, never required (GREEN)', () => {
	it('the real postures pass the external-dependency-requirement audit with no problems', () => {
		const problems = auditExternalDependencyRequirement();
		expect(problems, `problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('network, MCP, AI, cloud sync, and multi-user delivery are all declared supplementary', () => {
		for (const dependency of EXTERNAL_DEPENDENCY_CLASSES) {
			expect(EXTERNAL_DEPENDENCY_POSTURE[dependency], `"${dependency}"`).toBe('supplementary');
		}
	});

	it('summarizes the constraint as local-first holding', () => {
		const summary = summarizeNetworkNotRequired();
		expect(summary.localFirstHolds).toBe(true);
		expect(summary.version).toBe(NETWORK_NOT_REQUIRED_VERSION);
		expect(summary.coreWorkflowCount).toBe(LOCAL_FIRST_WORKFLOWS.length);
		expect(summary.externalDependencyCount).toBe(EXTERNAL_DEPENDENCY_CLASSES.length);
	});

	it('exposes a constraint-registry version', () => {
		expect(NETWORK_NOT_REQUIRED_VERSION).toBe(1);
	});
});

describe('CON-002 — the gate goes RED on a deliberate required-external-dependency (adversarial)', () => {
	it('RED: an external dependency declared REQUIRED is flagged as dependency-required', () => {
		const rogue: Record<string, DependencyPosture> = {
			...EXTERNAL_DEPENDENCY_POSTURE,
			network: 'required',
		};
		const problems = auditExternalDependencyRequirement(rogue);
		expect(kinds(problems)).toContain('dependency-required');
		expect(problems.find((p) => p.kind === 'dependency-required')?.dependencyClass).toBe('network');
	});

	it('RED: making cloud sync or AI required is flagged', () => {
		expect(
			kinds(
				auditExternalDependencyRequirement({
					...EXTERNAL_DEPENDENCY_POSTURE,
					'cloud-sync': 'required',
				}),
			),
		).toContain('dependency-required');
		expect(
			kinds(auditExternalDependencyRequirement({ ...EXTERNAL_DEPENDENCY_POSTURE, ai: 'required' })),
		).toContain('dependency-required');
	});

	it('RED: a missing posture for a governed dependency class is flagged as unknown-dependency-class', () => {
		const missing: Record<string, DependencyPosture> = { network: 'supplementary' };
		expect(kinds(auditExternalDependencyRequirement(missing))).toContain('unknown-dependency-class');
	});

	it('GREEN again: the all-supplementary fixture passes the audit', () => {
		expect(auditExternalDependencyRequirement(EXTERNAL_DEPENDENCY_POSTURE)).toEqual([]);
	});

	it('is deterministic — identical input yields identical problems', () => {
		const input: Record<string, DependencyPosture> = {
			...EXTERNAL_DEPENDENCY_POSTURE,
			mcp: 'required',
		};
		expect(auditExternalDependencyRequirement(input)).toEqual(auditExternalDependencyRequirement(input));
	});
});
