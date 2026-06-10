import type { WidgetHostPermission } from '../state/widget-package-state';
import { ALL_HOST_PERMISSIONS } from '../state/widget-package-state';
import {
	evaluateWidgetOutboundRequest,
	isolateWidgetFailure,
	type WidgetDestinationClass,
	type WidgetIsolationReason,
	type WidgetIsolationResult,
	type WidgetNetworkGrant,
	type WidgetOutboundRequest,
	type WidgetOutboundResult,
} from './widget-exfiltration';

/**
 * SEC-007 — CONSTRAINED WIDGET HOST API. The pure, fail-closed Processing-Core policy that decides WHICH
 * host-API capabilities are available to a piece of custom widget code, given the host permissions its
 * package declared and the DM approved (Architecture Contract 4 Custom Widget Code rules 1/2/8/9). Custom
 * widget code "receives a host API, not direct access to storage adapters, IPC, cloud clients, auth tokens,
 * platform bridges, or raw vault files" — this module IS the gate that enforces that, fail closed.
 *
 * It COMPOSES the existing infrastructure rather than inventing a parallel framework:
 *   - the host-permission CATALOGUE (`ALL_HOST_PERMISSIONS`, default DENIED) decides whether a widget holds
 *     a permission at all (clipboard / network / asset / external-link / source-adapter / filesystem);
 *   - the OUTBOUND gate (`evaluateWidgetOutboundRequest`) decides whether a specific network request to a
 *     destination class is allowed/redacted/blocked/denied + audited (SEC-007 AC3 / SEC-011);
 *   - the ISOLATION primitive (`isolateWidgetFailure`) contains a widget whose denied access (e.g. a raw
 *     vault-file read) makes it fail, keeping siblings + core alive (SEC-007 AC2 / SEC-011 AC4).
 *
 * The THREE SEC-007 acceptance criteria, all enforced HERE, fail closed:
 *   1. A widget requesting clipboard WITHOUT declaring the permission ⇒ the clipboard capability is
 *      UNAVAILABLE ({@link resolveHostCapability}).
 *   2. A widget attempting to read RAW VAULT FILES ⇒ the host REJECTS access and ISOLATES the widget
 *      failure ({@link requestRawVaultFileAccess}). Raw vault files are NEVER a grantable widget capability.
 *   3. A widget requesting NETWORK to a destination class it is not approved for ⇒ outbound APIs are
 *      UNAVAILABLE and the attempt is AUDITED ({@link requestWidgetNetwork}, composing the outbound gate).
 *
 * Pure + deterministic over plain data — no DOM/storage/clock/entropy/network. The future widget-host
 * runtime calls these gates BEFORE handing a capability to widget code; the policy never depends on the
 * runtime never regressing.
 */

export const WIDGET_HOST_API_SCHEMA_VERSION = 1 as const;

// --- The host-API capability surface ----------------------------------------------------------------

/**
 * A host-API capability a widget may ask the host for. Two disjoint classes:
 *
 *   - PERMISSION-GATED capabilities map one-to-one onto a declared {@link WidgetHostPermission}; they are
 *     available only when that permission is approved (default DENIED).
 *   - FORBIDDEN capabilities are the platform/runtime surfaces a widget may NEVER reach directly, no matter
 *     what its package declares — storage adapters, raw IPC, cloud clients, auth tokens, platform bridges,
 *     raw vault files, and hidden actor data (Contract 4 Widget Host "must not provide" list). A widget that
 *     asks for one of these is always denied; the host surfaces the same data only through actor-filtered
 *     bindings + Processing-Core commands.
 */
export type WidgetHostCapability =
	// permission-gated (one per host permission)
	| 'clipboard'
	| 'network'
	| 'asset'
	| 'external-link'
	| 'source-adapter'
	| 'filesystem'
	// always-forbidden platform/runtime surfaces (never grantable to a widget)
	| 'storage-adapter'
	| 'ipc'
	| 'cloud-client'
	| 'auth-token'
	| 'platform-bridge'
	| 'raw-vault-file'
	| 'hidden-actor-data';

/** The host-API capabilities that map one-to-one onto a declared/approved host permission. */
export const PERMISSION_GATED_CAPABILITIES: Readonly<Record<WidgetHostPermission, WidgetHostCapability>> =
	Object.freeze({
		clipboard: 'clipboard',
		network: 'network',
		asset: 'asset',
		'external-link': 'external-link',
		'source-adapter': 'source-adapter',
		filesystem: 'filesystem',
	});

/**
 * The host-API capabilities a widget may NEVER acquire, regardless of declared permissions. Note `filesystem`
 * is a permission-gated capability for declared widget asset/file affordances, but a RAW VAULT FILE read is
 * always forbidden — vault content reaches a widget only through actor-filtered bindings, never as raw files.
 */
export const FORBIDDEN_HOST_CAPABILITIES: readonly WidgetHostCapability[] = Object.freeze([
	'storage-adapter',
	'ipc',
	'cloud-client',
	'auth-token',
	'platform-bridge',
	'raw-vault-file',
	'hidden-actor-data',
] as const);

/** How a host-capability request is resolved. Fail closed: anything but `available` was NOT handed to code. */
export type HostCapabilityDecision =
	| 'available' // the widget holds the required permission; the capability is exposed
	| 'undeclared' // the widget did not declare/was not approved for the gating permission
	| 'forbidden'; // the capability is a platform/runtime surface a widget may never reach

export interface HostCapabilityGrant {
	/** The host permissions the package was approved for (default DENIED — absent ⇒ the capability is undeclared). */
	approvedPermissions: readonly WidgetHostPermission[];
}

