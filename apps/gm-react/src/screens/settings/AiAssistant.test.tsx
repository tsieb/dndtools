// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiChatOptions, AiChatRequest, AiReply } from '../../ai/transport';

// RC-ENG-10.4 — the Settings assistant used to call `sendAiChat(config, req)` and drop the run's
// options, so Cancel never aborted the in-flight request. `sendAiChat` is a `vi.fn` here; the bridge
// (`runAssistantExchange`) stays real, so this proves the panel's signal reaches the transport.
const mocks = vi.hoisted(() => ({
	sendAiChat: vi.fn(),
	runtime: {
		state: {
			mcp: {
				enabled: true,
				bindings: { 'agent-1': { agentId: 'agent-1', actorId: 'dm-1', label: 'Helper' } },
			},
		},
		invokeAgentTool: vi.fn(),
	},
}));

vi.mock('../../runtime/RuntimeContext', () => ({ useRuntime: () => mocks.runtime }));
vi.mock('../../ai/providerConfig', () => ({
	isAiProviderConfigured: () => true,
	resolveAiProviderConfig: () => ({ provider: 'fake' }),
}));
vi.mock('../../ai/transport', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../ai/transport')>();
	return { ...actual, sendAiChat: mocks.sendAiChat };
});

const { AiTransportError } = await import('../../ai/transport');
const { Toaster, ToastViewport } = await import('../../ds');
const { I18nProvider } = await import('../../i18n');
const { AiAssistantPanel } = await import('./AiAssistant');

let root: Root;
let container: HTMLDivElement;

const button = (label: string) => {
	const found = [...container.querySelectorAll('button')].find(
		(b) => b.textContent?.trim() === label,
	);
	if (!found) throw new Error(`test: no "${label}" button`);
	return found;
};

async function settle(action: () => void) {
	await act(async () => {
		action();
		for (let i = 0; i < 12; i++) await Promise.resolve();
	});
}

async function ask(text: string) {
	const box = container.querySelector('textarea');
	if (!box) throw new Error('test: no ask textarea');
	await settle(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
		setter?.call(box, text);
		box.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await settle(() => button('Ask').click());
}

beforeEach(() => {
	(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.sendAiChat.mockReset();
	Toaster.clear();
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root.render(
			<I18nProvider>
				<AiAssistantPanel canWrite />
				<ToastViewport />
			</I18nProvider>,
		);
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	Toaster.clear();
});

describe('AiAssistantPanel cancel', () => {
	it('passes the run abort signal to the transport, and Cancel aborts the in-flight request', async () => {
		let seen: AiChatOptions | undefined;
		mocks.sendAiChat.mockImplementationOnce(
			(_config: unknown, _request: AiChatRequest, options?: AiChatOptions) => {
				seen = options;
				return new Promise<AiReply>((_resolve, reject) => {
					options?.signal?.addEventListener('abort', () =>
						reject(new AiTransportError('aborted', null, 'The request was cancelled.')),
					);
				});
			},
		);

		await ask('Read my notes');
		expect(mocks.sendAiChat).toHaveBeenCalledTimes(1);
		expect(seen?.signal).toBeInstanceOf(AbortSignal);
		expect(seen?.signal?.aborted).toBe(false);
		expect(typeof seen?.onToken).toBe('function');

		await settle(() => button('Cancel').click());
		expect(seen?.signal?.aborted).toBe(true);
		// The run settled as cancelled (not a hung request): the composer is usable again.
		expect(button('Ask')).toBeTruthy();
		expect(document.body.textContent).toContain('Assistant run cancelled.');
	});

	it('lets the next ask after a cancel succeed', async () => {
		mocks.sendAiChat.mockImplementationOnce(
			(_config: unknown, _request: AiChatRequest, options?: AiChatOptions) =>
				new Promise<AiReply>((_resolve, reject) => {
					options?.signal?.addEventListener('abort', () =>
						reject(new AiTransportError('aborted', null, 'The request was cancelled.')),
					);
				}),
		);
		await ask('Read my notes');
		await settle(() => button('Cancel').click());

		// The bridge keeps appending to the array it sent, so snapshot the turns at call time.
		let sentTurns: AiChatRequest['turns'] = [];
		mocks.sendAiChat.mockImplementationOnce(async (_config: unknown, request: AiChatRequest) => {
			sentTurns = structuredClone(request.turns);
			return {
				text: 'Prep the fen encounter.',
				toolCalls: [],
				stopReason: 'end',
			} satisfies AiReply;
		});
		await ask('What should I prep?');

		expect(mocks.sendAiChat).toHaveBeenCalledTimes(2);
		expect(sentTurns.at(-1)).toEqual({ role: 'user', text: 'What should I prep?' });
		expect(container.textContent).toContain('Prep the fen encounter.');
	});
});
