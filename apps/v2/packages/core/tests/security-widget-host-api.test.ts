import { describe, expect, it } from 'vitest';
import {
	ALL_HOST_PERMISSIONS,
	FORBIDDEN_HOST_CAPABILITIES,
	PERMISSION_GATED_CAPABILITIES,
	isHostCapabilityAvailable,
	requestRawVaultFileAccess,
	requestWidgetNetwork,
	requiredPermissionFor,
	resolveHostCapability,
	type HostCapabilityGrant,
	type WidgetHostCapability,
	type WidgetHostPermission,
	type WidgetNetworkGrant,
} from '../src';

/**
 * SEC-007 — CONSTRAINED WIDGET HOST API. The adversarial proof that custom widget code receives a host API,
 * not direct access to storage adapters, IPC, cloud clients, auth tokens, platform bridges, raw vault files,
 * or hidden actor data. Every test is adversarial: a widget asks for a capability it never declared, a
 * widget tries to read raw vault files, a widget tries to reach the network without an approved destination
 * class. The host fails CLOSED in every case, and a denied raw-file read isolates the widget.
 */

const WIDGET = 'widget-instance-1';

/** A grant approving the given host permissions (everything else default-denied). */
function grant(permissions: readonly WidgetHostPermission[] = []): HostCapabilityGrant {
	return { approvedPermissions: permissions };
}

describe('SEC-007 AC1 — a capability requested without its declared host permission is unavailable', () => {
	it('clipboard is UNAVAILABLE for a widget that did not declare the clipboard permission', () => {
		const result = resolveHostCapability(WIDGET, 'clipboard', grant([]));
		expect(result.decision).toBe('undeclared');
		expect(isHostCapabilityAvailable('clipboard', grant([]))).toBe(false);
		expect(result.audit.reason).toMatch(/clipboard/i);
	});

	it('clipboard is AVAILABLE once the clipboard permission is approved', () => {
		expect(resolveHostCapability(WIDGET, 'clipboard', grant(['clipboard'])).decision).toBe('available');
		expect(isHostCapabilityAvailable('clipboard', grant(['clipboard']))).toBe(true);
	});

	it('every permission-gated capability is default-denied and unlocked only by its own permission', () => {
		for (const permission of ALL_HOST_PERMISSIONS) {
			const capability = PERMISSION_GATED_CAPABILITIES[permission];
			// Default-denied without the permission.
			expect(resolveHostCapability(WIDGET, capability, grant([])).decision).toBe('undeclared');
			// Available with exactly that permission.
			expect(resolveHostCapability(WIDGET, capability, grant([permission])).decision).toBe('available');
			// requiredPermissionFor round-trips.
			expect(requiredPermissionFor(capability)).toBe(permission);
		}
	});

	it('holding one permission does not unlock a DIFFERENT capability (no privilege bleed)', () => {
		// A widget with `asset` does not thereby get `network`.
		expect(resolveHostCapability(WIDGET, 'network', grant(['asset'])).decision).toBe('undeclared');
		expect(resolveHostCapability(WIDGET, 'asset', grant(['asset'])).decision).toBe('available');
	});
});

describe('SEC-007 — forbidden platform/runtime surfaces are NEVER grantable to a widget', () => {
	it('the storage-adapter / IPC / cloud-client / auth-token / platform-bridge / raw-vault-file / hidden-actor-data surfaces are forbidden', () => {
		// Even a widget approved for EVERY host permission cannot reach any forbidden capability.
		const fullyPermissioned = grant(ALL_HOST_PERMISSIONS);
		for (const capability of FORBIDDEN_HOST_CAPABILITIES) {
			const result = resolveHostCapability(WIDGET, capability, fullyPermissioned);
			expect(result.decision, `expected "${capability}" to be forbidden`).toBe('forbidden');
			expect(isHostCapabilityAvailable(capability, fullyPermissioned)).toBe(false);
		}
	});

	it('a forbidden capability has NO gating permission (it is not a host permission a DM can approve)', () => {
		for (const capability of FORBIDDEN_HOST_CAPABILITIES) {
			expect(requiredPermissionFor(capability)).toBeNull();
		}
	});

	it('the audit for a forbidden request never leaks how to reach the surface', () => {
		const result = resolveHostCapability(WIDGET, 'auth-token', grant(ALL_HOST_PERMISSIONS));
		expect(result.audit.decision).toBe('forbidden');
		expect(result.audit.reason).toMatch(/actor-filtered bindings|Processing-Core commands/i);
	});
});

