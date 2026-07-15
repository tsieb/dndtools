/**
 * transport — the CLIENT-SIDE LLM PROVIDER TRANSPORT (ADR-021, closing the ADR-014 deferral).
 * One provider-agnostic chat call, `sendAiChat`, shaped onto either:
 *
 *   - the ANTHROPIC MESSAGES API — `POST https://api.anthropic.com/v1/messages` with the
 *     `anthropic-version` header AND `anthropic-dangerous-direct-browser-access: true` (required
 *     for a browser/CORS call; the "danger" is shipping a key in a page, which BYO-key custody in
 *     providerConfig.ts answers — the key is the user's own, held device-local, never bundled);
 *   - any OPENAI-COMPATIBLE endpoint — `POST {baseUrl}/chat/completions` with a Bearer key — so
 *     users are not locked to one vendor (local runners, proxies, other hosted providers).
 *
 * This module is TRANSPORT ONLY (the googleDocs.ts contract): it shapes requests, performs the
 * fetch, parses the reply into the provider-agnostic {@link AiReply}, and maps failures onto the
 * typed {@link AiTransportError}. It knows NOTHING about MCP, policy, staging, or the vault —
 * tool calls surface as inert data for mcpBridge.ts to route through the Core's fail-closed agent
 * pipeline. With no config it throws `not-configured` BEFORE any network I/O (fail closed).
 */

import { authorizeAiProviderNetworkAccess, type ResolvedAiProviderConfig } from './providerConfig';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
// Room for the reply plus Sonnet's adaptive thinking (which counts against max_tokens).
const MAX_TOKENS = 8192;

// --- provider-agnostic chat shapes ----------------------------------------------------------------

/** A tool call the model requested. `name` is the PROVIDER-SAFE tool name (see mcpBridge). */
export interface AiToolCall {
	id: string;
	name: string;
	input: unknown;
}

/** One result answering a prior {@link AiToolCall}, sent back on the next request. */
export interface AiToolResult {
	toolCallId: string;
	content: string;
	isError: boolean;
}

/**
 * One conversation turn. Assistant turns carry the tool calls the model made so a replayed
 * conversation stays valid on both wire formats (Anthropic `tool_use` blocks / OpenAI
 * `tool_calls`); `tool-results` turns answer them.
 */
export type AiTurn =
	| { role: 'user'; text: string }
	| { role: 'assistant'; text: string; toolCalls: AiToolCall[] }
	| { role: 'tool-results'; results: AiToolResult[] };

/** A tool offered to the model: a provider-safe name + plain JSON Schema for its input. */
export interface AiToolSpec {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface AiChatRequest {
	system: string;
	turns: AiTurn[];
	tools: AiToolSpec[];
}

export interface AiReply {
	text: string;
	toolCalls: AiToolCall[];
	stopReason: 'end' | 'tool-use' | 'max-tokens' | 'refusal' | 'other';
}

// --- typed errors (mirrors AppApiError's honest 4xx-message / generic-5xx split) ------------------

export type AiTransportErrorKind = 'not-configured' | 'auth' | 'rate-limit' | 'api' | 'network';

export class AiTransportError extends Error {
	readonly kind: AiTransportErrorKind;
	readonly status: number | null;
	constructor(kind: AiTransportErrorKind, status: number | null, message: string) {
		super(message);
		this.name = 'AiTransportError';
		this.kind = kind;
		this.status = status;
	}
}

/** Map a non-OK provider response to the typed error. 4xx surfaces the provider's own (short)
 *  message so a bad key / bad model id is actionable; 5xx stays generic. */
async function toTransportError(response: Response): Promise<AiTransportError> {
	if (response.status === 401 || response.status === 403) {
		return new AiTransportError(
			'auth',
			response.status,
			'The provider rejected the API key — check it in Settings → AI & tools.',
		);
	}
	if (response.status === 429) {
		return new AiTransportError(
			'rate-limit',
			429,
			'The provider is rate-limiting requests — wait a moment and try again.',
		);
	}
	let detail = '';
	if (response.status < 500) {
		const body = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		const message = body?.error?.message;
		if (typeof message === 'string' && message.length > 0) detail = `: ${message.slice(0, 300)}`;
	}
	return new AiTransportError(
		'api',
		response.status,
		`AI provider request failed (${response.status})${detail}.`,
	);
}

// --- Anthropic Messages API shaping ----------------------------------------------------------------

type AnthropicContentBlock =
	| { type: 'text'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

function anthropicMessages(
	turns: AiTurn[],
): Array<{ role: 'user' | 'assistant'; content: AnthropicContentBlock[] }> {
	return turns.map((turn) => {
		if (turn.role === 'user') {
			return { role: 'user' as const, content: [{ type: 'text' as const, text: turn.text }] };
		}
		if (turn.role === 'assistant') {
			const blocks: AnthropicContentBlock[] = [];
			if (turn.text !== '') blocks.push({ type: 'text', text: turn.text });
			for (const call of turn.toolCalls) {
				blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input ?? {} });
			}
			return { role: 'assistant' as const, content: blocks };
		}
		// tool-results — Anthropic carries them as tool_result blocks in a user message.
		return {
			role: 'user' as const,
			content: turn.results.map((r) => ({
				type: 'tool_result' as const,
				tool_use_id: r.toolCallId,
				content: r.content,
				...(r.isError ? { is_error: true } : {}),
			})),
		};
	});
}

