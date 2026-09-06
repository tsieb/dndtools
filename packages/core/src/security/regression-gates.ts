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
 * It also carries the four SECRETS / CLOUD-COLLABORATION boundaries SEC-004, SEC-005, SEC-009, and SEC-012
 * add, so the secrets/cloud-security policy this epic delivers can never silently lose its tests either:
 *   secret custody (auth/refresh/session/cloud/MCP secrets never cross a durable/outbound channel in
 *   plaintext), the cloud-collaboration boundary (rate-limited non-disclosing joins + revocation +
 *   tenant/session/stream isolation + fail-closed payload-version parsing + replay rejection, all BEFORE
 *   payload generation), the cloud security model + release gate (cloud release blocked without an approved
 *   decision record; an E2EE claim exposes only allowed metadata server-side), and cloud key custody
 *   (rotation on revocation locks out a removed participant; recovery restores only the approved scope; a
 *   compromised store exposes only ciphertext + documented metadata). They are security-critical boundaries;
 *   SEC-008 AC1 keeps them covered.
 *
 * RC-ENG-5.2 adds four more, for invariants that had no tracked regression gate yet:
 *   a widget iframe cannot reach `window.parent`'s state (no `allow-same-origin` token, ever), the
 *   sandbox document's Content-Security-Policy is exact (not merely "present"), a system package
 *   cannot carry a function value anywhere in its data, and a player-private-store field can never
 *   reach a returned view-model. The first two reuse the existing sandbox-document guard; the last
 *   two are net-new generic structural walkers this module defines directly (see below), because
 *   neither invariant belongs to an existing domain module.
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
	| 'widget-host-api-constraint'
	| 'secret-custody'
	| 'cloud-collaboration-boundary'
	| 'cloud-security-model-gate'
	| 'cloud-key-custody'
	| 'widget-parent-window-isolation'
	| 'widget-sandbox-csp-exact'
	| 'system-package-no-functions'
	| 'private-store-view-model-exclusion';

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
		coverageTest: 'packages/core/tests/security-payload-limits.test.ts',
		requirementIds: ['SEC-006', 'SEC-008'],
	},
	{
		id: 'storage-path-containment',
		invariant:
			'Every path-like input is validated (traversal/NUL/scheme/length/absolute) before any read or write, and a resolved path that escapes the vault root is rejected even if earlier validation missed it.',
		guardSurface: 'validatePathInput, resolveWithinVaultRoot, checkVaultContainment',
		coverageTest: 'packages/core/tests/security-path-safety.test.ts',
		requirementIds: ['SEC-002', 'SEC-008'],
	},
	{
		id: 'markdown-sanitization',
		invariant:
			'Untrusted markdown/embeds/imported content is sanitized before entering the renderer DOM: raw HTML/script is neutralized and dangerous URL schemes are stripped.',
		guardSurface: 'sanitizeMarkdownContent',
		coverageTest: 'packages/core/tests/security-content-safety.test.ts',
		requirementIds: ['SEC-003', 'SEC-008'],
	},
	{
		id: 'widget-host-permission-denial',
		invariant:
			'A widget host permission not approved for a destination class is unavailable: outbound/clipboard/storage access is denied fail-closed, and the denied attempt is audited.',
		guardSurface: 'evaluateWidgetOutboundRequest, ALL_HOST_PERMISSIONS',
		coverageTest: 'packages/core/tests/security-widget-exfiltration.test.ts',
		requirementIds: ['SEC-007', 'SEC-011', 'SEC-008'],
	},
	{
		id: 'sync-stream-filtering',
		invariant:
			'Player/observer replication streams are filtered by visibility/grants at the source: a hidden op/field/combatant never enters a non-DM stream, and the boundary guard re-proves no hidden content is delivered.',
		guardSurface:
			'filterReplicationStream, assertStreamCarriesNoHiddenContent, assertViewCarriesNoHiddenContent',
		coverageTest: 'packages/core/tests/sec-stream-privacy-coverage.test.ts',
		requirementIds: ['SEC-005', 'SEC-010', 'SEC-008'],
	},
	{
		id: 'mcp-staged-write-enforcement',
		invariant:
			'A write-capable MCP tool invoked by a non-trusted agent identity is STAGED for approval, not applied directly; staged writes never bypass the command permission/visibility checks.',
		guardSurface: 'invokeMcpTool, createBaselineMcpToolRegistry',
		coverageTest: 'packages/core/tests/mcp-staged-writes.test.ts',
		requirementIds: ['MCP-002', 'SEC-008'],
	},
	{
		id: 'cloud-join-authorization',
		invariant:
			'A participant joining a session/vault/tenant is authorized BEFORE any payload is generated; an unauthorized or revoked participant is denied and receives no stream, with rate-limited joins that do not leak session existence.',
		guardSurface: 'joinSession / evaluateCloudSyncGate (session-join + cloud-enablement authority)',
		coverageTest: 'packages/core/tests/collab-session-join.test.ts',
		requirementIds: ['SEC-005', 'COLLAB-001', 'SEC-008'],
	},
	{
		id: 'renderer-isolation',
		invariant:
			'The renderer/Processing-Core reaches no Node/filesystem/Electron/MCP/cloud API directly (forbidden imports fail the boundary lint); the renderer is exposed ONLY named allowlisted platform-service methods with no generic invoke channel; and a desktop renderer window is rejected unless contextIsolation/sandbox are true, nodeIntegration is false, and the preload exposes only explicit named APIs.',
		guardSurface:
			'isForbiddenRendererImport, auditRendererChannelSurface, validateRendererWindowSecurity',
		coverageTest: 'packages/core/tests/security-renderer-isolation.test.ts',
		requirementIds: ['SEC-001', 'SEC-008'],
	},
	{
		id: 'widget-host-api-constraint',
		invariant:
			'Custom widget code is exposed a constrained host API: a permission-gated capability (clipboard/network/asset/external-link/source-adapter/filesystem) is unavailable unless the declared host permission is approved, and the storage-adapter/IPC/cloud-client/auth-token/platform-bridge/raw-vault-file/hidden-actor-data surfaces are NEVER grantable; a raw-vault-file read is rejected and the widget failure is isolated.',
		guardSurface: 'resolveHostCapability, requestRawVaultFileAccess, requestWidgetNetwork',
		coverageTest: 'packages/core/tests/security-widget-host-api.test.ts',
		requirementIds: ['SEC-007', 'SEC-008'],
	},
	{
		id: 'secret-custody',
		invariant:
			'Auth/refresh/session/cloud/MCP secrets are device-local credential-store material and NEVER cross a durable/outbound channel (vault markdown, export package, operation log, sync stream, player stream, diagnostics, log, or error message) in plaintext; a planted secret is detected and blocked fail-closed by the boundary guard that reuses the diagnostics redaction scrubber.',
		guardSurface: 'assertNoSecretLeak, findSecretLeak, assertSecretCategoryIsDeviceLocal',
		coverageTest: 'packages/core/tests/security-secret-custody.test.ts',
		requirementIds: ['SEC-004', 'SEC-008'],
	},
	{
		id: 'cloud-collaboration-boundary',
		invariant:
			'A cloud-collaboration request is decided fail-closed BEFORE any payload is generated: repeated invalid joins are rate-limited without leaking session existence; a revoked participant is denied and their queued ops at/after the revocation are rejected; a cross-tenant/session/stream request is denied; an unsupported payload version fails closed with an upgrade-required diagnostic; and a replayed nonce is rejected/ignored idempotently.',
		guardSurface:
			'evaluateCloudJoinGate, authorizeCloudRequest, evaluateJoinRateLimit, isQueuedOpAdmissibleAfterRevocation',
		coverageTest: 'packages/core/tests/security-cloud-boundary.test.ts',
		requirementIds: ['SEC-005', 'SEC-008'],
	},
	{
		id: 'cloud-security-model-gate',
		invariant:
			'Cloud sync/collaboration release is BLOCKED until a complete, approved cloud security decision record (encryption responsibilities, key custody, server trust boundary, credential rotation, recovery tradeoffs) AND the SYNC-017 prerequisites are satisfied; under an end-to-end-encryption claim, server-side code paths see ONLY the explicitly allowed metadata classes — never hidden content.',
		guardSurface:
			'evaluateCloudReleaseGate, validateCloudSecurityRecord, assertServerSeesOnlyAllowedMetadata',
		coverageTest: 'packages/core/tests/security-cloud-security-model.test.ts',
		requirementIds: ['SEC-009', 'SEC-008'],
	},
	{
		id: 'cloud-key-custody',
		invariant:
			'Cloud key custody is enforced fail-closed: rotating the key on a participant revocation locks the removed participant out of the new content epoch (their credentials cannot decrypt newly delivered/synced content); a recovery flow restores ONLY the approved scope and never another vault/tenant/participant stream; and a compromised cloud store exposes ONLY ciphertext plus the documented metadata classes.',
		guardSurface:
			'assertRevokedCannotDecryptNewEpoch, assertRecoveryWithinScope, assertCompromiseMatchesTrustBoundary',
		coverageTest: 'packages/core/tests/security-key-custody.test.ts',
		requirementIds: ['SEC-012', 'SEC-008'],
	},
	{
		id: 'widget-parent-window-isolation',
		invariant:
			'A custom-widget iframe never carries the allow-same-origin sandbox token, so it can never reach window.parent/top DOM, storage, or cookies even though the reference exists — an opaque origin cannot cross the browser same-origin boundary to read it.',
		guardSurface: 'validateWidgetSandboxDocument, FORBIDDEN_WIDGET_SANDBOX_TOKENS',
		coverageTest: 'packages/core/tests/security-renderer-isolation.test.ts',
		requirementIds: ['SEC-001', 'RC-ENG-5.2'],
	},
	{
		id: 'widget-sandbox-csp-exact',
		invariant:
			"The widget sandbox document's Content-Security-Policy matches the declared baseline EXACTLY, directive by directive (not merely \"some policy present\"): a missing directive or a weakened value (e.g. connect-src widened off 'none') is rejected.",
		guardSurface: 'validateWidgetSandboxDocument, WIDGET_SANDBOX_CSP_DIRECTIVES',
		coverageTest: 'packages/core/tests/security-renderer-isolation.test.ts',
		requirementIds: ['SEC-001', 'RC-ENG-5.2'],
	},
	{
		id: 'system-package-no-functions',
		invariant:
			'A system package carries only plain, serializable data: no function value anywhere in its tree, however the package was constructed (parsed, generated, or built in-process) — a function would let "system package as data" become unreviewed code.',
		guardSurface: 'assertSystemPackageCarriesNoFunctions',
		coverageTest: 'packages/core/tests/sec-eng-5-2-structural-boundaries.test.ts',
		requirementIds: ['RC-ENG-5.2'],
	},
	{
		id: 'private-store-view-model-exclusion',
		invariant:
			'A player-private-store field (DM-invisible note/bookmark/impression) is never reachable from a returned view-model, at any depth — fail closed on any object key matching a declared private-field name, anywhere in the tree.',
		guardSurface: 'assertViewModelExcludesPrivateFields',
		coverageTest: 'packages/core/tests/sec-eng-5-2-structural-boundaries.test.ts',
		requirementIds: ['RC-ENG-5.2'],
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

// ── RC-ENG-5.2 — two NET-NEW boundary predicates ──────────────────────────────────────────────────
//
// The other two RC-ENG-5.2 invariants (a widget iframe cannot reach `window.parent` state; the
// sandbox document's CSP is exact) are ALREADY enforced by `validateWidgetSandboxDocument` in
// `security/renderer-isolation.ts` (the absent `allow-same-origin` token is exactly what keeps a
// same-origin `window.parent` reach out of reach; the CSP-directive loop is exactly the "exact"
// check) — those two rows below just declare the existing guard as a tracked boundary, per this
// module's "index, not reimplementation" rule.
//
// The remaining two invariants have no home yet (system packages / a player-private store), so —
// same as every other row — a real guard has to exist before it can be declared. They live HERE
// rather than in a domain module because neither invariant belongs to one: "no function value
// anywhere in this data" and "no field with this name anywhere in this view-model" are generic,
// reusable STRUCTURAL walkers, not something `system-package.ts` or a not-yet-built private-store
// module needs to carry. `system-package.ts`'s own zod schema already refuses a function at parse
// time (every field is concretely typed), but a package can also be constructed in-process — by a
// generator, a fixture, an MCP tool, a future importer — without ever going through that parse
// boundary; this walker is the fail-closed backstop for that path, mirroring the "even if earlier
// validation missed it" posture `path-safety.ts` already uses for storage containment.

/** One place in a value tree where a forbidden function or field name was found (dotted JSON path). */
export interface StructuralLeakViolation {
	/** Dotted/bracketed path to the offending value (e.g. `"data.effects[2].onHit"`). */
	path: string;
	/** The offending key name, for a field-name violation; absent for a bare function-value violation. */
	fieldName?: string;
}

function walkStructure(
	value: unknown,
	path: string,
	seen: Set<unknown>,
	visit: (value: unknown, path: string, key: string | null) => void,
	key: string | null = null,
): void {
	visit(value, path, key);
	if (value === null || typeof value !== 'object') return;
	if (seen.has(value)) return; // a cyclic reference can never hide a second copy of a leak
	seen.add(value);
	if (Array.isArray(value)) {
		value.forEach((item, index) => walkStructure(item, `${path}[${index}]`, seen, visit, null));
		return;
	}
	for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
		walkStructure(
			childValue,
			path === '' ? childKey : `${path}.${childKey}`,
			seen,
			visit,
			childKey,
		);
	}
}

