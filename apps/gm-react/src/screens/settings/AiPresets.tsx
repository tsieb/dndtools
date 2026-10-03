import { Badge } from '../../ds';
import { T } from '../../app/screen-kit';
import {
	DEFAULT_ANTHROPIC_MODEL,
	type AiProviderKind,
	type AiProviderSettings,
} from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
import { useI18n, type MessageKey } from '../../i18n';
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

export type OllamaProbe =
	| { status: 'unknown' }
	| { status: 'running'; models: string[] }
	| { status: 'down' };

/** Which preset the current settings match (for the "selected" chip). Anthropic matches by kind. */
export function matchingPresetId(
	presets: AiProviderPreset[],
	settings: AiProviderSettings,
): string | null {
	for (const preset of presets) {
		if (preset.provider === 'anthropic' && settings.provider === 'anthropic') return preset.id;
		if (
			preset.provider === 'openai-compatible' &&
			settings.provider === 'openai-compatible' &&
			settings.baseUrl.replace(/\/+$/, '') === preset.baseUrl
		) {
			return preset.id;
		}
	}
	return null;
}

/** One connect card. A locked card stays focusable and says why when pressed (`aria-disabled`). */
export function AiPresetCard({
	preset,
	selected,
	platformUnsupported,
	lockReason,
	ollama,
	onPick,
}: {
	preset: AiProviderPreset;
	selected: boolean;
	platformUnsupported: boolean;
	lockReason: string | null;
	/** The local runner's probe result; null on every other card. */
	ollama: OllamaProbe | null;
	onPick: () => void;
}) {
	const { t } = useI18n();
	const locked = lockReason !== null;
	return (
		<button
			type="button"
			aria-disabled={locked || undefined}
			title={lockReason ?? undefined}
			onClick={onPick}
			style={{
				textAlign: 'left',
				padding: `${T.space.three} ${T.space.three}`,
				borderRadius: T.radius.md,
				border: `1px solid ${selected ? T.accBd : T.bd}`,
				background: selected ? T.accSub : T.alt,
				cursor: locked ? 'not-allowed' : 'pointer',
				opacity: locked ? 0.55 : 1,
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.oneHalf,
			}}
		>
			<div
				style={{ display: 'flex', alignItems: 'center', gap: T.space.oneHalf, flexWrap: 'wrap' }}
			>
				<span style={{ font: `600 var(--text-sm) ${T.sans}`, color: T.ink }}>{preset.label}</span>
				{selected && <Badge status="success">{t('settings.provider.selected')}</Badge>}
				{platformUnsupported && (
					<Badge status="neutral">{t('settings.provider.desktopOnly')}</Badge>
				)}
				{ollama && ollama.status !== 'unknown' && (
					<Badge status={ollama.status === 'running' ? 'success' : 'neutral'}>
						{ollama.status === 'running'
							? t('settings.provider.ollamaDetected', {
									count: ollama.models.length,
								})
							: t('settings.provider.ollamaDown')}
					</Badge>
				)}
			</div>
			<ol
				style={{
					margin: T.space.zero,
					paddingLeft: T.space.four,
					font: `var(--text-xs)/1.5 ${T.sans}`,
					color: T.sub,
				}}
			>
				{preset.steps.map((step, i) => (
					<li key={i}>{step}</li>
				))}
			</ol>
			{(platformUnsupported || preset.note) && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub, fontStyle: 'italic' }}>
					{platformUnsupported ? LOCAL_OLLAMA.desktopOnlyNote : preset.note}
				</div>
			)}
			{ollama && ollama.status === 'running' && !ollama.models.includes(preset.model) && (
				<div style={{ font: `var(--text-xs) ${T.mono}`, color: T.warn }}>
					{t('settings.provider.ollamaPull', { model: preset.model })}
				</div>
			)}
		</button>
	);
}