interface AnthropicResponse {
	content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
	stop_reason?: string;
}

function parseAnthropicReply(body: AnthropicResponse): AiReply {
	const text = (body.content ?? [])
		.filter((block) => block.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text as string)
		.join('');
	const toolCalls: AiToolCall[] = (body.content ?? [])
		.filter(
			(block) =>
				block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string',
		)
		.map((block) => ({
			id: block.id as string,
			name: block.name as string,
			input: block.input ?? {},
		}));
	const stopReason: AiReply['stopReason'] =
		body.stop_reason === 'end_turn'
			? 'end'
			: body.stop_reason === 'tool_use'
				? 'tool-use'
				: body.stop_reason === 'max_tokens'
					? 'max-tokens'
					: body.stop_reason === 'refusal'
						? 'refusal'
						: 'other';
	return { text, toolCalls, stopReason };
}

async function sendAnthropic(
	config: ResolvedAiProviderConfig,
	request: AiChatRequest,
): Promise<AiReply> {
	const body = {
		model: config.model,
		max_tokens: MAX_TOKENS,
		system: request.system,
		messages: anthropicMessages(request.turns),
		...(request.tools.length > 0
			? {
					tools: request.tools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						input_schema: tool.inputSchema,
					})),
				}
			: {}),
	};
	let response: Response;
	try {
		response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
			method: 'POST',
			// A redirect must never carry a provider credential beyond its confirmed origin.
			redirect: 'error',
			headers: {
				'content-type': 'application/json',
				'x-api-key': config.apiKey,
				'anthropic-version': ANTHROPIC_VERSION,
				// Required for a direct browser (CORS) call; see the module doc for why this is safe here.
				'anthropic-dangerous-direct-browser-access': 'true',
			},
			body: JSON.stringify(body),
		});
	} catch {
		throw new AiTransportError(
			'network',
			null,
			'Could not reach the AI provider — check your connection.',
		);
	}
	if (!response.ok) throw await toTransportError(response);
	return parseAnthropicReply((await response.json()) as AnthropicResponse);
}

// --- OpenAI-compatible shaping ----------------------------------------------------------------------

type OpenAiMessage =
	| { role: 'system' | 'user'; content: string }
	| {
			role: 'assistant';
			content: string | null;
			tool_calls?: Array<{
				id: string;
				type: 'function';
				function: { name: string; arguments: string };
			}>;
	  }
	| { role: 'tool'; tool_call_id: string; content: string };

