import { describe, expect, it } from 'vitest';
import {
	MCP_RESPONSE_CONTRACT_ERROR_CODE,
	MCP_RESPONSE_CONTRACT_VERSION,
	buildCertifiedMcpResponse,
	certifyMcpResponse,
	toMcpResponseEnvelope,
	type McpResponseEnvelope,
	type McpToolResult,
} from '../src';

/**
 * MCP-010 — ADVERSARIAL: the response contract FAILS CLOSED. A tool that tries to return out-of-contract
 * or leaky data must be CAUGHT by {@link certifyMcpResponse} and REPLACED with a safe, contract-conformant
 * error — never passed through. An error envelope must never reveal internals (no stack/exception text,
 * no internal id, no hidden value). This file constructs hostile envelopes a misbehaving tool could emit
 * and proves each is neutralized.
 */

/** Build a baseline well-formed ok envelope to mutate into a hostile one. */
function okEnvelope(): McpResponseEnvelope {
	return toMcpResponseEnvelope(
		{ status: 'read-ok', toolId: 'note.list', data: { items: [] } },
		'resp-adv',
	);
}

function expectReplacedWithSafeError(certified: McpResponseEnvelope): void {
	// The replacement is a generic error envelope that names NOTHING about the original.
	expect(certified.status).toBe('error');
	expect(certified.data).toBeNull();
	expect(certified.error?.code).toBe(MCP_RESPONSE_CONTRACT_ERROR_CODE);
	expect(certified.contractVersion).toBe(MCP_RESPONSE_CONTRACT_VERSION);
	// The safe replacement itself conforms to the contract (the gate cannot produce a non-conformant result).
	expect(certifyMcpResponse(certified).conformant).toBe(true);
}

describe('MCP-010 adversarial — out-of-contract responses are caught and replaced', () => {
	it('an envelope with an undeclared smuggled field is replaced with the safe error', () => {
		const hostile = { ...okEnvelope(), exfiltrated: 'dm-only-secret' } as unknown as McpResponseEnvelope;
		const { envelope, conformant, violation } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expect(violation).toBe('schema-invalid');
		expectReplacedWithSafeError(envelope);
		// The smuggled key is gone — it never reaches the agent.
		expect(JSON.stringify(envelope)).not.toContain('exfiltrated');
		expect(JSON.stringify(envelope)).not.toContain('dm-only-secret');
	});

	it('an ok envelope that ALSO carries an error (contradictory) is replaced', () => {
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			error: { code: 'internal', message: 'boom' },
		};
		const { envelope, conformant } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expectReplacedWithSafeError(envelope);
	});

	it('an error envelope that still carries data (data leak through a terminal response) is replaced', () => {
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			status: 'error',
			data: { dmOnlyHp: 42 },
			error: { code: 'rejected', message: 'no' },
		};
		const { envelope, conformant } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expectReplacedWithSafeError(envelope);
		expect(JSON.stringify(envelope)).not.toContain('dmOnlyHp');
	});

	it('an envelope claiming an unsupported future contract version is replaced (fail closed on version)', () => {
		const hostile = { ...okEnvelope(), contractVersion: 7 } as unknown as McpResponseEnvelope;
		const { envelope, conformant } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expectReplacedWithSafeError(envelope);
	});
});

describe('MCP-010 adversarial — leaky responses never reach the agent', () => {
	it('a response whose data carries a raw absolute filesystem path is replaced as leaky', () => {
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			data: { vaultPath: '/Users/dm/secret-vault/campaign.md' },
		};
		const { envelope, conformant, violation } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expect(violation).toBe('leaky');
		expectReplacedWithSafeError(envelope);
		expect(JSON.stringify(envelope)).not.toContain('secret-vault');
	});

	it('a response whose data carries an auth-token-shaped secret is replaced as leaky', () => {
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			data: { note: 'use Bearer sk-live-0123456789abcdefghij to call the API' },
		};
		const { envelope, conformant, violation } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expect(violation).toBe('leaky');
		expectReplacedWithSafeError(envelope);
		expect(JSON.stringify(envelope)).not.toContain('sk-live-0123456789abcdefghij');
	});

	it('a secret tucked into the summary string is also caught (the whole envelope is scanned)', () => {
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			summary: 'Completed. Connect with Bearer sk-live-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
		};
		const { conformant, violation } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expect(violation).toBe('leaky');
	});

	it('a secret hidden under a secret-NAMED key is caught even when the value looks benign', () => {
		// The shared redaction guard flags a value under a secret-named key (e.g. `apiKey`) — so a tool
		// that smuggles a credential under a credential-shaped key cannot slip it past the contract.
		const hostile: McpResponseEnvelope = {
			...okEnvelope(),
			data: { apiKey: 'plain-looking-but-secret' },
		};
		const { conformant, violation } = certifyMcpResponse(hostile);
		expect(conformant).toBe(false);
		expect(violation).toBe('leaky');
	});

	it('a clean response with the same opaque ids the agent already has passes (no false positive)', () => {
		const clean: McpResponseEnvelope = {
			...okEnvelope(),
			data: { items: [{ id: 'item-1' }, { id: 'item-2' }] },
			citations: [{ kind: 'note', ref: 'item-1' }],
		};
		const { envelope, conformant } = certifyMcpResponse(clean);
		expect(conformant).toBe(true);
		expect(envelope).toBe(clean); // returned unchanged
	});
});

describe('MCP-010 adversarial — error envelopes never reveal internals', () => {
	it('a command rejection projects ONLY a code/message/issues — no nextState, stack, or internal id', () => {
		// Simulate a rejected command result carrying a (realistic) full nextState the tool must NOT expose.
		const rejected: McpToolResult = {
			status: 'write',
			toolId: 'note.create',
			commandResult: {
				status: 'rejected',
				rejection: {
					code: 'actor-not-authorized',
					message: 'The actor lacks write authority for this entity.',
					issues: [{ path: 'title', message: 'required' }],
				},
				// A real CommandResult carries the full next state; the envelope must drop it entirely.
				nextState: { secretEverything: '/Users/dm/vault', token: 'Bearer sk-do-not-leak' } as never,
			},
		};
		const envelope = buildCertifiedMcpResponse(rejected, 'resp-rej');
		expect(envelope.status).toBe('error');
		expect(envelope.error?.code).toBe('actor-not-authorized');
		expect(envelope.error?.issues).toEqual([{ path: 'title', message: 'required' }]);
		// The whole-state object never crosses the boundary, and there is no stack/internal-id field.
		const serialized = JSON.stringify(envelope);
		expect(serialized).not.toContain('nextState');
		expect(serialized).not.toContain('secretEverything');
		expect(serialized).not.toContain('sk-do-not-leak');
		expect(envelope.error).not.toHaveProperty('stack');
	});

	it('the safe replacement error reveals nothing about the original cause', () => {
		// A read tool that returns leaky data: certification replaces it with the generic safe error, and
		// the replacement carries no trace of the original (no path, no value, no field name).
		const leaky: McpToolResult = {
			status: 'read-ok',
			toolId: 'note.list',
			data: { dmOnlyNote: 'secret', vaultPath: '/Users/dm/x' },
		};
		const replaced = buildCertifiedMcpResponse(leaky, 'resp-safe');
		expect(replaced.status).toBe('error');
		expect(JSON.stringify(replaced)).not.toContain('/Users/dm');
		expect(JSON.stringify(replaced)).not.toContain('dmOnlyNote');
		expect(replaced.error?.message).toBe(
			'The tool response failed contract validation and was replaced with a safe error.',
		);
	});
});
