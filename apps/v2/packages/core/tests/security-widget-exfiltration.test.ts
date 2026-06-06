import { describe, expect, it } from 'vitest';
import {
	ALL_HOST_PERMISSIONS,
	WIDGET_DESTINATION_CLASSES,
	evaluateWidgetOutboundRequest,
	evaluateWidgetStateOwnership,
	isolateWidgetFailure,
	type WidgetNetworkGrant,
	type WidgetOutboundRequest,
} from '../src';

/**
 * SEC-011 — WIDGET HOST NETWORK + EXFILTRATION CONTROLS. The pure, fail-closed policy that constrains what
 * a widget may send OUTBOUND, where, and what it may treat as canonical state. Every test is adversarial:
 * it tries to smuggle hidden actor data / raw vault content / tokens / diagnostics / absolute paths past
 * the host, or to reach an unapproved destination, and proves the policy blocks/redacts/denies + audits.
 */

const WIDGET = 'widget-instance-1';

/** A grant with `network` approved for one destination class and the given sensitive-data policy. */
function grant(overrides: Partial<WidgetNetworkGrant> = {}): WidgetNetworkGrant {
	return {
		approvedPermissions: ['network'],
		approvedDestinationClasses: ['widget-declared'],
		sensitiveDataPolicy: 'block',
		...overrides,
	};
}

function request(overrides: Partial<WidgetOutboundRequest> = {}): WidgetOutboundRequest {
	return {
		widgetInstanceId: WIDGET,
		destinationClass: 'widget-declared',
		payload: { ping: 'ok' },
		...overrides,
	};
}

describe('SEC-011 AC1 — hidden actor data / raw vault content / tokens / diagnostics / absolute paths are blocked or redacted', () => {
	it('blocks a payload smuggling host-flagged hidden actor data (always a block, never redactable)', () => {
		const result = evaluateWidgetOutboundRequest(
			request({
				payload: { note: 'leaking THE-DM-ONLY-SECRET to my server' },
				forbiddenContentTokens: ['THE-DM-ONLY-SECRET'],
			}),
			grant({ sensitiveDataPolicy: 'redact' }), // even under redact policy, hidden content is blocked
		);
		expect(result.decision).toBe('blocked');
		expect(result.sentPayload).toBeNull();
		expect(result.audit.detectedExfiltration).toContain('hidden-actor-data');
		// The audit carries a coarse reason, never the secret value.
		expect(JSON.stringify(result.audit)).not.toContain('THE-DM-ONLY-SECRET');
	});

	it('blocks a payload carrying an auth token when the policy is block', () => {
		const result = evaluateWidgetOutboundRequest(
			request({ payload: { authorization: 'Bearer abc.def.ghi', data: 1 } }),
			grant({ sensitiveDataPolicy: 'block' }),
		);
		expect(result.decision).toBe('blocked');
		expect(result.sentPayload).toBeNull();
		expect(result.audit.detectedExfiltration).toContain('auth-token');
	});

	it('redacts a payload carrying a token/absolute path when the policy is redact (sends the scrubbed form)', () => {
		const result = evaluateWidgetOutboundRequest(
			request({ payload: { token: 'super-secret-token', path: '/Users/dm/vault/secret.md', keep: 'visible' } }),
			grant({ sensitiveDataPolicy: 'redact' }),
		);
		expect(result.decision).toBe('redacted');
		// The non-sensitive field survives; the token + absolute path are scrubbed.
		const sent = JSON.stringify(result.sentPayload);
		expect(sent).toContain('visible');
		expect(sent).not.toContain('super-secret-token');
		expect(sent).not.toContain('/Users/dm/vault/secret.md');
	});

	it('blocks a diagnostics bundle by shape, even with no embedded token (diagnostics are exfiltration-sensitive)', () => {
		const result = evaluateWidgetOutboundRequest(
			request({ payload: { diagnostics: { health: 'ok', counters: { x: 1 } } } }),
			grant({ sensitiveDataPolicy: 'block' }),
		);
		expect(result.decision).toBe('blocked');
		expect(result.audit.detectedExfiltration).toContain('diagnostics');
	});

	it('labels a bare absolute path as absolute-path (not mislabelled an auth-token)', () => {
		const result = evaluateWidgetOutboundRequest(
			request({ payload: { where: '/Users/dm/vault/notes/secret.md' } }),
			grant({ sensitiveDataPolicy: 'block' }),
		);
		expect(result.decision).toBe('blocked');
		expect(result.audit.detectedExfiltration).toContain('absolute-path');
		expect(result.audit.detectedExfiltration).not.toContain('auth-token');
	});

	it('allows a clean payload to an approved destination (the original payload is sent)', () => {
		const result = evaluateWidgetOutboundRequest(request({ payload: { roll: 17 } }), grant());
		expect(result.decision).toBe('allowed');
		expect(result.sentPayload).toEqual({ roll: 17 });
		expect(result.audit.detectedExfiltration).toEqual([]);
	});
});

