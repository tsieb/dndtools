import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendAiChat, AiTransportError, __testing, type AiChatRequest } from './transport';
import type { ResolvedAiProviderConfig } from './providerConfig';

// transport.ts is the raw provider chat client. We mock fetch and drive OUR logic: fail-closed
// not-configured guard (no network), request shaping onto BOTH wire formats (Anthropic Messages
// API headers/body incl. the direct-browser-access header; OpenAI-compatible /chat/completions),
// reply parsing (text + tool calls + stop-reason mapping), the tool-call round-trip staying
// wire-valid on replay, and the typed error surfaces (auth / rate-limit / api / network).

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const anthropicConfig: ResolvedAiProviderConfig = {
	provider: 'anthropic',
	model: 'claude-sonnet-5',
	baseUrl: '',
	apiKey: 'sk-ant-key',
};
const openAiConfig: ResolvedAiProviderConfig = {
	provider: 'openai-compatible',
	model: 'local-model',
	baseUrl: 'https://api.example.com/v1/',
	apiKey: 'sk-oai-key',
};

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function lastFetch(): { url: string; init: RequestInit; body: Record<string, unknown> } {
	const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
	return { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> };
}

/** Await a promise expected to reject, returning the typed transport error it throws. */
async function rejectedWith(p: Promise<unknown>): Promise<AiTransportError> {
	try {
		await p;
	} catch (error) {
		return error as AiTransportError;
	}
	throw new Error('expected the request to reject');
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => (key === 'dndtools.ai.usage-preference' ? 'complete' : null),
	});
	// Network authorization is a separate guard. These transport-shaping cases opt into only the
	// two destinations they exercise, mirroring a configured development/production build.
	vi.stubEnv('VITE_AI_ALLOWED_ORIGINS', 'https://api.anthropic.com https://api.example.com');
});

describe('fail closed', () => {
	it('throws a typed not-configured error without touching the network', async () => {
		await expect(sendAiChat(null, { system: 's', turns: [], tools: [] })).rejects.toMatchObject({
			name: 'AiTransportError',
			kind: 'not-configured',
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does not send the credential when the destination is outside the web allowlist', async () => {
		vi.stubEnv('VITE_AI_ALLOWED_ORIGINS', 'https://api.anthropic.com');

		await expect(
			sendAiChat(openAiConfig, { system: 's', turns: [], tools: [] }),
		).rejects.toMatchObject({ kind: 'network', status: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('Anthropic Messages API shaping', () => {
	const request: AiChatRequest = {
		system: 'you are the assistant',
		turns: [{ role: 'user', text: 'hello' }],
		tools: [{ name: 'note__read', description: 'Read a note', inputSchema: { type: 'object' } }],
	};

	it('POSTs to /v1/messages with the key, version, and direct-browser-access headers', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' }),
		);
		await sendAiChat(anthropicConfig, request);
		const { url, init, body } = lastFetch();
		expect(url).toBe(`${__testing.ANTHROPIC_BASE_URL}/v1/messages`);
		expect(init.redirect).toBe('error');
		const headers = init.headers as Record<string, string>;
		expect(headers['x-api-key']).toBe('sk-ant-key');
		expect(headers['anthropic-version']).toBe(__testing.ANTHROPIC_VERSION);
		expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
		expect(body.model).toBe('claude-sonnet-5');
		expect(body.max_tokens).toBe(__testing.MAX_TOKENS);
		expect(body.system).toBe('you are the assistant');
		expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);
		expect(body.tools).toEqual([
			{ name: 'note__read', description: 'Read a note', input_schema: { type: 'object' } },
		]);
	});

	it('omits the tools field entirely when no tools are offered', async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { content: [], stop_reason: 'end_turn' }));
		await sendAiChat(anthropicConfig, {
			system: 's',
			turns: [{ role: 'user', text: 'hi' }],
			tools: [],
		});
		expect(lastFetch().body).not.toHaveProperty('tools');
	});

	it('parses text + tool_use blocks and maps stop_reason', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				content: [
					{ type: 'text', text: 'let me look' },
					{ type: 'tool_use', id: 'tu_1', name: 'note__read', input: { id: 'n1' } },
				],
				stop_reason: 'tool_use',
			}),
		);
		const reply = await sendAiChat(anthropicConfig, request);
		expect(reply.text).toBe('let me look');
		expect(reply.stopReason).toBe('tool-use');
		expect(reply.toolCalls).toEqual([{ id: 'tu_1', name: 'note__read', input: { id: 'n1' } }]);
	});

	it('maps refusal and max_tokens stop reasons', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { content: [], stop_reason: 'refusal' }));
		expect((await sendAiChat(anthropicConfig, request)).stopReason).toBe('refusal');
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }),
		);
		expect((await sendAiChat(anthropicConfig, request)).stopReason).toBe('max-tokens');
	});

	it('replays assistant tool_use + tool_result turns as wire-valid Anthropic blocks', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }),
		);
		await sendAiChat(anthropicConfig, {
			system: 's',
			turns: [
				{ role: 'user', text: 'read n1' },
				{
					role: 'assistant',
					text: '',
					toolCalls: [{ id: 'tu_1', name: 'note__read', input: { id: 'n1' } }],
				},
				{
					role: 'tool-results',
					results: [{ toolCallId: 'tu_1', content: 'note body', isError: false }],
				},
			],
			tools: [],
		});
		const messages = lastFetch().body.messages as Array<{ role: string; content: unknown[] }>;
		// assistant turn with empty text drops the text block, keeps the tool_use block
		expect(messages[1]).toEqual({
			role: 'assistant',
			content: [{ type: 'tool_use', id: 'tu_1', name: 'note__read', input: { id: 'n1' } }],
		});
		// tool-results ride back as a user message of tool_result blocks
		expect(messages[2]).toEqual({
			role: 'user',
			content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'note body' }],
		});
	});
});