/** A non-leaking audit record for a denied/forbidden host-capability request. */
export interface HostCapabilityAudit {
	widgetInstanceId: string;
	capability: WidgetHostCapability;
	decision: HostCapabilityDecision;
	/** A coarse, non-leaking reason. Never carries a value, token, path, or hidden content. */
	reason: string;
}

export interface HostCapabilityResult {
	decision: HostCapabilityDecision;
	/** The audit record for the attempt (always produced; persisted by the host for the DM). */
	audit: HostCapabilityAudit;
}

/** The host permission a permission-gated capability requires, or null when the capability is forbidden. */
export function requiredPermissionFor(capability: WidgetHostCapability): WidgetHostPermission | null {
	for (const permission of ALL_HOST_PERMISSIONS) {
		if (PERMISSION_GATED_CAPABILITIES[permission] === capability) return permission;
	}
	return null;
}

/**
 * SEC-007 AC1 — resolve whether a host-API capability is available to a widget, fail closed:
 *
 *   1. A FORBIDDEN capability (storage adapter / IPC / cloud client / auth token / platform bridge /
 *      raw vault file / hidden actor data) ⇒ `forbidden`, always. A widget may never reach these.
 *   2. A permission-gated capability whose gating permission the widget was NOT approved for ⇒ `undeclared`
 *      (the capability is UNAVAILABLE — e.g. clipboard without the `clipboard` permission, AC1).
 *   3. Otherwise ⇒ `available`.
 *
 * Every non-`available` outcome produces a non-leaking audit record. Pure + deterministic.
 */
export function resolveHostCapability(
	widgetInstanceId: string,
	capability: WidgetHostCapability,
	grant: HostCapabilityGrant,
): HostCapabilityResult {
	const base = { widgetInstanceId, capability } as const;

	if (FORBIDDEN_HOST_CAPABILITIES.includes(capability)) {
		return {
			decision: 'forbidden',
			audit: {
				...base,
				decision: 'forbidden',
				reason:
					'This capability is a platform/runtime surface a widget may never reach; use actor-filtered bindings and Processing-Core commands instead.',
			},
		};
	}

	const permission = requiredPermissionFor(capability);
	if (permission && !grant.approvedPermissions.includes(permission)) {
		return {
			decision: 'undeclared',
			audit: {
				...base,
				decision: 'undeclared',
				reason: `Widget did not declare/was not approved for the "${permission}" host permission; the ${capability} capability is unavailable.`,
			},
		};
	}

	return {
		decision: 'available',
		audit: {
			...base,
			decision: 'available',
			reason: `Widget holds the required host permission; the ${capability} capability is exposed.`,
		},
	};
}

/** Whether a host-API capability is available to a widget (convenience over {@link resolveHostCapability}). */
export function isHostCapabilityAvailable(
	capability: WidgetHostCapability,
	grant: HostCapabilityGrant,
): boolean {
	return resolveHostCapability('(probe)', capability, grant).decision === 'available';
}

// --- AC2: raw vault file access is rejected and isolates the widget failure --------------------------

export interface RawVaultFileAccessResult {
	/** Always `false`: a widget may never read raw vault files. */
	granted: false;
	/** The isolation of the widget whose denied raw-file read made it fail (siblings + core stay alive). */
	isolation: WidgetIsolationResult;
	audit: HostCapabilityAudit;
}

/**
 * SEC-007 AC2 — a widget attempt to read RAW VAULT FILES is rejected by the host, and the resulting widget
 * failure is ISOLATED so other widgets and core app state remain available. Raw vault files are never a
 * grantable widget capability (`raw-vault-file` is forbidden); the host hands vault content to widgets only
 * through actor-filtered bindings. Composes {@link resolveHostCapability} (always `forbidden` here) and
 * {@link isolateWidgetFailure}. Pure + deterministic.
 */
export function requestRawVaultFileAccess(
	failingWidgetInstanceId: string,
	allWidgetInstanceIds: readonly string[],
): RawVaultFileAccessResult {
	const resolution = resolveHostCapability(failingWidgetInstanceId, 'raw-vault-file', {
		approvedPermissions: ALL_HOST_PERMISSIONS, // even a fully-permissioned widget is denied: forbidden is absolute
	});
	const isolation = isolateWidgetFailure(
		failingWidgetInstanceId,
		allWidgetInstanceIds,
		'host-policy-violation',
	);
	return { granted: false, isolation, audit: resolution.audit };
}

// --- AC3: network requires an approved destination class --------------------------------------------

/**
 * SEC-007 AC3 — gate a widget's network request through the host. Outbound network APIs are UNAVAILABLE
 * unless the widget holds the `network` permission AND the destination class is approved; an unapproved
 * request is denied and AUDITED. This is the single network entry point for widget code: it composes the
 * existing {@link evaluateWidgetOutboundRequest} outbound gate (which also blocks/redacts exfiltration of
 * hidden actor data / raw vault content / tokens / diagnostics / absolute paths, SEC-011). Pure + deterministic.
 */
export function requestWidgetNetwork(
	request: WidgetOutboundRequest,
	grant: WidgetNetworkGrant,
): WidgetOutboundResult {
	return evaluateWidgetOutboundRequest(request, grant);
}

// Re-export the composed types/values so SEC-007 callers reference the single source of truth.
export {
	ALL_HOST_PERMISSIONS,
	isolateWidgetFailure,
	evaluateWidgetOutboundRequest,
	type WidgetDestinationClass,
	type WidgetHostPermission,
	type WidgetIsolationReason,
	type WidgetIsolationResult,
	type WidgetNetworkGrant,
	type WidgetOutboundRequest,
	type WidgetOutboundResult,
};
