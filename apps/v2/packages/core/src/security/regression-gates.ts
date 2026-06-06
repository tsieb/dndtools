/**
 * SEC-008 — THE SECURITY REGRESSION-GATE REGISTRY. The single, declared source of truth for the
 * security-critical boundaries that MUST stay regression-test-covered (Security Regression Test Coverage;
 * "Defects security carry-forward"). SEC-008 AC1: "a security-critical boundary added without tests fails
 * the gate." This registry — paired with the coverage meta-test that drives it — is exactly that gate.
 *
 * It mirrors the established mechanical-gate pattern in this codebase (the MCP-005 tool-coverage manifest
 * and the PLAT-010 quality-gate registry): a declared list of boundaries, each naming its guard surface +
 * the dedicated test file that exercises it, cross-checked against reality so a gap fails CLOSED. It does
 * NOT re-implement any boundary; every boundary is enforced by code that already exists (the path/content/
 * payload validators, the visibility filter, the replication filter, the MCP staged-write policy, the
 * cloud-join authorization gate, the widget host-permission denial). This module is the INDEX + the proof
 * that none of them can silently lose its tests.
 *
 * The boundaries SEC-008's statement enumerates are all here:
 *   IPC validation, storage containment, markdown sanitization, widget host permission denial,
 *   sync stream filtering, MCP staged write enforcement, and cloud join authorization.
 *
 * The registry also carries the two RENDERER/PLATFORM-ISOLATION boundaries SEC-001 and SEC-007 add, so
 * their new isolation invariants can never silently lose their tests either:
 *   renderer isolation (no Node/filesystem/IPC/cloud reach + hardened renderer-window config) and the
 *   constrained widget host API (capabilities gated by declared host permissions; forbidden platform
 *   surfaces never grantable). They are security-critical boundaries; SEC-008 AC1 keeps them covered.
 *
 * Pure data + pure predicates — no DOM/storage/clock/entropy/network.
 */

/** The stable id of each security-critical boundary SEC-008 requires regression coverage for. */
export type SecurityBoundaryId =
	| 'ipc-payload-validation'
	| 'storage-path-containment'
	| 'markdown-sanitization'
	| 'widget-host-permission-denial'
	| 'sync-stream-filtering'
	| 'mcp-staged-write-enforcement'
	| 'cloud-join-authorization'
	| 'renderer-isolation'
	| 'widget-host-api-constraint';

/**
 * One declared security boundary. `guardSurface` names the core export(s) that ENFORCE the boundary;
 * `coverageTest` names the dedicated test file that proves it; `requirementIds` records the requirement(s)
 * the boundary descends from. The fields are all stable references the coverage gate cross-checks.
 */
export interface SecurityBoundaryDefinition {
	id: SecurityBoundaryId;
	/** A one-line description of the invariant the boundary enforces (fail-closed direction). */
	invariant: string;
	/** The core export(s) that enforce the boundary at runtime (the thing under test). */
	guardSurface: string;
	/** The dedicated regression-test file (repo-relative) that exercises the boundary. */
	coverageTest: string;
	/** The v2 requirement(s) this boundary traces to. */
	requirementIds: string[];
}

/**
 * THE REGISTRY. Every security-critical boundary in v2 has exactly one row. Adding a new boundary without
 * a row — or removing a guard/test a row names — fails the coverage meta-test, so the boundary catalogue
 * can never silently drift away from the code or the tests (SEC-008 AC1).
 */
