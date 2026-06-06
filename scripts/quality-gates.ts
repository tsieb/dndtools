import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	QUALITY_GATES,
	QUALITY_GATE_BUDGETS,
	checkBudgets,
	validateGateRegistry,
	type GateProblem,
} from '../apps/v2/packages/core/src/platform/quality-gates.ts';
import { validateSupportStatus } from '../apps/v2/packages/core/src/platform/support-status.ts';
import { auditCapabilitySetGovernance } from '../apps/v2/packages/core/src/con/capability-set-sustainability.ts';
import { auditScopeBoundary } from '../apps/v2/packages/core/src/con/scope-constraints.ts';

/**
 * PLAT-010 + PLAT-014 + CON-004 + CON-003/CON-006 enforcement: validate the DECLARED quality-gate registry,
 * the platform support-status artifact, the permission-sustainability constraint, and the scope-boundary
 * constraint (the single sources of truth in `@dndtools/v2-core`) against the actual repository and fail
 * CLOSED.
 *
 * This does NOT rewrite the test runner. It cross-checks that:
 *
 *   - every declared gate maps to a package.json script that exists;
 *   - every gate is owned, justified, and names a user-facing defect class (AC2);
 *   - every gate's tier has a configured time budget (AC3);
 *   - every gate was reviewed within the review window (AC4);
 *   - optionally, measured tier durations stay under budget (AC3) — passed via
 *     `--measured tier=ms,tier=ms` so a smoke run can record its real wall-clock time;
 *   - (PLAT-014 release gate) no Must-have command is unsupported on a platform profile without
 *     an explicitly allowed exception, and every degraded/unsupported entry declares a reason +
 *     fallback. This is the "release is blocked" check from PLAT-014 AC1.
 *   - (CON-004 permission-sustainability gate) the capability-set schema stays bounded and governed:
 *     every grantable permission grouping is a named, schema-defined, documented capability set, and no
 *     entity type exceeds the declared per-type cap. An ungoverned/undocumented set or an over-cap
 *     entity type fails the gate, so the named-capability-set model can never silently drift into an
 *     unmanageable per-instance field-list surface.
 *   - (CON-003 / CON-006 scope-boundary gate) the LIVE declared registries stay within declared scope:
 *     every registered platform profile, content source, and widget host permission is in the declared
 *     in-scope allowlist, and every installed widget's distribution scope stays vault-local/workspace-local/
 *     system. A new top-level platform/source/extension surface or an out-of-scope widget distribution
 *     channel fails the gate, so v2 can never silently drift past its declared scope without an explicit
 *     scope/contract revision.
 *
 * Exit code 1 on any problem so the gate fails closed in CI and pre-push.
 */

const repoRoot = process.cwd();

function loadPackageScripts(): Set<string> {
	const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')) as {
		scripts?: Record<string, string>;
	};
	return new Set(Object.keys(pkg.scripts ?? {}));
}

function parseMeasured(argv: string[]): Record<string, number> {
	const flagIndex = argv.indexOf('--measured');
	if (flagIndex === -1) return {};
	const raw = argv[flagIndex + 1];
	if (!raw) return {};
	const out: Record<string, number> = {};
	for (const pair of raw.split(',')) {
		const [tier, ms] = pair.split('=');
		if (tier && ms && !Number.isNaN(Number(ms))) {
			out[tier.trim()] = Number(ms);
		}
	}
	return out;
}

export function runQualityGateCheck(
	argv: string[],
	today: string = new Date().toISOString().slice(0, 10),
): GateProblem[] {
	const availableScripts = loadPackageScripts();
	const problems: GateProblem[] = [
		...validateGateRegistry({
			gates: QUALITY_GATES,
			budgets: QUALITY_GATE_BUDGETS,
			availableScripts,
			today,
		}),
		...checkBudgets(parseMeasured(argv), QUALITY_GATE_BUDGETS),
		// PLAT-014 release gate: a Must-have command unsupported on a profile without an allowed
		// exception (or a degraded/unsupported entry missing its reason/fallback) blocks the release.
		...validateSupportStatus().map(
			(problem): GateProblem => ({
				gateId: `support-status:${problem.commandId}${problem.profileId ? `/${problem.profileId}` : ''}`,
				kind: 'support-status-violation',
				message: problem.message,
			}),
		),
		// CON-004 permission-sustainability gate: the capability-set model must stay bounded + governed.
		...auditCapabilitySetGovernance().map(
			(problem): GateProblem => ({
				gateId: `con-004:${problem.entityType}${problem.capabilitySet ? `/${problem.capabilitySet}` : ''}`,
				kind: 'permission-sustainability-violation',
				message: `[CON-004] ${problem.message}`,
			}),
		),
		// CON-003 / CON-006 scope-boundary gate: the live registries must stay within declared scope.
		...auditScopeBoundary().map(
			(problem): GateProblem => ({
				gateId: `${problem.requirementId.toLowerCase()}:${problem.axis}/${problem.value}`,
				kind: 'scope-constraint-violation',
				message: `[${problem.requirementId}] ${problem.message}`,
			}),
		),
	];
	return problems;
}

function runCli(): void {
	const problems = runQualityGateCheck(process.argv.slice(2));
	if (problems.length > 0) {
		console.error(`quality-gate check failed with ${problems.length} problem(s):`);
		for (const problem of problems) {
			console.error(`  [${problem.kind}] ${problem.gateId}: ${problem.message}`);
		}
		process.exit(1);
	}
	console.log(
		`quality-gate check passed: ${QUALITY_GATES.length} gate(s) owned, budgeted, and wired to package scripts.`,
	);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
	runCli();
}