describe('SEC-007 AC2 — a raw-vault-file read is rejected and isolates the widget failure', () => {
	it('rejects the read (never granted) and isolates the failing widget, keeping siblings + core alive', () => {
		const result = requestRawVaultFileAccess(WIDGET, ['widget-a', WIDGET, 'widget-c']);
		expect(result.granted).toBe(false);
		expect(result.audit.decision).toBe('forbidden');
		// The failing widget is isolated; the others remain available; core state is unaffected.
		expect(result.isolation.isolatedWidgetInstanceId).toBe(WIDGET);
		expect(result.isolation.survivingWidgetInstanceIds).toEqual(['widget-a', 'widget-c']);
		expect(result.isolation.coreStateAvailable).toBe(true);
		expect(result.isolation.reason).toBe('host-policy-violation');
	});

	it('raw-vault-file is forbidden even though `filesystem` is a grantable permission (vault files are not files)', () => {
		// `filesystem` unlocks the declared file/asset capability, but never raw vault content.
		expect(resolveHostCapability(WIDGET, 'filesystem', grant(['filesystem'])).decision).toBe('available');
		expect(resolveHostCapability(WIDGET, 'raw-vault-file', grant(['filesystem'])).decision).toBe('forbidden');
	});
});

describe('SEC-007 AC3 — a network request to an unapproved destination class is unavailable + audited', () => {
	function networkGrant(overrides: Partial<WidgetNetworkGrant> = {}): WidgetNetworkGrant {
		return {
			approvedPermissions: ['network'],
			approvedDestinationClasses: ['widget-declared'],
			sensitiveDataPolicy: 'block',
			...overrides,
		};
	}

	it('denies + audits a request to a destination class the widget is not approved for', () => {
		const result = requestWidgetNetwork(
			{ widgetInstanceId: WIDGET, destinationClass: 'analytics', payload: { ping: 1 } },
			networkGrant({ approvedDestinationClasses: ['widget-declared'] }),
		);
		expect(result.decision).toBe('denied');
		expect(result.sentPayload).toBeNull();
		expect(result.audit.decision).toBe('denied');
		expect(result.audit.destinationClass).toBe('analytics');
	});

	it('outbound network is unavailable entirely when the widget has no network permission', () => {
		const result = requestWidgetNetwork(
			{ widgetInstanceId: WIDGET, destinationClass: 'widget-declared', payload: { ping: 1 } },
			networkGrant({ approvedPermissions: ['clipboard'] }),
		);
		expect(result.decision).toBe('denied');
		expect(result.audit.reason).toMatch(/no approved network/i);
	});

	it('allows a clean request to an approved destination (the host network gate composes the outbound policy)', () => {
		const result = requestWidgetNetwork(
			{ widgetInstanceId: WIDGET, destinationClass: 'widget-declared', payload: { roll: 17 } },
			networkGrant(),
		);
		expect(result.decision).toBe('allowed');
		expect(result.sentPayload).toEqual({ roll: 17 });
	});

	it('still blocks exfiltration of host-flagged hidden actor data even on an approved destination', () => {
		const result = requestWidgetNetwork(
			{
				widgetInstanceId: WIDGET,
				destinationClass: 'widget-declared',
				payload: { note: 'leaking DM-ONLY-CANARY' },
				forbiddenContentTokens: ['DM-ONLY-CANARY'],
			},
			networkGrant(),
		);
		expect(result.decision).toBe('blocked');
		expect(result.sentPayload).toBeNull();
		expect(JSON.stringify(result.audit)).not.toContain('DM-ONLY-CANARY');
	});
});

describe('SEC-007 — the capability catalogue is internally consistent', () => {
	it('a capability is either permission-gated or forbidden, never both', () => {
		const gated = new Set<WidgetHostCapability>(Object.values(PERMISSION_GATED_CAPABILITIES));
		for (const forbidden of FORBIDDEN_HOST_CAPABILITIES) {
			expect(gated.has(forbidden)).toBe(false);
		}
		// Every host permission maps to exactly one gated capability.
		expect(Object.keys(PERMISSION_GATED_CAPABILITIES).sort()).toEqual([...ALL_HOST_PERMISSIONS].sort());
	});
});
