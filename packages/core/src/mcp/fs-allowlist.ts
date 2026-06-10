import { z } from 'zod';

/**
 * MCP-012 — the EXPLICIT, FAIL-CLOSED MCP FILESYSTEM / PLATFORM-SERVICE EXCEPTION ALLOWLIST.
 *
 * The Processing Core (and therefore every MCP tool that reads/writes the vault THROUGH it) touches
 * NO filesystem — the boundary lint forbids `fs` / `node:` / `path` / `os` in core, and reads/writes
 * go through actor-filtered queries and commands (MCP-004). But the future MCP sidecar runtime WILL
 * need a few narrow, platform-level filesystem operations (e.g. reading an allowlisted vault export
 * directory, writing a staged-change preview to a contained scratch path). MCP-012 requires those
 * exceptions to be EXPLICITLY ALLOWLISTED, LINTED, and REGRESSION-TESTED — "rather than inferred from
 * broad runtime access" (Known Defect `AUDIT-21.5-MCP-FS-EXCEPTIONS`).
 *
 * This module is the DECLARED registry of those exceptions plus the pure, fail-closed VALIDATOR every
 * such operation must pass BEFORE the platform layer performs it. It is the exact analogue of the
 * PLAT-007 platform-service boundary (`platform/service-boundary.ts`) and the PLAT-006/012 GUI
 * platform-access exception manifest (`apps/gm/platform-access-exceptions.json`), applied to the
 * MCP filesystem surface:
 *
 *   - An operation id NOT in the allowlist is denied (`unknown-operation`). There is no implicit
 *     filesystem access — the registry is the closed set of what MCP may touch (MCP-012 AC1).
 *   - Every operation declares a CONTAINMENT ROOT. A target path that escapes the root (via `..`,
 *     an absolute path, or any traversal) is denied (`path-escapes-root`) — containment is asserted,
 *     not assumed (MCP-012 AC2 containment).
 *   - Every operation declares a SIZE LIMIT. A payload over the limit is denied (`payload-too-large`)
 *     before the platform op runs (MCP-012 AC2 size limits).
 *   - Every operation declares a request SCHEMA. A request that fails it is denied (`invalid-request`)
 *     (MCP-012 AC2 schema validation).
 *   - Every operation declares whether it is AUDITED. The validator surfaces the audit requirement so
 *     no allowlisted filesystem op runs unaudited (MCP-012 AC2 audit behavior).
 *
 * Per ADR-014 the MCP sidecar/filesystem runtime is deferred, so this module performs NO actual
 * filesystem I/O — it is the pure POLICY + path-containment math the platform layer will gate every
 * MCP filesystem op through. It imports no `fs`/`node:`/`path`; the containment check is pure string
 * math so it is identical on every device and testable without a filesystem.
 */

/**
 * The allowlisted MCP filesystem operation ids. A const tuple so the registry, the platform layer,
 * and the regression test share ONE source of truth; an op outside this set fails closed.
 *
 * These two operations are the minimal, contained surface a staged-write MCP workflow needs:
 *   - `vault-export.read`  — read a file from the contained vault-export directory (import context).
 *   - `staged-preview.write` — write a staged-change preview into the contained scratch directory.
 */
export const MCP_FS_OPERATION_IDS = ['vault-export.read', 'staged-preview.write'] as const;

export type McpFsOperationId = (typeof MCP_FS_OPERATION_IDS)[number];

const MCP_FS_OPERATION_ID_SET: ReadonlySet<string> = new Set(MCP_FS_OPERATION_IDS);

export function isMcpFsOperationId(value: string): value is McpFsOperationId {
	return MCP_FS_OPERATION_ID_SET.has(value);
}

/** A declared, allowlisted MCP filesystem exception: containment + size + schema + audit + ownership. */
export interface McpFsExceptionDefinition<TSchema extends z.ZodType = z.ZodType> {
	/** Allowlisted operation id. Registering an id outside the enum throws at construction. */
	operationId: McpFsOperationId;
	/** Whether the op reads or writes. A write carries a `payload`; a read does not. */
	mode: 'read' | 'write';
	/**
	 * The containment ROOT (a normalized, POSIX-style, slash-terminated relative root). Every target
	 * path is resolved against it; a target that escapes it is denied. The root itself must be
	 * relative and traversal-free (asserted at construction) — the sidecar binds it to a concrete
	 * absolute base; the policy here only proves the target stays WITHIN the declared root.
	 */
	containmentRoot: string;
	/** Maximum write-payload size in bytes (write ops only). Oversized payloads are denied. */
	maxPayloadBytes: number;
	/** Runtime schema the request (relativePath + optional payload metadata) must satisfy. */
	requestSchema: TSchema;
	/** Whether the operation is audited. MCP-012 requires every allowlisted fs op to be audited. */
	audited: boolean;
	/** The owning domain/team, mirroring the platform-access exception manifest. */
	owner: string;
	/** Why this exception exists (review evidence). */
	rationale: string;
}