/**
 * RC-ENG-5.2 — a system package (however it was constructed — parsed, generated, or built in-process)
 * MUST carry only plain, serializable data: fail closed on any function-typed value anywhere in the
 * tree. A system package that could carry a function would let the "system package as data" boundary
 * (RC-SYS) turn into arbitrary code the DM never reviewed and the sync log cannot safely replicate.
 * Pure; walks the value once, defends against cycles.
 */
export function assertSystemPackageCarriesNoFunctions(pkg: unknown): StructuralLeakViolation[] {
	const violations: StructuralLeakViolation[] = [];
	walkStructure(pkg, '$', new Set(), (value, path) => {
		if (typeof value === 'function') violations.push({ path });
	});
	return violations;
}

/**
 * RC-ENG-5.2 — a player-private-store field (e.g. a future `platform/storage/privateStore.ts` DM-
 * invisible note/bookmark) must NEVER be reachable from a returned view-model, at any depth: fail
 * closed on any object key matching a declared private-field name, anywhere in the tree. Generic and
 * reusable, so the CHR-4.1 private-store view-model(s) can be proven clean with this ONE walker
 * instead of a bespoke leak check per screen. Case-insensitive (a renamed/aliased field must not
 * quietly slip past an exact-case check). Pure; walks the value once, defends against cycles.
 */
export function assertViewModelExcludesPrivateFields(
	viewModel: unknown,
	privateFieldNames: readonly string[],
): StructuralLeakViolation[] {
	const forbidden = new Set(privateFieldNames.map((name) => name.toLowerCase()));
	const violations: StructuralLeakViolation[] = [];
	walkStructure(viewModel, '$', new Set(), (_value, path, key) => {
		if (key !== null && forbidden.has(key.toLowerCase())) {
			violations.push({ path, fieldName: key });
		}
	});
	return violations;
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