describe('OpenAI-compatible shaping', () => {
	const request: AiChatRequest = {
		system: 'sys',
		turns: [{ role: 'user', text: 'hello' }],
		tools: [{ name: 'note__read', description: 'Read', inputSchema: { type: 'object' } }],
	};

	it('POSTs to {baseUrl}/chat/completions with a Bearer key and a system message', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }),
		);
		await sendAiChat(openAiConfig, request);
		const { url, init, body } = lastFetch();
		expect(url).toBe('https://api.example.com/v1/chat/completions'); // trailing slash on baseUrl normalized
		expect(init.redirect).toBe('error');
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-oai-key');
		const messages = body.messages as Array<{ role: string }>;
		expect(messages[0]).toEqual({ role: 'system', content: 'sys' });
		expect(body.tools).toEqual([
			{
				type: 'function',
				function: { name: 'note__read', description: 'Read', parameters: { type: 'object' } },
			},
		]);
	});

	it('parses content + tool_calls, JSON-decoding the arguments string', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				choices: [
					{
						message: {
							content: 'looking',
							tool_calls: [
								{ id: 'c1', function: { name: 'note__read', arguments: '{"id":"n1"}' } },
							],
						},
						finish_reason: 'tool_calls',
					},
				],
			}),
		);
		const reply = await sendAiChat(openAiConfig, request);
		expect(reply.stopReason).toBe('tool-use');
		expect(reply.toolCalls).toEqual([{ id: 'c1', name: 'note__read', input: { id: 'n1' } }]);
	});

	it('degrades malformed tool arguments to an empty input (so the Core denies, never a silent success)', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				choices: [
					{
						message: {
							content: null,
							tool_calls: [{ id: 'c1', function: { name: 'note__read', arguments: '{bad' } }],
						},
						finish_reason: 'tool_calls',
					},
				],
			}),
		);
		const reply = await sendAiChat(openAiConfig, request);
		expect(reply.toolCalls).toEqual([{ id: 'c1', name: 'note__read', input: {} }]);
	});
});

describe('error surfaces', () => {
	it('maps 401 to a typed auth error', async () => {
		fetchMock.mockResolvedValue(jsonResponse(401, { error: { message: 'bad key' } }));
		await expect(
			sendAiChat(anthropicConfig, { system: 's', turns: [], tools: [] }),
		).rejects.toMatchObject({ kind: 'auth', status: 401 });
	});

	it('maps 429 to a typed rate-limit error', async () => {
		fetchMock.mockResolvedValue(jsonResponse(429, {}));
		await expect(
			sendAiChat(anthropicConfig, { system: 's', turns: [], tools: [] }),
		).rejects.toMatchObject({ kind: 'rate-limit', status: 429 });
	});

	it('surfaces the provider message on a 4xx (actionable bad-model errors)', async () => {
		fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: 'model not found' } }));
		const err = await rejectedWith(
			sendAiChat(anthropicConfig, { system: 's', turns: [], tools: [] }),
		);
		expect(err.kind).toBe('api');
		expect(err.message).toContain('model not found');
	});

	it('keeps 5xx generic and never reads the body', async () => {
		const body = { error: { message: 'internal secret detail' } };
		fetchMock.mockResolvedValue(jsonResponse(500, body));
		const err = await rejectedWith(
			sendAiChat(anthropicConfig, { system: 's', turns: [], tools: [] }),
		);
		expect(err.kind).toBe('api');
		expect(err.status).toBe(500);
		expect(err.message).not.toContain('internal secret detail');
	});

	it('maps a thrown fetch (offline) to a typed network error', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(
			sendAiChat(openAiConfig, { system: 's', turns: [], tools: [] }),
		).rejects.toMatchObject({ kind: 'network', status: null });
	});
});