function openAiMessages(system: string, turns: AiTurn[]): OpenAiMessage[] {
	const messages: OpenAiMessage[] = [{ role: 'system', content: system }];
	for (const turn of turns) {
		if (turn.role === 'user') {
			messages.push({ role: 'user', content: turn.text });
		} else if (turn.role === 'assistant') {
			messages.push({
				role: 'assistant',
				content: turn.text === '' ? null : turn.text,
				...(turn.toolCalls.length > 0
					? {
							tool_calls: turn.toolCalls.map((call) => ({
								id: call.id,
								type: 'function' as const,
								function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
							})),
						}
					: {}),
			});
		} else {
			// tool-results — OpenAI carries each as its own role:"tool" message.
			for (const result of turn.results) {
				const prefix = result.isError ? 'ERROR: ' : '';
				messages.push({
					role: 'tool',
					tool_call_id: result.toolCallId,
					content: `${prefix}${result.content}`,
				});
			}
		}
	}
	return messages;
}

interface OpenAiResponse {
	choices?: Array<{
		message?: {
			content?: string | null;
			tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
		};
		finish_reason?: string;
	}>;
}

function parseOpenAiReply(body: OpenAiResponse): AiReply {
	const choice = body.choices?.[0];
	const toolCalls: AiToolCall[] = (choice?.message?.tool_calls ?? [])
		.filter((call) => typeof call.id === 'string' && typeof call.function?.name === 'string')
		.map((call) => {
			// Malformed arguments degrade to an empty input — the Core's fail-closed schema validation
			// then denies the call and the model sees the structured denial (never a silent success).
			let input: unknown;
			try {
				input = JSON.parse(call.function?.arguments || '{}');
			} catch {
				input = {};
			}
			return { id: call.id as string, name: call.function?.name as string, input };
		});
	const finish = choice?.finish_reason;
	const stopReason: AiReply['stopReason'] =
		finish === 'stop'
			? 'end'
			: finish === 'tool_calls'
				? 'tool-use'
				: finish === 'length'
					? 'max-tokens'
					: 'other';
	return { text: choice?.message?.content ?? '', toolCalls, stopReason };
}

async function sendOpenAiCompatible(
	config: ResolvedAiProviderConfig,
	request: AiChatRequest,
): Promise<AiReply> {
	const base = config.baseUrl.replace(/\/+$/, '');
	const body = {
		model: config.model,
		messages: openAiMessages(request.system, request.turns),
		...(request.tools.length > 0
			? {
					tools: request.tools.map((tool) => ({
						type: 'function' as const,
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.inputSchema,
						},
					})),
				}
			: {}),
	};
	let response: Response;
	try {
		response = await fetch(`${base}/chat/completions`, {
			method: 'POST',
			// A redirect must never carry a provider credential beyond its confirmed origin.
			redirect: 'error',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify(body),
		});
	} catch {
		throw new AiTransportError(
			'network',
			null,
			'Could not reach the AI provider — check the base URL and your connection.',
		);
	}
	if (!response.ok) throw await toTransportError(response);
	return parseOpenAiReply((await response.json()) as OpenAiResponse);
}

// --- entry point ------------------------------------------------------------------------------------

/**
 * One chat exchange with the configured provider. Fail closed: a null config throws
 * `not-configured` before any network I/O — callers pass `resolveAiProviderConfig()` straight in.
 */
export async function sendAiChat(
	config: ResolvedAiProviderConfig | null,
	request: AiChatRequest,
): Promise<AiReply> {
	if (config === null) {
		throw new AiTransportError(
			'not-configured',
			null,
			'No AI provider is configured — add your API key in Settings → AI & tools.',
		);
	}
	if (!(await authorizeAiProviderNetworkAccess(config))) {
		throw new AiTransportError(
			'network',
			null,
			'This provider address is not allowed by the application network policy. Check the HTTPS base URL or the deployment allowlist.',
		);
	}
	return config.provider === 'anthropic'
		? sendAnthropic(config, request)
		: sendOpenAiCompatible(config, request);
}

export const __testing = { ANTHROPIC_BASE_URL, ANTHROPIC_VERSION, MAX_TOKENS };
