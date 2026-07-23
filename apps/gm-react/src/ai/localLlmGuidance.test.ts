import { describe, expect, it } from 'vitest';
import { ASSISTANT_SYSTEM_PROMPT } from './mcpBridge';
import { LOCAL_OLLAMA } from './localLlmGuidance';

describe('local LLM setup guidance', () => {
	it('documents a runnable Ollama endpoint, health check, and tool-capable default model', () => {
		expect(LOCAL_OLLAMA.baseUrl).toBe('http://localhost:11434/v1');
		expect(LOCAL_OLLAMA.healthUrl).toBe('http://localhost:11434/api/tags');
		expect(LOCAL_OLLAMA.defaultModel).toBe('qwen2.5:7b');
	});

	it('gives a complete, ordered local setup path', () => {
		const guidance = LOCAL_OLLAMA.setupSteps.join(' ');
		expect(guidance).toMatch(/install ollama/i);
		expect(guidance).toMatch(/ollama serve/i);
		expect(guidance).toContain(`ollama pull ${LOCAL_OLLAMA.defaultModel}`);
		expect(guidance).toMatch(/non-empty text as the key/i);
		expect(LOCAL_OLLAMA.note).toMatch(/entirely on this device/i);
		expect(LOCAL_OLLAMA.desktopOnlyNote).toMatch(/Android.*HTTPS/i);
	});
});

describe('local LLM assistant prompt contract', () => {
	it('guides a tool-calling model to be grounded, useful, and honest about writes', () => {
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Use the tools to ground answers/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/multi-step task/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/build it up level by level/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/staged proposal/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/never describe a staged write as done/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/fix your input, and try once more/i);
		expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/concise and practical for a DM/i);
	});
});
