import { DEFAULT_ANTHROPIC_MODEL, type AiProviderKind } from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
/* ---- AI provider presets (authored connect cards; the key is always the user's own) -------------- */
/**
 * Guided connect presets — one card per provider. Selecting a card sets the non-secret provider
 * settings (kind + base URL + a suggested model); the user still pastes their own key below. The
 * external model ids are best-effort suggestions and stay user-editable. The local Ollama card points
 * at the loopback OpenAI-compatible endpoint, which `validateAiBaseUrl` allows in dev.
 */
export interface AiProviderPreset {
	id: string;
	label: string;
	provider: AiProviderKind;
	baseUrl: string;
	model: string;
	steps: string[];
	note?: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
	{
		id: 'anthropic',
		label: 'Anthropic (Claude)',
		provider: 'anthropic',
		baseUrl: '',
		model: DEFAULT_ANTHROPIC_MODEL,
		steps: [
			'Create a key at console.anthropic.com → API Keys.',
			'Pick this card, paste the key below, and Save.',
		],
	},
	{
		id: 'openai',
		label: 'OpenAI',
		provider: 'openai-compatible',
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-4o-mini',
		steps: [
			'Create a key at platform.openai.com → API keys.',
			'Pick this card, paste the key below, and Save.',
		],
	},
	{
		id: 'gemini',
		label: 'Google Gemini',
		provider: 'openai-compatible',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		model: 'gemini-2.0-flash',
		steps: [
			'Create a key at aistudio.google.com → API keys.',
			'Pick this card, paste the key below, and Save.',
		],
		note: 'Uses Google’s OpenAI-compatible endpoint.',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		provider: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'openai/gpt-4o-mini',
		steps: [
			'Create a key at openrouter.ai → Keys.',
			'Pick this card, paste the key below, and Save.',
		],
		note: 'One key, many models — change the model id to route.',
	},
	{
		id: 'ollama',
		label: LOCAL_OLLAMA.label,
		provider: 'openai-compatible',
		baseUrl: LOCAL_OLLAMA.baseUrl,
		model: LOCAL_OLLAMA.defaultModel,
		steps: [...LOCAL_OLLAMA.setupSteps],
		note: LOCAL_OLLAMA.note,
	},
];
