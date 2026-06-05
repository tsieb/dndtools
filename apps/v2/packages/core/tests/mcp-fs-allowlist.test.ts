import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES,
	MCP_FS_OPERATION_IDS,
	createBaselineMcpFsExceptionRegistry,
	createMcpFsExceptionRegistry,
	gateMcpFsOperation,
	isMcpFsOperationId,
	isPathContained,
	type McpFsExceptionDefinition,
} from '../src';

/**
 * MCP-012 — MCP FILESYSTEM AND PLATFORM-SERVICE EXCEPTIONS ARE EXPLICITLY ALLOWLISTED, LINTED, AND
 * REGRESSION-TESTED rather than inferred from broad runtime access. The boundary-lint regression
 * (apps/v2/app/tests/unit/boundary-lint.test.ts) covers AC1 (a filesystem import outside the
 * allowlist fails the gate). THIS file covers AC2: an allowlisted MCP filesystem operation asserts
 * CONTAINMENT, SIZE LIMITS, SCHEMA VALIDATION, and AUDIT BEHAVIOR — plus the adversarial path-
 * traversal / forged-operation cases the epic demands, all FAIL CLOSED.
 */

describe('MCP-012 — the allowlist is the closed set of permitted filesystem operations', () => {
	it('an operation id outside the allowlist is denied (fail closed)', () => {
		const registry = createBaselineMcpFsExceptionRegistry();
		const result = gateMcpFsOperation(registry, {
			operationId: 'arbitrary.read',
			relativePath: 'a.txt',
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected denial');
		expect(result.reason).toBe('unknown-operation');
	});

	it('exposes the allowlist enum guard', () => {
		expect(isMcpFsOperationId('vault-export.read')).toBe(true);
		expect(isMcpFsOperationId('staged-preview.write')).toBe(true);
		expect(isMcpFsOperationId('rm-rf-everything')).toBe(false);
		expect([...MCP_FS_OPERATION_IDS]).toEqual(['vault-export.read', 'staged-preview.write']);
	});

	it('construction fails closed for an id outside the allowlist', () => {
		expect(() =>
			createMcpFsExceptionRegistry([
				// @ts-expect-error not an allowlisted operation id
				{ operationId: 'shell.exec', mode: 'read', containmentRoot: 'mcp/x', maxPayloadBytes: 1, requestSchema: z.object({}), audited: true, owner: 'x', rationale: 'x' },
			]),
		).toThrow(/not in the allowlist/);
	});

	it('construction fails closed for a duplicate operation id', () => {
		const def: McpFsExceptionDefinition = {
			operationId: 'vault-export.read',
			mode: 'read',
			containmentRoot: 'mcp/vault-export',
			maxPayloadBytes: 1024,
			requestSchema: z.object({}).loose(),
			audited: true,
			owner: 'MCP',
			rationale: 'test',
		};
		expect(() => createMcpFsExceptionRegistry([def, def])).toThrow(/registered more than once/);
	});

	it('construction fails closed for a traversing containment root', () => {
		expect(() =>
			createMcpFsExceptionRegistry([
				{
					operationId: 'vault-export.read',
					mode: 'read',
					containmentRoot: '../../etc',
					maxPayloadBytes: 1024,
					requestSchema: z.object({}).loose(),
					audited: true,
					owner: 'MCP',
					rationale: 'test',
				},
			]),
		).toThrow(/invalid containment root/);
	});
});

describe('MCP-012 AC2 — containment: a path that escapes the root is denied', () => {
	const registry = createBaselineMcpFsExceptionRegistry();

	it('allows a contained read within the declared root', () => {
		const result = gateMcpFsOperation(registry, {
			operationId: 'vault-export.read',
			relativePath: 'campaign/notes.md',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected allow');
		expect(result.containmentRoot).toBe('mcp/vault-export');
	});

	it.each([
		'../secret.md',
		'../../etc/passwd',
		'campaign/../../escape.md',
		'/etc/passwd',
		'\\\\server\\share\\x',
		'C:\\Windows\\System32',
	])('denies the escaping path "%s" (fail closed)', (relativePath) => {
		const result = gateMcpFsOperation(registry, { operationId: 'vault-export.read', relativePath });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected denial');
		expect(result.reason).toBe('path-escapes-root');
	});

	it('the pure containment check resolves traversal correctly', () => {
		expect(isPathContained('mcp/vault-export', 'a/b.md')).toBe(true);
		expect(isPathContained('mcp/vault-export', './a/b.md')).toBe(true);
		expect(isPathContained('mcp/vault-export', 'a/../b.md')).toBe(true); // stays inside
		expect(isPathContained('mcp/vault-export', '')).toBe(true); // the root itself
		expect(isPathContained('mcp/vault-export', '..')).toBe(false);
		expect(isPathContained('mcp/vault-export', 'a/../../b.md')).toBe(false);
		expect(isPathContained('mcp/vault-export', '/abs')).toBe(false);
		expect(isPathContained('mcp/vault-export', 'a/\0b')).toBe(false); // NUL byte rejected
		// A sibling root with a shared prefix must NOT be considered contained.
		expect(isPathContained('mcp/vault', '../vault-export/x')).toBe(false);
	});
});

describe('MCP-012 AC2 — size limits: an oversized write payload is denied', () => {
	const registry = createBaselineMcpFsExceptionRegistry();

	it('denies a staged-preview write over the size limit (fail closed)', () => {
		const result = gateMcpFsOperation(registry, {
			operationId: 'staged-preview.write',
			relativePath: 'preview.json',
			payloadBytes: DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES + 1,
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected denial');
		expect(result.reason).toBe('payload-too-large');
		expect(result.sizeBytes).toBe(DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES + 1);
		expect(result.limitBytes).toBe(DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES);
	});

	it('allows a staged-preview write at the size limit', () => {
		const result = gateMcpFsOperation(registry, {
			operationId: 'staged-preview.write',
			relativePath: 'preview.json',
			payloadBytes: DEFAULT_MCP_STAGED_PREVIEW_MAX_BYTES,
		});
		expect(result.ok).toBe(true);
	});
});

describe('MCP-012 AC2 — schema validation: a malformed request is denied', () => {
	const registry = createBaselineMcpFsExceptionRegistry();

	it('denies a write request missing the required payloadBytes', () => {
		const result = gateMcpFsOperation(registry, {
			operationId: 'staged-preview.write',
			relativePath: 'preview.json',
			request: { operationId: 'staged-preview.write', relativePath: 'preview.json' }, // no payloadBytes
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected denial');
		expect(result.reason).toBe('invalid-request');
		expect((result.issues?.length ?? 0)).toBeGreaterThan(0);
	});

	it('denies a request with an empty relativePath', () => {
		const result = gateMcpFsOperation(registry, {
			operationId: 'vault-export.read',
			relativePath: '',
			request: { operationId: 'vault-export.read', relativePath: '' },
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected denial');
		expect(result.reason).toBe('invalid-request');
	});
});

describe('MCP-012 AC2 — audit behavior: every allowlisted operation is audited', () => {
	it('every baseline filesystem exception declares audited=true', () => {
		const registry = createBaselineMcpFsExceptionRegistry();
		for (const def of registry.list()) {
			expect(def.audited, `${def.operationId} must be audited`).toBe(true);
		}
	});

	it('an allowed gate result surfaces the audit requirement to the platform layer', () => {
		const registry = createBaselineMcpFsExceptionRegistry();
		const result = gateMcpFsOperation(registry, {
			operationId: 'vault-export.read',
			relativePath: 'a.md',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('expected allow');
		expect(result.audited).toBe(true);
	});
});

describe('MCP-012 — determinism', () => {
	it('the same request yields the same gate result', () => {
		const registry = createBaselineMcpFsExceptionRegistry();
		const req = { operationId: 'vault-export.read', relativePath: 'campaign/x.md' } as const;
		expect(gateMcpFsOperation(registry, req)).toEqual(gateMcpFsOperation(registry, req));
	});
});
