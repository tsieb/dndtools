import type { ActorId } from '../state/ids';
import type { PermissionState } from '../state/permission-state';
import {
	auditPermissionConsistency,
	auditEntityPermissionConsistency,
	type EntityConsistencyInput,
	type EntityConsistencyProblem,
	type PermissionConsistencyProblem,
} from './consistency';
import type { AccessDenialAuditRecord } from './access-audit';

/**
 * PERM-014 — permission/visibility/role audits produce ACTIONABLE DM diagnostics, without ever
 * exposing hidden entity titles, field values, or player-only shared content to unauthorized
 * actors (Architecture Contract 3 Consistency Requirements; Security requirements).
 *
 * Two projections of the same underlying audit:
 *
 *   - The DM view (`getPermissionDiagnosticsForDm`) is actionable: every problem carries the
 *     affected entity REFERENCE (type + id), the grant, the reason kind, and a remediation action.
 *     It still never carries a title or field value — those are not in the audit inputs at all, so
 *     the diagnostics are leak-proof by construction, not by post-hoc scrubbing.
 *   - The non-DM / unauthorized view collapses to a single generic, non-leaking reason. A player
 *     who reaches a diagnostic only through a command denial sees `unavailable`/`unauthorized` and
 *     nothing else — no entity reference, no grant, no count of how many problems exist.
 *
 * The split is computed in the pure core; the GUI renders whichever projection the actor is
 * entitled to. The GUI does not compute or override the entitlement.
 */

/** A single actionable diagnostic the DM sees. Reference + reason + remediation only. */
export interface DmPermissionDiagnostic {
	/** A stable category for the underlying problem. */
	category:
		| 'role-consistency'
		| 'grant-consistency'
		| 'entity-consistency'
		| 'denied-access';
	kind: string;
	severity: 'error' | 'warning';
	actorId: ActorId | null;
	grantId: string | null;
	entityType: string | null;
	entityId: string | null;
	capabilitySet: string | null;
	/** Generic, non-leaking remediation hint for the DM. */
	remediation: string;
}

export interface DmPermissionDiagnosticsView {
	kind: 'permission-diagnostics';
	actorId: ActorId;
	diagnostics: DmPermissionDiagnostic[];
	errorCount: number;
	warningCount: number;
	hasErrors: boolean;
}

/** What a non-DM / unauthorized actor sees: a single generic reason and nothing else. */
export interface ActorPermissionDiagnosticsView {
	kind: 'permission-diagnostics-redacted';
	reason: 'unavailable' | 'unauthorized';
	message: string;
}

export type PermissionDiagnosticsResult =
	| DmPermissionDiagnosticsView
	| ActorPermissionDiagnosticsView;

const REDACTED_MESSAGE = 'This information is unavailable.' as const;
const UNAUTHORIZED_MESSAGE = 'You are not authorized to view diagnostics.' as const;

/** The inputs an actor may reach a denial diagnostic through, plus the entity-audit input. */
export interface PermissionDiagnosticsInput {
	entityConsistency?: EntityConsistencyInput;
	/** Denied cross-trust-boundary access records to fold into the DM diagnostics. */
	deniedAccess?: AccessDenialAuditRecord[];
}

function roleProblemToDiagnostic(problem: PermissionConsistencyProblem): DmPermissionDiagnostic {
	const category: DmPermissionDiagnostic['category'] =
		problem.kind === 'ambiguous-base-role' ? 'role-consistency' : 'grant-consistency';
	return {
		category,
		kind: problem.kind,
		severity: problem.severity,
		actorId: problem.actorId,
		grantId: problem.grantId,
		entityType: problem.entityType,
		entityId: problem.entityId,
		capabilitySet: problem.capabilitySet,
		remediation: problem.remediation,
	};
}

function entityProblemToDiagnostic(problem: EntityConsistencyProblem): DmPermissionDiagnostic {
	return {
		category: 'entity-consistency',
		kind: problem.kind,
		severity: problem.severity,
		actorId: problem.actorId,
		grantId: problem.grantId,
		entityType: problem.entityType,
		entityId: problem.entityId,
		capabilitySet: problem.capabilitySet,
		remediation: problem.remediation,
	};
}