export const SECURITY_BOUNDARIES: readonly SecurityBoundaryDefinition[] = Object.freeze([
	{
		id: 'ipc-payload-validation',
		invariant:
			'Payloads crossing the IPC/import/sync/widget/MCP boundary are size-limited and schema-validated before allocation-heavy processing; an over-limit or unknown-enum payload is rejected with a structured field-path error.',
		guardSurface: 'validateImportLimits, validateBodyLimit',
		coverageTest: 'apps/v2/packages/core/tests/security-payload-limits.test.ts',
		requirementIds: ['SEC-006', 'SEC-008'],
	},
	{
		id: 'storage-path-containment',
		invariant:
			'Every path-like input is validated (traversal/NUL/scheme/length/absolute) before any read or write, and a resolved path that escapes the vault root is rejected even if earlier validation missed it.',
		guardSurface: 'validatePathInput, resolveWithinVaultRoot',
		coverageTest: 'apps/v2/packages/core/tests/security-path-safety.test.ts',
		requirementIds: ['SEC-002', 'SEC-008'],
	},
	{
		id: 'markdown-sanitization',
		invariant:
			'Untrusted markdown/embeds/imported content is sanitized before entering the renderer DOM: raw HTML/script is neutralized and dangerous URL schemes are stripped.',
		guardSurface: 'sanitizeMarkdownContent',
		coverageTest: 'apps/v2/packages/core/tests/security-content-safety.test.ts',
		requirementIds: ['SEC-003', 'SEC-008'],
	},
	{
		id: 'widget-host-permission-denial',
		invariant:
			'A widget host permission not approved for a destination class is unavailable: outbound/clipboard/storage access is denied fail-closed, and the denied attempt is audited.',
		guardSurface: 'evaluateWidgetOutboundRequest, ALL_HOST_PERMISSIONS',
		coverageTest: 'apps/v2/packages/core/tests/security-widget-exfiltration.test.ts',
		requirementIds: ['SEC-007', 'SEC-011', 'SEC-008'],
	},
	{
		id: 'sync-stream-filtering',
		invariant:
			'Player/observer replication streams are filtered by visibility/grants at the source: a hidden op/field/combatant never enters a non-DM stream, and the boundary guard re-proves no hidden content is delivered.',
		guardSurface: 'filterReplicationStream, assertStreamCarriesNoHiddenContent, assertViewCarriesNoHiddenContent',
		coverageTest: 'apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts',
		requirementIds: ['SEC-005', 'SEC-010', 'SEC-008'],
	},
	{
		id: 'mcp-staged-write-enforcement',
		invariant:
			'A write-capable MCP tool invoked by a non-trusted agent identity is STAGED for approval, not applied directly; staged writes never bypass the command permission/visibility checks.',
		guardSurface: 'invokeMcpTool, createBaselineMcpToolRegistry',
		coverageTest: 'apps/v2/packages/core/tests/mcp-staged-writes.test.ts',
		requirementIds: ['MCP-002', 'SEC-008'],
	},
	{
		id: 'cloud-join-authorization',
		invariant:
			'A participant joining a session/vault/tenant is authorized BEFORE any payload is generated; an unauthorized or revoked participant is denied and receives no stream, with rate-limited joins that do not leak session existence.',
		guardSurface: 'joinSession / evaluateCloudSyncGate (session-join + cloud-enablement authority)',
		coverageTest: 'apps/v2/packages/core/tests/collab-session-join.test.ts',
		requirementIds: ['SEC-005', 'COLLAB-001', 'SEC-008'],
	},
	{
		id: 'renderer-isolation',
		invariant:
			'The renderer/Processing-Core reaches no Node/filesystem/Electron/MCP/cloud API directly (forbidden imports fail the boundary lint); the renderer is exposed ONLY named allowlisted platform-service methods with no generic invoke channel; and a desktop renderer window is rejected unless contextIsolation/sandbox are true, nodeIntegration is false, and the preload exposes only explicit named APIs.',
		guardSurface:
			'isForbiddenRendererImport, auditRendererChannelSurface, validateRendererWindowSecurity',
		coverageTest: 'apps/v2/packages/core/tests/security-renderer-isolation.test.ts',
		requirementIds: ['SEC-001', 'SEC-008'],
	},
	{
		id: 'widget-host-api-constraint',
		invariant:
			'Custom widget code is exposed a constrained host API: a permission-gated capability (clipboard/network/asset/external-link/source-adapter/filesystem) is unavailable unless the declared host permission is approved, and the storage-adapter/IPC/cloud-client/auth-token/platform-bridge/raw-vault-file/hidden-actor-data surfaces are NEVER grantable; a raw-vault-file read is rejected and the widget failure is isolated.',
		guardSurface: 'resolveHostCapability, requestRawVaultFileAccess, requestWidgetNetwork',
		coverageTest: 'apps/v2/packages/core/tests/security-widget-host-api.test.ts',
		requirementIds: ['SEC-007', 'SEC-008'],
	},
] as const);

/** The set of boundary ids the registry declares — the canonical catalogue the gate checks against. */
export const SECURITY_BOUNDARY_IDS: readonly SecurityBoundaryId[] = Object.freeze(
	SECURITY_BOUNDARIES.map((boundary) => boundary.id),
);

/** Look up one boundary by id, or undefined when the id is not declared. */
export function findSecurityBoundary(id: string): SecurityBoundaryDefinition | undefined {
	return SECURITY_BOUNDARIES.find((boundary) => boundary.id === id);
}

/** A problem the registry-consistency check found (used by the SEC-008 coverage meta-test). */
export interface SecurityBoundaryRegistryProblem {
	kind:
		| 'duplicate-boundary-id'
		| 'missing-guard-surface'
		| 'missing-coverage-test'
		| 'missing-requirement-id';
	boundaryId: string;
	message: string;
}

/**
 * Validate the registry's INTERNAL integrity, fail closed: every boundary must have a unique id, a named
 * guard surface, a named coverage test, and at least one requirement id. The coverage meta-test asserts
 * this returns no problems AND additionally proves the named coverage-test files exist on disk and the
 * named guard surfaces are real exports — so the registry can never declare a boundary it does not back
 * with code + tests (SEC-008 AC1). Pure: a function of the registry alone.
 */
export function validateSecurityBoundaryRegistry(
	boundaries: readonly SecurityBoundaryDefinition[] = SECURITY_BOUNDARIES,
): SecurityBoundaryRegistryProblem[] {
	const problems: SecurityBoundaryRegistryProblem[] = [];
	const seen = new Set<string>();

	for (const boundary of boundaries) {
		if (seen.has(boundary.id)) {
			problems.push({
				kind: 'duplicate-boundary-id',
				boundaryId: boundary.id,
				message: `Duplicate security boundary id "${boundary.id}".`,
			});
		}
		seen.add(boundary.id);

		if (boundary.guardSurface.trim().length === 0) {
			problems.push({
				kind: 'missing-guard-surface',
				boundaryId: boundary.id,
				message: `Boundary "${boundary.id}" must name the core guard surface that enforces it.`,
			});
		}
		if (boundary.coverageTest.trim().length === 0) {
			problems.push({
				kind: 'missing-coverage-test',
				boundaryId: boundary.id,
				message: `Boundary "${boundary.id}" must name a dedicated coverage test file.`,
			});
		}
		if (boundary.requirementIds.length === 0) {
			problems.push({
				kind: 'missing-requirement-id',
				boundaryId: boundary.id,
				message: `Boundary "${boundary.id}" must trace to at least one requirement id.`,
			});
		}
	}

	return problems;
}
