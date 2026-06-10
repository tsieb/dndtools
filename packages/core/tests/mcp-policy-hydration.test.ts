import { describe, expect, it } from 'vitest';
import {
	DURABLE_STATE_DOCUMENT_IDS,
	EMPTY_MCP_POLICY_STATE,
	MCP_POLICY_STATE_SCHEMA_VERSION,
	TARGET_SCHEMA_VERSIONS,
	ensureMcpPolicyState,
	type McpPolicyState,
} from '../src';

/**
 * MCP-003 / MCP-009 / MCP-011 — FAIL-CLOSED HYDRATION of the durable MCP slice. The epic adds durable
 * state (bindings, policies, proposals, audit) wired into persistence + the migration registry; a vault
 * persisted before this slice (or with a corrupt record) must hydrate to a SAFE, MOST-RESTRICTIVE default
 * rather than restore a permissive or un-evaluable state.
 */

describe('MCP slice hydration — an older/empty vault restores to the safe default', () => {
	it('an absent MCP document hydrates to the empty, strict_review-default slice', () => {
		const hydrated = ensureMcpPolicyState(undefined);
		expect(hydrated).toEqual(EMPTY_MCP_POLICY_STATE);
		expect(hydrated.vaultDefaultMode).toBe('strict_review');
		expect(hydrated.schemaVersion).toBe(MCP_POLICY_STATE_SCHEMA_VERSION);
	});

	it('a partial persisted slice defaults every missing field fail-closed', () => {
		const hydrated = ensureMcpPolicyState({ bindings: {} });
		expect(hydrated.policies).toEqual({});
		expect(hydrated.proposals).toEqual({});
		expect(hydrated.auditEntries).toEqual([]);
		expect(hydrated.vaultDefaultMode).toBe('strict_review');
	});

	it('an UNKNOWN persisted vault default collapses to strict_review (never a permissive mode)', () => {
		const hydrated = ensureMcpPolicyState({
			vaultDefaultMode: 'trusted_direct' as McpPolicyState['vaultDefaultMode'],
		});
		// `trusted_direct` is not a valid VAULT default; it collapses to the safe staged default.
		expect(hydrated.vaultDefaultMode).toBe('strict_review');
	});
});

describe('MCP slice hydration — corrupt records collapse to the most restrictive', () => {
	it('a policy with an UNKNOWN mode hydrates to `disabled` (most restrictive)', () => {
		const hydrated = ensureMcpPolicyState({
			policies: {
				'agent-x': {
					agentId: 'agent-x',
					// A persisted mode that is no longer declared.
					mode: 'super-admin' as never,
					allowedToolIds: ['note.create'],
					auditVisible: true,
					createdBy: 'actor-dm',
					createdAt: '2026-06-03T12:00:00.000Z',
					updatedAt: '2026-06-03T12:00:00.000Z',
					revision: 1,
				},
			},
		});
		expect(hydrated.policies['agent-x']!.mode).toBe('disabled');
	});

	it('a policy with a non-array allowlist hydrates to the empty (deny-all) list', () => {
		const hydrated = ensureMcpPolicyState({
			policies: {
				'agent-x': {
					agentId: 'agent-x',
					mode: 'trusted_direct',
					allowedToolIds: 'not-an-array' as never,
					auditVisible: true,
					createdBy: 'actor-dm',
					createdAt: '2026-06-03T12:00:00.000Z',
					updatedAt: '2026-06-03T12:00:00.000Z',
					revision: 1,
				},
			},
		});
		expect(hydrated.policies['agent-x']!.allowedToolIds).toEqual([]);
	});

	it('a proposal with an UNKNOWN status collapses to `rejected` (never committable)', () => {
		const hydrated = ensureMcpPolicyState({
			proposals: {
				'prop-1': {
					id: 'prop-1',
					agentId: 'agent-x',
					actorId: 'actor-dm',
					toolId: 'note.create',
					commandType: 'content.create-item',
					payload: { title: 'x', body: 'y', kind: 'note' },
					policyMode: 'strict_review',
					writeRisk: 'durable',
					status: 'half-approved' as never,
					createdAt: '2026-06-03T12:00:00.000Z',
					resolvedAt: null,
					resolvedBy: null,
				},
			},
		});
		expect(hydrated.proposals['prop-1']!.status).toBe('rejected');
	});

	it('a pending proposal stays pending across hydration (the DM must still review it)', () => {
		const hydrated = ensureMcpPolicyState({
			proposals: {
				'prop-2': {
					id: 'prop-2',
					agentId: 'agent-x',
					actorId: 'actor-dm',
					toolId: 'note.create',
					commandType: 'content.create-item',
					payload: { title: 'x', body: 'y', kind: 'note' },
					policyMode: 'strict_review',
					writeRisk: 'durable',
					status: 'pending',
					createdAt: '2026-06-03T12:00:00.000Z',
					resolvedAt: null,
					resolvedBy: null,
				},
			},
		});
		expect(hydrated.proposals['prop-2']!.status).toBe('pending');
	});
});

describe('MCP slice is registered in the durable-state migration registry', () => {
	it('`mcp` is a durable document with a target schema version', () => {
		expect(DURABLE_STATE_DOCUMENT_IDS).toContain('mcp');
		expect(TARGET_SCHEMA_VERSIONS.mcp).toBe(MCP_POLICY_STATE_SCHEMA_VERSION);
	});
});
