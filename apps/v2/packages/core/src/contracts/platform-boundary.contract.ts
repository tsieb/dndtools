/**
 * PLAT-011: type-only platform-boundary contract.
 *
 * Modules under `contracts/` (and files named `*.contract.ts`) are type-only. They declare
 * the cross-boundary shapes that the GUI, Platform Services, and Processing Core agree on,
 * but they MUST NOT export runtime values (functions, classes, constants, schemas). Runtime
 * constructors, defaults, and validators live in their own modules — e.g. the runtime
 * validator/registry lives in `../platform/service-boundary.ts` and the request schemas in
 * `../schemas/platform-service.ts`.
 *
 * The boundary lint and the type-runtime-split test fail closed if a runtime value leaks
 * into this path, so consumers can import contract types without dragging Zod or any other
 * runtime dependency across the boundary (the AUDIT-21.5-TYPE-RUNTIME-MIX defect class).
 */

/** Allowlisted platform-service method names as a literal union (type-only mirror). */
export type PlatformServiceMethodName =
	| 'storage.loadCoreState'
	| 'storage.persistFullState'
	| 'storage.recoverPendingMigration'
	| 'storage.resetCoreStorage';

export type PlatformBoundaryErrorCode =
	| 'unknown-method'
	| 'payload-too-large'
	| 'payload-not-serializable'
	| 'invalid-payload';

export interface PlatformBoundaryErrorShape {
	code: PlatformBoundaryErrorCode;
	method: string;
	message: string;
	issues?: ReadonlyArray<{ path: string; message: string }>;
	sizeBytes?: number;
	limitBytes?: number;
}

/** Outcome shape returned across the platform-service boundary. */
export type PlatformBoundaryOutcome<T> =
	| { readonly ok: true; readonly method: PlatformServiceMethodName; readonly value: T }
	| { readonly ok: false; readonly error: PlatformBoundaryErrorShape };

/**
 * The minimal port the GUI is allowed to depend on for durable persistence. The GUI may
 * call these named methods only; it may never reach IndexedDB/filesystem/cloud directly
 * (PLAT-006). The concrete implementation lives in the app's storage adapter.
 */
export interface StoragePort {
	loadCoreState(): Promise<unknown>;
	persistFullState(previous: unknown, next: unknown): Promise<void>;
	recoverPendingMigration(): Promise<unknown>;
	resetCoreStorage(): Promise<void>;
}