function deniedAccessToDiagnostic(record: AccessDenialAuditRecord): DmPermissionDiagnostic {
	return {
		category: 'denied-access',
		kind: `denied-${record.reason}`,
		severity: 'warning',
		actorId: record.actorId,
		grantId: null,
		entityType: record.entityType,
		entityId: record.entityId,
		capabilitySet: null,
		remediation:
			record.reason === 'no-permission'
				? 'A participant was denied a write they could see but lacked permission for. Grant the capability if intended.'
				: 'A participant attempted to reach content they cannot see. No action needed unless the visibility is wrong.',
	};
}

/**
 * True when the actor may view the DM permission diagnostics. Only the DM is authorized; non-DM
 * participants (including players and observers) are not, regardless of any grant — permission
 * diagnostics are a DM administrative surface (Contract 3 DM Authority). Fails closed for unknown
 * actors.
 */
export function actorCanViewPermissionDiagnostics(
	permissions: PermissionState,
	actorId: ActorId | null | undefined,
): boolean {
	if (actorId === null || actorId === undefined || actorId === '') return false;
	const actor = permissions.actors[actorId];
	return !!actor && actor.role === 'dm';
}

/**
 * Build the actionable DM diagnostics view by folding the role/grant consistency audit, the
 * entity consistency audit, and any denied-access records into one ordered list. Errors first.
 * This is the DM-only projection; callers must gate it with
 * {@link actorCanViewPermissionDiagnostics}, or use {@link getPermissionDiagnostics} which gates
 * for them.
 */
export function getPermissionDiagnosticsForDm(
	permissions: PermissionState,
	actorId: ActorId,
	input: PermissionDiagnosticsInput = {},
): DmPermissionDiagnosticsView {
	const diagnostics: DmPermissionDiagnostic[] = [];

	for (const problem of auditPermissionConsistency(permissions).problems) {
		diagnostics.push(roleProblemToDiagnostic(problem));
	}

	if (input.entityConsistency) {
		const report = auditEntityPermissionConsistency(permissions, input.entityConsistency);
		for (const problem of report.problems) {
			diagnostics.push(entityProblemToDiagnostic(problem));
		}
	}

	for (const record of input.deniedAccess ?? []) {
		diagnostics.push(deniedAccessToDiagnostic(record));
	}

	// Errors before warnings; otherwise preserve discovery order for stable rendering.
	diagnostics.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

	const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
	const warningCount = diagnostics.length - errorCount;

	return {
		kind: 'permission-diagnostics',
		actorId,
		diagnostics,
		errorCount,
		warningCount,
		hasErrors: errorCount > 0,
	};
}

function severityRank(severity: 'error' | 'warning'): number {
	return severity === 'error' ? 0 : 1;
}

/**
 * The actor-scoped entry point. The DM receives the actionable diagnostics; every other actor
 * receives only a generic redacted view (`unavailable` for a known non-DM participant,
 * `unauthorized` for an unknown/unauthenticated requester). This is the function the GUI calls; it
 * cannot accidentally leak the DM view because the gate is inside the core.
 */
export function getPermissionDiagnostics(
	permissions: PermissionState,
	actorId: ActorId | null | undefined,
	input: PermissionDiagnosticsInput = {},
): PermissionDiagnosticsResult {
	if (actorId === null || actorId === undefined || actorId === '') {
		return {
			kind: 'permission-diagnostics-redacted',
			reason: 'unauthorized',
			message: UNAUTHORIZED_MESSAGE,
		};
	}
	const actor = permissions.actors[actorId];
	if (!actor) {
		return {
			kind: 'permission-diagnostics-redacted',
			reason: 'unauthorized',
			message: UNAUTHORIZED_MESSAGE,
		};
	}
	if (actor.role !== 'dm') {
		return {
			kind: 'permission-diagnostics-redacted',
			reason: 'unavailable',
			message: REDACTED_MESSAGE,
		};
	}
	return getPermissionDiagnosticsForDm(permissions, actorId, input);
}
