import { z } from 'zod';

/**
 * PLAT-007: Platform-service boundary contract.
 *
 * Every call that crosses the GUI -> Platform Services boundary (Contract 1) must go
 * through a named method whose request payload is validated by a runtime schema, bounded
 * by a payload size limit, and constrained to an enum allowlist of method names. Failures
 * are returned as structured errors, never thrown opaque values, so the boundary fails
 * closed before any business logic runs.
 *
 * The first v2 prototype has no Electron IPC channel, but it has the same trust boundary:
 * the GUI hands durable-state payloads to the browser-local storage adapter. This contract
 * is the single mechanism that guards that boundary today and is the seam an Electron/MCP
 * IPC bridge will reuse unchanged.
 */

/**
 * Allowlisted platform-service method names. Registering or invoking any method outside
 * this enum fails closed. This is the enum allowlist required by PLAT-007 AC1.
 */
export const PLATFORM_SERVICE_METHODS = [
	'storage.loadCoreState',
	'storage.persistFullState',
	'storage.recoverPendingMigration',
	'storage.resetCoreStorage',
] as const;

export type PlatformServiceMethod = (typeof PLATFORM_SERVICE_METHODS)[number];

const PLATFORM_SERVICE_METHOD_SET: ReadonlySet<string> = new Set(PLATFORM_SERVICE_METHODS);

export function isPlatformServiceMethod(value: string): value is PlatformServiceMethod {
	return PLATFORM_SERVICE_METHOD_SET.has(value);
}

/**
 * Maximum serialized request payload size accepted across the platform-service boundary,
 * in bytes. Oversized payloads are rejected before parsing/business logic (PLAT-007 AC2).
 * The default protects the local prototype's IndexedDB documents; binary assets are out of
 * scope for the operation log per ADR-014 and Contract 2.
 */
export const DEFAULT_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

export type PlatformBoundaryErrorCode =
	| 'unknown-method'
	| 'payload-too-large'
	| 'payload-not-serializable'
	| 'invalid-payload';

export interface PlatformBoundaryError {
	code: PlatformBoundaryErrorCode;
	method: string;
	message: string;
	issues?: Array<{ path: string; message: string }>;
	/** Present for size failures so callers/telemetry can report the breach. */
	sizeBytes?: number;
	limitBytes?: number;
}

export type PlatformBoundaryResult<T> =
	| { ok: true; method: PlatformServiceMethod; value: T }
	| { ok: false; error: PlatformBoundaryError };

/**
 * Definition for one named platform-service method: its runtime request schema and an
 * optional per-method payload size override. Methods are registered in a single registry
 * so a handler can never be wired up without a schema (PLAT-007 AC1).
 */
export interface PlatformServiceMethodDefinition<TSchema extends z.ZodType = z.ZodType> {
	method: PlatformServiceMethod;
	requestSchema: TSchema;
	maxPayloadBytes?: number;
}

export interface PlatformServiceRegistry {
	get(method: string): PlatformServiceMethodDefinition | undefined;
	methods(): PlatformServiceMethod[];
}

/**
 * Build an immutable platform-service registry. Throws if a definition names a method
 * outside the allowlist or if a method is registered twice — wiring errors fail closed at
 * construction, not at call time.
 */
export function createPlatformServiceRegistry(
	definitions: PlatformServiceMethodDefinition[],
): PlatformServiceRegistry {
	const byMethod = new Map<PlatformServiceMethod, PlatformServiceMethodDefinition>();
	for (const def of definitions) {
		if (!isPlatformServiceMethod(def.method)) {
			throw new Error(
				`Platform-service method "${def.method}" is not in the allowlist; add it to PLATFORM_SERVICE_METHODS.`,
			);
		}
		if (byMethod.has(def.method)) {
			throw new Error(`Platform-service method "${def.method}" is registered more than once.`);
		}
		byMethod.set(def.method, def);
	}
	return {
		get: (method) =>
			isPlatformServiceMethod(method) ? byMethod.get(method) : undefined,
		methods: () => [...byMethod.keys()],
	};
}

function serializedByteLength(payload: unknown): number | null {
	let serialized: string;
	try {
		serialized = JSON.stringify(payload);
	} catch {
		return null;
	}
	// JSON.stringify returns undefined for values like a bare `undefined`.
	if (serialized === undefined) return null;
	// Count UTF-8 bytes so multi-byte content is measured accurately against the limit.
	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(serialized).length;
	}
	return serialized.length;
}

/**
 * Validate a request crossing the platform-service boundary. Order matters and each gate
 * fails closed:
 *
 * 1. Method must be a registered, allowlisted name (PLAT-007 enum allowlist).
 * 2. Payload must be JSON-serializable and within the size limit (PLAT-007 AC2: oversized
 *    payloads are rejected before business logic).
 * 3. Payload must satisfy the method's runtime schema (PLAT-007 AC1).
 *
 * Returns a structured result; it never throws for a rejected request.
 */
export function validatePlatformRequest<T = unknown>(
	registry: PlatformServiceRegistry,
	method: string,
	payload: unknown,
): PlatformBoundaryResult<T> {
	const definition = registry.get(method);
	if (!definition) {
		return {
			ok: false,
			error: {
				code: 'unknown-method',
				method,
				message: `Platform-service method "${method}" is not registered.`,
			},
		};
	}

	const limit = definition.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
	const sizeBytes = serializedByteLength(payload);
	if (sizeBytes === null) {
		return {
			ok: false,
			error: {
				code: 'payload-not-serializable',
				method: definition.method,
				message: 'Platform-service payload is not JSON-serializable.',
			},
		};
	}
	if (sizeBytes > limit) {
		return {
			ok: false,
			error: {
				code: 'payload-too-large',
				method: definition.method,
				message: `Payload of ${sizeBytes} bytes exceeds the ${limit} byte limit for ${definition.method}.`,
				sizeBytes,
				limitBytes: limit,
			},
		};
	}

	const parsed = definition.requestSchema.safeParse(payload);
	if (!parsed.success) {
		return {
			ok: false,
			error: {
				code: 'invalid-payload',
				method: definition.method,
				message: `Platform-service payload for ${definition.method} failed schema validation.`,
				issues: parsed.error.issues.map((issue) => ({
					path: issue.path.map(String).join('.') || '(root)',
					message: issue.message,
				})),
			},
		};
	}

	return { ok: true, method: definition.method, value: parsed.data as T };
}
