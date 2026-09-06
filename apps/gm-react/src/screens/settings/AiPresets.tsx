import { DEFAULT_ANTHROPIC_MODEL, type AiProviderKind } from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
import type { MessageKey } from '../../i18n';
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

/**
 * The cards, rendered in the reader's language. Provider names are brands and stay verbatim; the
 * instructions around them come from the catalog, so the list is built per locale rather than
 * frozen at module load.
 *
 * The local-runner card is the exception: its label, steps and notes come from `LOCAL_OLLAMA`, the
 * `src/ai` contract that keeps the instructions and the endpoint the app actually calls in one
 * place. Those strings stay English until that module carries message keys.
 */
export function buildAiProviderPresets(t: (key: MessageKey) => string): AiProviderPreset[] {
	const pasteAndSave = t('settings.provider.stepPasteAndSave');
	return [
		{
			id: 'anthropic',
			label: 'Anthropic (Claude)',
			provider: 'anthropic',
			baseUrl: '',
			model: DEFAULT_ANTHROPIC_MODEL,
			steps: [t('settings.provider.stepAnthropicKey'), pasteAndSave],
		},
		{
			id: 'openai',
			label: 'OpenAI',
			provider: 'openai-compatible',
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4o-mini',
			steps: [t('settings.provider.stepOpenAiKey'), pasteAndSave],
		},
		{
			id: 'gemini',
			label: 'Google Gemini',
			provider: 'openai-compatible',
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
			model: 'gemini-2.0-flash',
			steps: [t('settings.provider.stepGeminiKey'), pasteAndSave],
			note: t('settings.provider.noteGemini'),
		},
		{
			id: 'openrouter',
			label: 'OpenRouter',
			provider: 'openai-compatible',
			baseUrl: 'https://openrouter.ai/api/v1',
			model: 'openai/gpt-4o-mini',
			steps: [t('settings.provider.stepOpenRouterKey'), pasteAndSave],
			note: t('settings.provider.noteOpenRouter'),
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
}