export interface McpFsExceptionRegistry {
	get(operationId: string): McpFsExceptionDefinition | undefined;
	operations(): McpFsOperationId[];
	list(): McpFsExceptionDefinition[];
}

/**
 * Whether a relative target path is CONTAINED within the declared root, computed by pure POSIX-style
 * segment math (no `path`/`fs`). Fails closed:
 *   - an absolute path (leading `/`, or a Windows drive/UNC prefix) is NOT contained,
 *   - any `..` that would walk above the root is NOT contained,
 *   - a `.`-only or empty effective path resolves to the root itself (contained),
 * so a traversal like `../../etc/passwd` or `vault/../../secret` can never escape (MCP-012 AC2).
 */
export function isPathContained(root: string, relativePath: string): boolean {
	if (relativePath.includes('\0')) return false; // NUL byte — reject outright
	// Reject absolute / drive / UNC targets — containment is only meaningful for a relative target.
	if (relativePath.startsWith('/') || relativePath.startsWith('\\')) return false;
	if (/^[A-Za-z]:[\\/]/.test(relativePath)) return false;
	const normalizedRoot = normalizeSegments(root);
	const combined = normalizeSegments(`${root}/${relativePath}`);
	if (combined === null) return false; // escaped above the root during normalization
	// The combined path must be the root itself or a descendant of it.
	if (combined === normalizedRoot) return true;
	const prefix = normalizedRoot === '' ? '' : `${normalizedRoot}/`;
	return combined.startsWith(prefix);
}

/**
 * Normalize a POSIX-style relative path to its canonical segment list joined by `/`, resolving `.`
 * and `..`. Returns `null` when a `..` would walk ABOVE the start (an escape), so the caller fails
 * closed. Pure string math — never touches the filesystem.
 */
function normalizeSegments(input: string): string | null {
	const out: string[] = [];
	for (const rawSegment of input.split(/[\\/]+/)) {
		if (rawSegment === '' || rawSegment === '.') continue;
		if (rawSegment === '..') {
			if (out.length === 0) return null; // escaped above the root
			out.pop();
			continue;
		}
		out.push(rawSegment);
	}
	return out.join('/');
}

/**
 * Build an immutable MCP filesystem exception registry. FAILS CLOSED at construction on a wiring
 * error: an id outside the allowlist, a duplicate id, a non-relative/traversing containment root, or
 * a non-positive size limit all throw — a misconfigured exception can never reach call time.
 */
export function createMcpFsExceptionRegistry(
	definitions: McpFsExceptionDefinition[],
): McpFsExceptionRegistry {
	const byId = new Map<McpFsOperationId, McpFsExceptionDefinition>();
	for (const def of definitions) {
		if (!isMcpFsOperationId(def.operationId)) {
			throw new Error(
				`MCP filesystem operation "${def.operationId}" is not in the allowlist; add it to MCP_FS_OPERATION_IDS.`,
			);
		}
		if (byId.has(def.operationId)) {
			throw new Error(`MCP filesystem operation "${def.operationId}" is registered more than once.`);
		}
		if (def.containmentRoot.trim() === '' || normalizeSegments(def.containmentRoot) === null) {
			throw new Error(
				`MCP filesystem operation "${def.operationId}" has an invalid containment root "${def.containmentRoot}".`,
			);
		}
		if (!(def.maxPayloadBytes > 0)) {
			throw new Error(
				`MCP filesystem operation "${def.operationId}" must declare a positive max payload size.`,
			);
		}
		byId.set(def.operationId, def);
	}
	return {
		get: (operationId) =>
			isMcpFsOperationId(operationId) ? byId.get(operationId) : undefined,
		operations: () => [...byId.keys()].sort((a, b) => a.localeCompare(b)),
		list: () => [...byId.values()].sort((a, b) => a.operationId.localeCompare(b.operationId)),
	};
}

/** Why an MCP filesystem operation was denied at the policy layer, BEFORE any filesystem I/O. */
export type McpFsDenyReason =
	| 'unknown-operation'
	| 'invalid-request'
	| 'path-escapes-root'
	| 'payload-too-large';

/** The request for one MCP filesystem operation: the target (relative) path + optional write payload. */
export interface McpFsRequest {
	operationId: string;
	/** The target path, RELATIVE to the operation's containment root. */
	relativePath: string;
	/** The bytes to write (write ops only). Omitted for reads. */
	payloadBytes?: number;
	/** The full request object validated against the operation's declared schema. */
	request?: unknown;
}

