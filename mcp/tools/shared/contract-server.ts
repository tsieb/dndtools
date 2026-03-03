import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FileSystemAdapter } from '../../storage.js';
import {
	MCP_TOOL_CONTRACTS,
	isPermissionAllowed,
	type ToolPermission,
	type ToolRetryPolicy,
} from './contracts.js';
import { errorResult, jsonResult, parseToolEnvelope, type ToolResult } from './response.js';
import { PERFORMANCE_BUDGETS } from '../../../src/lib/types/diagnostics.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;
type ToolShape = Record<string, z.ZodTypeAny>;
type McpPerformanceSample = {
	operation: 'mcp_bundle_call';
	durationMs: number;
	at: string;
	source: 'mcp';
	context: Record<string, string | number | boolean | null>;
	budgetMs: number;
	regressionThresholdMs: number;
	exceededBudget: boolean;
};

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

const MCP_PERF_LOG_VERSION = 1;
const MCP_PERF_MAX_EVENTS = 240;

function isBundleTool(toolName: string): boolean {
	return toolName.endsWith('_bundle');
}

function resolveMcpPerfLogPath(storage: FileSystemAdapter): string | null {
	const maybeGetVaultDir = (storage as { getVaultDir?: () => string }).getVaultDir;
	if (!maybeGetVaultDir) return null;
	const vaultDir = maybeGetVaultDir();
	if (!vaultDir) return null;
	return path.join(vaultDir, '.vault', 'mcp-performance.json');
}

async function appendMcpPerfSample(
	storage: FileSystemAdapter,
	sample: McpPerformanceSample,
): Promise<void> {
	const logPath = resolveMcpPerfLogPath(storage);
	if (!logPath) return;

	let events: McpPerformanceSample[] = [];
	try {
		const raw = await fs.readFile(logPath, 'utf-8');
		const parsed = JSON.parse(raw) as { version?: number; events?: McpPerformanceSample[] };
		if (parsed.version === MCP_PERF_LOG_VERSION && Array.isArray(parsed.events)) {
			events = parsed.events;
		}
	} catch {
		// First write or unreadable previous data.
	}

	events.push(sample);
	if (events.length > MCP_PERF_MAX_EVENTS) {
		events = events.slice(-MCP_PERF_MAX_EVENTS);
	}
	try {
		await fs.mkdir(path.dirname(logPath), { recursive: true });
		await fs.writeFile(
			logPath,
			`${JSON.stringify({ version: MCP_PERF_LOG_VERSION, events }, null, 2)}\n`,
			'utf-8',
		);
	} catch {
		// Diagnostics logging must never break tool execution.
	}
}

export function createContractServer(
	server: McpServer,
	storage: FileSystemAdapter,
	options?: RegisterToolsOptions,
): McpServer {
	const grantedPermission = grantedPermissionFor(options?.writeMode);
	const responseCache = new Map<string, ToolResult>();
	const inFlightCache = new Map<string, Promise<ToolResult>>();

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

				const execute = async (): Promise<ToolResult> => {
					const shouldMeasureBundle = isBundleTool(name);
					const measureId = `mcp-bundle-${name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
					const startMark = `dndtools:${measureId}:start`;
					const endMark = `dndtools:${measureId}:end`;
					const measureName = `dndtools:${measureId}:measure`;
					const startedAt = shouldMeasureBundle ? performance.now() : 0;
					if (shouldMeasureBundle) {
						performance.mark(startMark);
					}
					try {
						let rawResult: ToolResult;
						try {
							rawResult = await handler(inputWithoutKey);
						} catch (error) {
							const message =
								error instanceof Error ? error.message : 'Unhandled MCP tool exception.';
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
					} finally {
						if (shouldMeasureBundle) {
							performance.mark(endMark);
							performance.measure(measureName, startMark, endMark);
							const measured = performance.getEntriesByName(measureName, 'measure').at(-1);
							const durationMs = Number(
								((measured?.duration ?? performance.now() - startedAt) || 0).toFixed(2),
							);
							performance.clearMarks(startMark);
							performance.clearMarks(endMark);
							performance.clearMeasures(measureName);
							const budget = PERFORMANCE_BUDGETS.mcp_bundle_call;
							void appendMcpPerfSample(storage, {
								operation: 'mcp_bundle_call',
								durationMs,
								at: new Date().toISOString(),
								source: 'mcp',
								context: { tool: name },
								budgetMs: budget.targetMs,
								regressionThresholdMs: budget.regressionThresholdMs,
								exceededBudget: durationMs > budget.targetMs,
							});
						}
					}
				};

				if (!cacheKey) {
					return execute();
				}

				if (inFlightCache.has(cacheKey)) {
					return cloneToolResult(await inFlightCache.get(cacheKey)!);
				}

				const inFlight = execute().finally(() => {
					inFlightCache.delete(cacheKey);
				});
				inFlightCache.set(cacheKey, inFlight);
				return cloneToolResult(await inFlight);
			});
		},
	};

	return contractServer as McpServer;
}
