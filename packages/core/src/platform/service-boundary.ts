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
	// Asset-byte store (ADR-014 amendment): raw bytes never cross the JSON boundary — these
	// methods validate a small {id, mime, byteLength} DESCRIPTOR here, and the adapter enforces
	// the byte-length limit against the actual buffer before touching storage.
	'storage.putAssetBytes',
	'storage.getAssetBytes',
	'storage.deleteAssetBytes',
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
		get: (method) => (isPlatformServiceMethod(method) ? byMethod.get(method) : undefined),
		methods: () => [...byMethod.keys()],
	};
}

/**
 * Measure a payload against its byte limit: `null` when it is not JSON-serializable, otherwise
 * whether it fits and, when it does not, its exact UTF-8 size for the error.
 */
function measurePayload(
	payload: unknown,
	limit: number,
): { fits: true } | { fits: false; sizeBytes: number } | null {
	let sizeBytes: number | undefined;
	try {
		sizeBytes = jsonUtf8Length(payload);
	} catch {
		return null;
	}
	// JSON.stringify returns undefined for values like a bare `undefined`.
	if (sizeBytes === undefined) return null;
	return sizeBytes > limit ? { fits: false, sizeBytes } : { fits: true };
}

/** Measured objects and arrays, by identity. See {@link jsonUtf8Length}. */
const measuredContainers = new WeakMap<object, number>();

/**
 * The UTF-8 byte length of `JSON.stringify(value)`, without building the string. It returns
 * `undefined` where `JSON.stringify` returns `undefined`, and throws where it throws (a cycle, a
 * BigInt, a throwing `toJSON` or getter).
 *
 * RC-ENG-3.2 — every durable commit sends the whole next state across the boundary, so stringifying
 * it to check the size limit cost time in proportion to the vault on every command. Core state is
 * immutable and structurally shared: a command replaces the objects on the path it changed and keeps
 * the rest. Each object and array's length is therefore remembered by identity, and a commit measures
 * only the objects it replaced. Objects with a `toJSON` are measured through it and not remembered.
 */
export function jsonUtf8Length(value: unknown): number | undefined {
	return propertyBytes(value, '', new Set());
}

function propertyBytes(input: unknown, key: string, path: Set<object>): number | undefined {
	let value = input;
	if ((typeof value === 'object' && value !== null) || typeof value === 'bigint') {
		const toJSON = (value as { toJSON?: unknown }).toJSON;
		if (typeof toJSON === 'function') value = toJSON.call(value, key);
	}
	if (value instanceof Number) value = Number(value);
	else if (value instanceof String) value = String(value);
	else if (value instanceof Boolean) value = value.valueOf();
	switch (typeof value) {
		case 'string':
			return stringBytes(value);
		case 'number':
			return Number.isFinite(value) ? String(value).length : 4;
		case 'boolean':
			return value ? 4 : 5;
		case 'bigint':
			throw new TypeError('Do not know how to serialize a BigInt');
		case 'object':
			if (value === null) return 4;
			return containerBytes(value, value !== input, path);
		default:
			// undefined, a function or a symbol: dropped from an object, `null` in an array.
			return undefined;
	}
}

function containerBytes(value: object, transient: boolean, path: Set<object>): number {
	const known = transient ? undefined : measuredContainers.get(value);
	if (known !== undefined) return known;
	if (path.has(value)) throw new TypeError('Converting circular structure to JSON');
	path.add(value);
	let bytes = 2;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i += 1) {
			bytes += (i > 0 ? 1 : 0) + (propertyBytes(value[i], String(i), path) ?? 4);
		}
	} else {
		let members = 0;
		for (const key of Object.keys(value)) {
			const member = propertyBytes((value as Record<string, unknown>)[key], key, path);
			if (member === undefined) continue;
			bytes += (members > 0 ? 1 : 0) + stringBytes(key) + 1 + member;
			members += 1;
		}
	}
	path.delete(value);
	if (!transient) measuredContainers.set(value, bytes);
	return bytes;
}

/** Bytes of `JSON.stringify(text)`: quotes, two-character and `\u` escapes, then UTF-8. */
function stringBytes(text: string): number {
	let bytes = 2;
	for (let i = 0; i < text.length; i += 1) {
		const unit = text.charCodeAt(i);
		if (unit < 0x80) {
			if (unit === 0x22 || unit === 0x5c) bytes += 2;
			else if (unit >= 0x20) bytes += 1;
			else if (unit === 0x08 || unit === 0x09 || unit === 0x0a || unit === 0x0c || unit === 0x0d)
				bytes += 2;
			else bytes += 6;
		} else if (unit < 0x800) {
			bytes += 2;
		} else if (unit >= 0xd800 && unit <= 0xdbff) {
			const next = text.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				i += 1;
			} else bytes += 6;
		} else if (unit >= 0xdc00 && unit <= 0xdfff) {
			bytes += 6;
		} else {
			bytes += 3;
		}
	}
	return bytes;
}

/**
 * The exact UTF-8 length of `text`, as `TextEncoder` would encode it, without encoding a copy (the
 * persisted state is megabytes). One pass over the code units: below U+0080 one byte, below U+0800 two,
 * a surrogate half two (a well-formed pair is four), anything else three. A lone surrogate counts two
 * here where `TextEncoder` writes three for its replacement character; JSON output carries none, because
 * `JSON.stringify` escapes them.
 */
export function utf8ByteLength(text: string): number {
	let bytes = text.length;
	for (let i = 0; i < text.length; i += 1) {
		const unit = text.charCodeAt(i);
		if (unit < 0x80) continue;
		if (unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff)) bytes += 1;
		else bytes += 2;
	}
	return bytes;
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
	const size = measurePayload(payload, limit);
	if (size === null) {
		return {
			ok: false,
			error: {
				code: 'payload-not-serializable',
				method: definition.method,
				message: 'Platform-service payload is not JSON-serializable.',
			},
		};
	}
	if (!size.fits) {
		return {
			ok: false,
			error: {
				code: 'payload-too-large',
				method: definition.method,
				message: `Payload of ${size.sizeBytes} bytes exceeds the ${limit} byte limit for ${definition.method}.`,
				sizeBytes: size.sizeBytes,
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
