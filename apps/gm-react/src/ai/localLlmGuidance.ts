/**
 * The user-facing contract for DND Tools' supported local LLM path. Keep this small and import it
 * from both the Settings UI and tests so the setup instructions cannot quietly drift from the
 * endpoint and model the app actually uses.
 */
export const LOCAL_OLLAMA = {
	label: 'Local (Ollama)',
	baseUrl: 'http://localhost:11434/v1',
	healthUrl: 'http://localhost:11434/api/tags',
	defaultModel: 'qwen2.5:7b',
	setupSteps: [
		'Install Ollama and run `ollama serve`.',
		'Run `ollama pull qwen2.5:7b` (a strong tool-calling model).',
		'Pick this card, enter any non-empty text as the key, and Save.',
	],
	note: 'Runs entirely on this device. Allowed in local dev; a hosted build must allowlist the origin.',
	desktopOnlyNote:
		'Local Ollama access is available in the desktop app. Android permits HTTPS providers only.',
} as const;