/**
 * The result of gating an MCP filesystem operation. On allow it echoes the resolved facts the
 * platform layer needs (containment root + whether to audit); on deny it carries the machine reason
 * and a generic message. A successful gate does NOT perform the I/O — it certifies the op is safe to
 * perform.
 */
export type McpFsGateResult =
	| {
			ok: true;
			operationId: McpFsOperationId;
			containmentRoot: string;
			/** True when this op is audited — the platform layer must record an audit entry (MCP-012). */
			audited: boolean;
	  }
	| {
			ok: false;
			operationId: string;
			reason: McpFsDenyReason;
			message: string;
			issues?: Array<{ path: string; message: string }>;
			sizeBytes?: number;
			limitBytes?: number;
	  };

/**
 * MCP-012 — GATE an MCP filesystem operation fail-closed, in order:
 *   1. operation must be allowlisted (`unknown-operation`),
 *   2. request must satisfy the operation's schema (`invalid-request`),
 *   3. write payload must be within the size limit (`payload-too-large`),
 *   4. target path must be CONTAINED within the declared root (`path-escapes-root`).
 *
 * Returns a structured result; it never throws and never performs I/O. The platform layer performs
 * the actual read/write ONLY on `ok: true`, and records an audit entry when `audited` is set.
 */
export function gateMcpFsOperation(
	registry: McpFsExceptionRegistry,
	req: McpFsRequest,
): McpFsGateResult {
	const def = registry.get(req.operationId);
	if (!def) {
		return {
			ok: false,
			operationId: req.operationId,
			reason: 'unknown-operation',
			message: `MCP filesystem operation "${req.operationId}" is not allowlisted.`,
		};
	}

	const parsed = def.requestSchema.safeParse(req.request ?? req);
	if (!parsed.success) {
		return {
			ok: false,
			operationId: def.operationId,
			reason: 'invalid-request',
			message: `MCP filesystem request for "${def.operationId}" failed validation.`,
			issues: parsed.error.issues.map((issue) => ({
				path: issue.path.map(String).join('.') || '(root)',
				message: issue.message,
			})),
		};
	}

	if (def.mode === 'write') {
		const size = req.payloadBytes ?? 0;
		if (size > def.maxPayloadBytes) {
			return {
				ok: false,
				operationId: def.operationId,
				reason: 'payload-too-large',
				message: `Payload of ${size} bytes exceeds the ${def.maxPayloadBytes} byte limit for ${def.operationId}.`,
				sizeBytes: size,
				limitBytes: def.maxPayloadBytes,
			};
		}
	}

	if (!isPathContained(def.containmentRoot, req.relativePath)) {
		return {
			ok: false,
			operationId: def.operationId,
			reason: 'path-escapes-root',
			message: `Target path escapes the containment root for ${def.operationId}.`,
		};
	}

	return { ok: true, operationId: def.operationId, containmentRoot: def.containmentRoot, audited: def.audited };
}

const mcpFsReadRequestSchema = z
	.object({ operationId: z.string().min(1), relativePath: z.string().min(1) })
	.loose();

const mcpFsWriteRequestSchema = z
	.object({
		operationId: z.string().min(1),
		relativePath: z.string().min(1),
		payloadBytes: z.number().int().nonnegative(),
	})
	.loose();

/** Max bytes a staged-change preview may write (a bounded scratch artifact, not a vault asset). */
export const DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES = 1 * 1024 * 1024;

/**
 * The canonical baseline MCP filesystem exception allowlist. EVERY entry is contained, size-bounded,
 * schema-validated, and audited — there is no broad runtime filesystem access. This is the closed set
 * the MCP-012 regression test asserts against; a filesystem op outside it fails closed.
 */
export function createBaselineMcpFsExceptionRegistry(): McpFsExceptionRegistry {
	return createMcpFsExceptionRegistry([
		{
			operationId: 'vault-export.read',
			mode: 'read',
			containmentRoot: 'mcp/vault-export',
			maxPayloadBytes: DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES,
			requestSchema: mcpFsReadRequestSchema,
			audited: true,
			owner: 'MCP (sidecar filesystem)',
			rationale:
				'The contained vault-export directory an MCP import workflow may read. Confined to mcp/vault-export; every read is audited.',
		},
		{
			operationId: 'staged-preview.write',
			mode: 'write',
			containmentRoot: 'mcp/staged-previews',
			maxPayloadBytes: DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES,
			requestSchema: mcpFsWriteRequestSchema,
			audited: true,
			owner: 'MCP (sidecar filesystem)',
			rationale:
				'The contained scratch directory an MCP staged-write preview is written to. Confined to mcp/staged-previews, size-bounded, and audited.',
		},
	]);
}