describe('SEC-011 AC2 — a network request to an unapproved destination class is denied and audited', () => {
	it('denies a request to a destination class the widget is not approved for', () => {
		const result = evaluateWidgetOutboundRequest(
			request({ destinationClass: 'analytics' }), // grant only approved `widget-declared`
			grant({ approvedDestinationClasses: ['widget-declared'] }),
		);
		expect(result.decision).toBe('denied');
		expect(result.sentPayload).toBeNull();
		expect(result.audit.decision).toBe('denied');
		expect(result.audit.destinationClass).toBe('analytics');
	});

	it('denies any outbound request when the widget has no network permission at all (fail closed)', () => {
		const result = evaluateWidgetOutboundRequest(
			request(),
			grant({ approvedPermissions: ['clipboard'], approvedDestinationClasses: ['widget-declared'] }),
		);
		expect(result.decision).toBe('denied');
		expect(result.audit.reason).toMatch(/no approved network/i);
	});

	it('every approved destination class is a declared class (the catalogue is the source of truth)', () => {
		for (const cls of WIDGET_DESTINATION_CLASSES) {
			const result = evaluateWidgetOutboundRequest(
				request({ destinationClass: cls, payload: { ok: true } }),
				grant({ approvedDestinationClasses: [cls] }),
			);
			expect(result.decision).toBe('allowed');
		}
	});
});

describe('SEC-011 AC3 — widget-local storage cannot be the sole source of truth for canonical data', () => {
	it('flags a canonical state key declared as widget-local storage', () => {
		const problems = evaluateWidgetStateOwnership(WIDGET, [
			{ stateKey: 'characterHp', ownership: 'widget-local', isCanonical: true },
			{ stateKey: 'localDragState', ownership: 'widget-local', isCanonical: false },
			{ stateKey: 'sceneCollapsed', ownership: 'scene-local', isCanonical: false },
		]);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.stateKey).toBe('characterHp');
		expect(problems[0]?.kind).toBe('canonical-in-widget-local');
		// The problem names the key + a generic message, never the value (no leak).
		expect(JSON.stringify(problems[0])).not.toContain('value');
	});

	it('canonical data declared scene-local / session-local / entity-owned is allowed', () => {
		const problems = evaluateWidgetStateOwnership(WIDGET, [
			{ stateKey: 'hp', ownership: 'entity-owned', isCanonical: true },
			{ stateKey: 'initiative', ownership: 'session-local', isCanonical: true },
			{ stateKey: 'layout', ownership: 'scene-local', isCanonical: true },
		]);
		expect(problems).toEqual([]);
	});
});

describe('SEC-011 AC4 — a crashed / policy-violating widget is isolated; other widgets + core remain available', () => {
	it('isolates a crashed widget and keeps the others available', () => {
		const result = isolateWidgetFailure('widget-b', ['widget-a', 'widget-b', 'widget-c'], 'crashed');
		expect(result.isolatedWidgetInstanceId).toBe('widget-b');
		expect(result.survivingWidgetInstanceIds).toEqual(['widget-a', 'widget-c']);
		expect(result.coreStateAvailable).toBe(true);
		expect(result.reason).toBe('crashed');
	});

	it('isolates a host-policy-violating widget the same way', () => {
		const result = isolateWidgetFailure('widget-x', ['widget-x', 'widget-y'], 'host-policy-violation');
		expect(result.survivingWidgetInstanceIds).toEqual(['widget-y']);
		expect(result.coreStateAvailable).toBe(true);
		expect(result.message).toMatch(/host policy/i);
	});
});

describe('SEC-011 — the host-permission catalogue is the single source of truth (default-denied)', () => {
	it('exposes the full set of declared host permissions', () => {
		expect(ALL_HOST_PERMISSIONS).toContain('network');
		expect(ALL_HOST_PERMISSIONS).toContain('clipboard');
		expect(ALL_HOST_PERMISSIONS).toContain('filesystem');
	});
});
