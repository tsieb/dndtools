import { z } from 'zod';

export interface ToolResult {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
}

export type ToolErrorCode =
	| 'MCP_INVALID_INPUT'
	| 'MCP_NOT_FOUND'
	| 'MCP_CONFLICT'
	| 'MCP_PERMISSION_DENIED'
	| 'MCP_UNSUPPORTED'
	| 'MCP_INTERNAL_ERROR'
	| 'MCP_RESPONSE_SCHEMA_INVALID';

export const toolErrorSchema = z
	.object({
		code: z.enum([
			'MCP_INVALID_INPUT',
			'MCP_NOT_FOUND',
			'MCP_CONFLICT',
			'MCP_PERMISSION_DENIED',
			'MCP_UNSUPPORTED',
			'MCP_INTERNAL_ERROR',
			'MCP_RESPONSE_SCHEMA_INVALID',
		]),
		message: z.string().min(1),
		hint: z.string().min(1),
		retriable: z.boolean(),
		tool: z.string().min(1).optional(),
		details: z.unknown().optional(),
	})
	.strict();

export const toolSuccessEnvelopeSchema = z
	.object({
		ok: z.literal(true),
		data: z.unknown(),
	})
	.strict();

export const toolErrorEnvelopeSchema = z
	.object({
		ok: z.literal(false),
		error: toolErrorSchema,
	})
	.strict();

export const toolEnvelopeSchema = z.union([toolSuccessEnvelopeSchema, toolErrorEnvelopeSchema]);

export type ToolEnvelope = z.infer<typeof toolEnvelopeSchema>;

export interface ErrorResultOptions {
	code?: ToolErrorCode;
	hint?: string;
	retriable?: boolean;
	tool?: string;
	details?: unknown;
}

function envelopeResult(payload: ToolEnvelope): ToolResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(payload, null, 2),
			},
		],
		isError: payload.ok === false,
	};
}

function inferErrorCode(message: string): ToolErrorCode {
	const lower = message.toLowerCase();
	if (lower.includes('not found')) return 'MCP_NOT_FOUND';
	if (lower.includes('cycle') || lower.includes('conflict')) return 'MCP_CONFLICT';
	if (lower.includes('unsupported')) return 'MCP_UNSUPPORTED';
	return 'MCP_INTERNAL_ERROR';
}

function inferErrorHint(message: string): string {
	const lower = message.toLowerCase();
	if (lower.includes('not found')) {
		return 'Verify identifiers exist by listing resources first, then retry.';
	}
	if (lower.includes('either id or title')) {
		return 'Provide exactly one stable identifier (id or title) and retry.';
	}
	if (lower.includes('unsupported image extension')) {
		return 'Use a supported image format: png, jpg, jpeg, gif, webp, svg, bmp, or avif.';
	}
	if (lower.includes('source image file was not found')) {
		return 'Confirm the source path exists and is readable from this machine.';
	}
	if (lower.includes('cycle')) {
		return 'Remove the cycle or explicitly set allowCycle=true if intentional.';
	}
	return 'Validate inputs and retry. If this persists, inspect MCP logs.';
}

export function jsonResult(payload: unknown): ToolResult {
	return envelopeResult({ ok: true, data: payload });
}

export function textResult(text: string): ToolResult {
	return jsonResult({ message: text });
}

export function errorResult(message: string, options?: ErrorResultOptions): ToolResult {
	return envelopeResult({
		ok: false,
		error: {
			code: options?.code ?? inferErrorCode(message),
			message,
			hint: options?.hint ?? inferErrorHint(message),
			retriable: options?.retriable ?? false,
			tool: options?.tool,
			details: options?.details,
		},
	});
}

export function parseToolEnvelope(result: ToolResult): ToolEnvelope | null {
	const text = result.content[0]?.text;
	if (!text) return null;
	try {
		const parsed = JSON.parse(text);
		const validated = toolEnvelopeSchema.safeParse(parsed);
		return validated.success ? validated.data : null;
	} catch {
		return null;
	}
}
