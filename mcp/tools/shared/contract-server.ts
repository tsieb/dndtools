import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import {
	MCP_TOOL_CONTRACTS,
	isPermissionAllowed,
	type ToolPermission,
	type ToolRetryPolicy,
} from './contracts.js';
import { errorResult, jsonResult, parseToolEnvelope, type ToolResult } from './response.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
type ToolShape = Record<string, z.ZodTypeAny>;

export interface RegisterToolsOptions {
	writeMode?: 'staged' | 'direct';
}

function cloneToolResult(result: ToolResult): ToolResult {
	return {
		isError: result.isError,
		content: result.content.map((entry) => ({
			type: entry.type,
			text: entry.text,
		})),
	};
}

function grantedPermissionFor(writeMode: RegisterToolsOptions['writeMode']): ToolPermission {
	return writeMode === 'staged' ? 'write-staged' : 'write-direct';
}

function idempotencyKeyFor(toolName: string, idempotencyKey: string): string {
	return `${toolName}:${idempotencyKey}`;
}

function shouldUseCache(policy: ToolRetryPolicy, idempotencyKey?: string): boolean {
	return policy === 'idempotency-key-required' && !!idempotencyKey;
}

function toIssueSummary(error: z.ZodError): Array<{ path: string; message: string }> {
	return error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
		message: issue.message,
	}));
}

export function createContractServer(
	server: McpServer,
	_storage: FileSystemAdapter,
	options?: RegisterToolsOptions,
): McpServer {
	const grantedPermission = grantedPermissionFor(options?.writeMode);
	const responseCache = new Map<string, ToolResult>();

	const contractServer = {
		...server,
		tool(name: string, description: string, schema: ToolShape, handler: ToolHandler): void {
			const contract = MCP_TOOL_CONTRACTS[name];
			if (!contract) {
				throw new Error(`Missing MCP tool contract for "${name}".`);
			}

			const publicShape: ToolShape = {
				...schema,
				idempotencyKey: z
					.string()
					.min(1)
					.max(200)
					.optional()
					.describe('Optional retry key for non-idempotent tools.'),
			};
			const strictSchema = z.object(publicShape).strict();

			server.tool(name, description, publicShape, async (rawInput: Record<string, unknown>) => {
				if (!isPermissionAllowed(contract.permission, grantedPermission)) {
					return errorResult('Tool is not permitted for the current MCP write mode.', {
						code: 'MCP_PERMISSION_DENIED',
						tool: name,
						hint:
							contract.permission === 'write-direct'
								? 'Restart MCP with --direct or DNDTOOLS_MCP_STAGED=0, then retry.'
								: 'Tool requires write capability. Use staged or direct MCP mode and retry.',
						details: {
							requiredPermission: contract.permission,
							grantedPermission,
						},
					});
				}

				const parsedInput = strictSchema.safeParse(rawInput ?? {});
				if (!parsedInput.success) {
					return errorResult('Tool input did not match the required schema.', {
						code: 'MCP_INVALID_INPUT',
						tool: name,
						hint: 'Remove unknown fields, fix invalid types, and retry.',
						details: toIssueSummary(parsedInput.error),
					});
				}

				const { idempotencyKey, ...inputWithoutKey } = parsedInput.data;
				const cacheEnabled = shouldUseCache(contract.retryPolicy, idempotencyKey);
				const cacheKey = cacheEnabled ? idempotencyKeyFor(name, idempotencyKey ?? '') : undefined;
				if (cacheKey && responseCache.has(cacheKey)) {
					return cloneToolResult(responseCache.get(cacheKey)!);
				}

				let rawResult: ToolResult;
				try {
					rawResult = await handler(inputWithoutKey);
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unhandled MCP tool exception.';
					return errorResult(message, {
						code: 'MCP_INTERNAL_ERROR',
						retriable: true,
						tool: name,
						hint: 'Retry once. If it still fails, inspect MCP logs and storage health.',
					});
				}

				const envelope = parseToolEnvelope(rawResult);
				if (!envelope) {
					return errorResult('Tool returned a non-contract response envelope.', {
						code: 'MCP_RESPONSE_SCHEMA_INVALID',
						tool: name,
						hint: 'Return responses through shared response helpers and retry.',
					});
				}

				if (!envelope.ok) {
					return errorResult(envelope.error.message, {
						...envelope.error,
						tool: envelope.error.tool ?? name,
					});
				}

				const parsedResponse = contract.responseSchema.safeParse(envelope.data);
				if (!parsedResponse.success) {
					return errorResult('Tool response payload failed schema validation.', {
						code: 'MCP_RESPONSE_SCHEMA_INVALID',
						tool: name,
						hint: contract.remediationHint,
						details: toIssueSummary(parsedResponse.error),
					});
				}

				const normalizedResult = jsonResult(parsedResponse.data);
				if (cacheKey) {
					responseCache.set(cacheKey, cloneToolResult(normalizedResult));
				}
				return normalizedResult;
			});
		},
	};

	return contractServer as McpServer;
}
