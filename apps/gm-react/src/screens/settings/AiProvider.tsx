import { useMemo, useState } from 'react';
import { Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { usePlatformCapabilities } from '../../platform/capabilities';
import {
	DEFAULT_ANTHROPIC_MODEL,
	MAX_API_KEY_CHARS,
	MAX_BASE_URL_CHARS,
	MAX_MODEL_CHARS,
	clearAiProviderKey,
	clearLegacyAiProviderKey,
	getAiProviderKey,
	getAiProviderSettings,
	hasLegacyAiProviderKey,
	isAiProviderConfigured,
	resolveAiProviderDestination,
	saveAiProviderSettings,
	setAiProviderKey,
	type AiProviderKind,
	type AiProviderSettings,
} from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
import { buildAiProviderPresets, type AiProviderPreset } from './AiPresets';
/* ---- AI provider setup (ADR-021 — the BYO-key transport half of the AI & tools subpage) ---------- */
/** Which preset the current settings match (for the "selected" chip). Anthropic matches by kind. */
function matchingPresetId(
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

type OllamaProbe =
	| { status: 'unknown' }
	| { status: 'running'; models: string[] }
	| { status: 'down' };

export /** Provider configuration — BYO key, device-local custody, fail-closed until complete. */
function AiProviderPanel({ onConfiguredChange }: { onConfiguredChange: () => void }) {
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const [settings, setSettings] = useState(() => getAiProviderSettings());
	const [keyDraft, setKeyDraft] = useState('');
	const [hasKey, setHasKey] = useState(() => getAiProviderKey() !== null);
	const [hasLegacyKey, setHasLegacyKey] = useState(() => hasLegacyAiProviderKey());
	const [keyBusy, setKeyBusy] = useState(false);
	const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
	const [forgetConfirmOpen, setForgetConfirmOpen] = useState(false);
	const [legacyConfirmOpen, setLegacyConfirmOpen] = useState(false);
	const [ollama, setOllama] = useState<OllamaProbe>({ status: 'unknown' });
	const [ollamaBusy, setOllamaBusy] = useState(false);
	const configured = isAiProviderConfigured();
	// The connect cards carry copy, so they are built per locale rather than frozen at module load.
	const presets = useMemo(() => buildAiProviderPresets(t), [t]);
	const activePresetId = matchingPresetId(presets, settings);

	// Best-effort local-runner detection is explicitly user-initiated: merely opening Settings must not
	// probe a loopback service. A connection refusal is the normal "not running" state.
	const detectOllama = async () => {
		setOllamaBusy(true);
		try {
			const response = await fetch(LOCAL_OLLAMA.healthUrl);
			if (!response.ok) throw new Error('bad status');
			const data = (await response.json()) as { models?: Array<{ name?: string }> };
			const models = (data.models ?? [])
				.map((model) => model.name)
				.filter((name): name is string => typeof name === 'string');
			setOllama({ status: 'running', models });
		} catch {
			setOllama({ status: 'down' });
		} finally {
			setOllamaBusy(false);
		}
	};

	const applyPreset = (preset: AiProviderPreset) => {
		if (hasKey) {
			Toaster.warning(t('settings.provider.forgetBeforeSwitch'));
			return;
		}
		patch({
			provider: preset.provider,
			baseUrl: preset.baseUrl,
			model: preset.model,
		});
	};
	const destination = resolveAiProviderDestination(settings);
	const destinationProviderLabel =
		destination?.provider === 'anthropic'
			? 'Anthropic'
			: t('settings.provider.openAiCompatibleProvider');

	const patch = (p: Partial<typeof settings>) => {
		const next = { ...settings, ...p };
		if (
			hasKey &&
			resolveAiProviderDestination(next)?.scope !== resolveAiProviderDestination(settings)?.scope
		) {
			Toaster.warning(t('settings.provider.forgetBeforeChange'));
			return;
		}
		setSettings(saveAiProviderSettings(p));
		onConfiguredChange();
	};
	const saveKey = async () => {
		if (keyDraft.trim() === '' || !destination) return;
		setKeyBusy(true);
		const result = await setAiProviderKey(keyDraft);
		setKeyBusy(false);
		if (!result.saved) {
			Toaster.error(t('settings.provider.keyTooLong', { max: MAX_API_KEY_CHARS }));
			return;
		}
		setSaveConfirmOpen(false);
		setKeyDraft('');
		setHasKey(true);
		if (result.storage === 'os-encrypted') {
			Toaster.success(t('settings.provider.keySavedDurable'));
		} else if (result.durableError) {
			Toaster.warning(t('settings.provider.keySavedNoDurable'));
		} else {
			Toaster.success(t('settings.provider.keySavedSession'));
		}
		onConfiguredChange();
	};
	const forgetKey = async () => {
		setKeyBusy(true);
		const result = await clearAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error(
				t(
					result.durableError
						? 'settings.provider.forgetDurableFailed'
						: 'settings.provider.forgetRaced',
				),
			);
			return;
		}
		setForgetConfirmOpen(false);
		setHasKey(false);
		Toaster.success(t('settings.provider.keyForgotten'));
		onConfiguredChange();
	};
	const forgetLegacyKey = async () => {
		setKeyBusy(true);
		const result = await clearLegacyAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error(t('settings.provider.legacyRemoveFailed'));
			return;
		}
		setLegacyConfirmOpen(false);
		setHasLegacyKey(false);
		Toaster.success(t('settings.provider.legacyRemoved'));
	};

	// Both confirmations name the provider, the origin and the API base inside one sentence, so each
	// formats the whole sentence and splits it around those values rather than freezing English word
	// order into fragments.
	const origin = destination?.origin ?? '';
	const scopeSentence = t('settings.provider.confirmBody', {
		provider: destinationProviderLabel,
		origin,
		base: destination?.baseUrl ?? '',
	});
	const [scopeBefore, scopeRest = ''] = scopeSentence.split(destinationProviderLabel);
	const [scopeMiddle, scopeRest2 = ''] = scopeRest.split(origin || '\u0000');
	const [scopeAfterOrigin, scopeEnd = ''] = scopeRest2.split(destination?.baseUrl || '\u0000');
	const forgetSentence = t('settings.provider.forgetBody', { origin });
	const [forgetBefore, forgetAfter = ''] = forgetSentence.split(origin || '\u0000');
	return (
		<Panel
			title={t('settings.provider.title')}
			action={
				<Badge status={configured ? 'success' : 'neutral'}>
					{t(configured ? 'settings.provider.configured' : 'settings.provider.notConfigured')}
				</Badge>
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				{t('settings.provider.intro')}
			</div>
			<div style={{ marginTop: 14 }}>
				<div style={{ font: `600 12px ${T.sans}`, color: T.ink, marginBottom: 8 }}>
					{t('settings.provider.connect')}
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
						gap: 10,
					}}
				>
					{presets.map((preset) => {
						const selected = activePresetId === preset.id;
						const isOllama = preset.id === 'ollama';
						const platformUnsupported = isOllama && !capabilities.allowHttpLoopbackAi;
						// These were hard-`disabled`, which removed them from the tab order and took their
						// `title` with them — so `applyPreset`'s "Forget the current key first" warning was
						// unreachable dead code and the card just went grey for no stated reason. Soft-disable
						// instead: still looks unavailable, but stays focusable and says why when pressed.
						// (Same trade the DS Button makes for `aria-disabled`.)
						const lockReasonKey: MessageKey | null = platformUnsupported
							? 'settings.provider.lockedPlatform'
							: hasKey && !selected
								? 'settings.provider.forgetBeforeSwitch'
								: null;
						const lockReason = lockReasonKey ? t(lockReasonKey) : null;
						const locked = lockReason !== null;
						return (
							<button
								key={preset.id}
								type="button"
								aria-disabled={locked || undefined}
								title={lockReason ?? undefined}
								onClick={() => {
									if (lockReason) {
										Toaster.warning(lockReason);
										return;
									}
									applyPreset(preset);
								}}
								style={{
									textAlign: 'left',
									padding: '11px 12px',
									borderRadius: 10,
									border: `1px solid ${selected ? T.accBd : T.bd}`,
									background: selected ? T.accSub : T.alt,
									cursor: locked ? 'not-allowed' : 'pointer',
									opacity: locked ? 0.55 : 1,
									display: 'flex',
									flexDirection: 'column',
									gap: 6,
								}}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
									<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>{preset.label}</span>
									{selected && <Badge status="success">{t('settings.provider.selected')}</Badge>}
									{platformUnsupported && (
										<Badge status="neutral">{t('settings.provider.desktopOnly')}</Badge>
									)}
									{isOllama && ollama.status !== 'unknown' && (
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
										margin: 0,
										paddingLeft: 16,
										font: `11px/1.5 ${T.sans}`,
										color: T.ter,
									}}
								>
									{preset.steps.map((step, i) => (
										<li key={i}>{step}</li>
									))}
								</ol>
								{(platformUnsupported || preset.note) && (
									<div style={{ font: `10.5px ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
										{platformUnsupported ? LOCAL_OLLAMA.desktopOnlyNote : preset.note}
									</div>
								)}
								{isOllama &&
									ollama.status === 'running' &&
									!ollama.models.includes(preset.model) && (
										<div style={{ font: `10.5px ${T.mono}`, color: T.warn }}>
											{t('settings.provider.ollamaPull', { model: preset.model })}
										</div>
									)}
							</button>
						);
					})}
				</div>
				{activePresetId === 'ollama' && capabilities.allowHttpLoopbackAi && (
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
						<Button
							variant="secondary"
							size="sm"
							disabled={ollamaBusy}
							onClick={() => void detectOllama()}
						>
							{ollamaBusy ? t('settings.provider.checking') : t('settings.provider.checkOllama')}
						</Button>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							{t('settings.provider.detectionNote')}
						</span>
					</div>
				)}
			</div>
			{hasLegacyKey && (
				<div
					style={{
						marginTop: 12,
						padding: '10px 12px',
						borderRadius: 8,
						border: `1px solid ${T.warn}`,
						background: `color-mix(in srgb, ${T.warn} 10%, transparent)`,
						font: `12px/1.55 ${T.sans}`,
						color: T.sub,
					}}
				>
					{t('settings.provider.legacyFound')}{' '}
					<Button
						variant="ghost"
						size="sm"
						disabled={keyBusy}
						onClick={() => setLegacyConfirmOpen(true)}
					>
						{t('settings.provider.removeOlder')}
					</Button>
				</div>
			)}
			<SetRow
				label={t('settings.provider.providerRow')}
				help={t('settings.provider.providerHelp')}
				control={
					<Seg
						value={settings.provider}
						ariaLabel={t('settings.provider.providerAria')}
						onChange={(v) => {
							const provider = v as AiProviderKind;
							patch({
								provider,
								model: provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : settings.model,
							});
						}}
						options={[
							{ value: 'anthropic', label: 'Anthropic', disabled: hasKey },
							{
								value: 'openai-compatible',
								label: t('settings.provider.openAiCompatible'),
								disabled: hasKey,
							},
						]}
					/>
				}
			/>
			<SetRow
				label={t('settings.provider.modelRow')}
				help={
					settings.provider === 'anthropic'
						? t('settings.provider.modelHelpAnthropic', { model: DEFAULT_ANTHROPIC_MODEL })
						: t('settings.provider.modelHelp')
				}
				control={
					<span style={{ flex: '0 0 240px' }}>
						<Input
							value={settings.model}
							maxLength={MAX_MODEL_CHARS}
							aria-label={t('settings.provider.modelAria')}
							onChange={(e: { target: { value: string } }) => patch({ model: e.target.value })}
						/>
					</span>
				}
			/>
			{settings.provider === 'openai-compatible' && (
				<SetRow
					label={t('settings.provider.baseUrlRow')}
					help={t(hasKey ? 'settings.provider.baseUrlLocked' : 'settings.provider.baseUrlHelp')}
					control={
						<span style={{ flex: '0 0 300px' }}>
							<Input
								value={settings.baseUrl}
								maxLength={MAX_BASE_URL_CHARS}
								disabled={hasKey}
								aria-label={t('settings.provider.baseUrlAria')}
								placeholder={t('settings.provider.baseUrlPlaceholder')}
								onChange={(e: { target: { value: string } }) => patch({ baseUrl: e.target.value })}
							/>
						</span>
					}
				/>
			)}
			<SetRow
				label={t('settings.provider.destinationRow')}
				help={t('settings.provider.destinationHelp')}
				control={
					<span
						style={{
							display: 'block',
							maxWidth: 360,
							wordBreak: 'break-word',
							font: `12px/1.5 ${T.mono}`,
							color: destination ? T.ink : T.err,
						}}
					>
						{destination ? destination.baseUrl : t('settings.provider.destinationMissing')}
					</span>
				}
			/>
			<SetRow
				label={t('settings.provider.keyRow')}
				help={t(hasKey ? 'settings.provider.keyHelpStored' : 'settings.provider.keyHelp')}
				control={
					<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
						<span style={{ flex: '1 1 220px', minWidth: 180 }}>
							<Input
								type="password"
								maxLength={MAX_API_KEY_CHARS}
								value={keyDraft}
								aria-label={t('settings.provider.keyAria')}
								placeholder={hasKey ? t('settings.provider.keyStoredPlaceholder') : 'sk-…'}
								onChange={(e: { target: { value: string } }) => setKeyDraft(e.target.value)}
							/>
						</span>
						<Button
							variant="primary"
							size="sm"
							icon="check"
							disabled={keyBusy || keyDraft.trim() === '' || !destination}
							onClick={() => setSaveConfirmOpen(true)}
						>
							{keyBusy ? t('settings.provider.saving') : t('settings.provider.saveKey')}
						</Button>
						{hasKey && (
							<Button
								variant="ghost"
								size="sm"
								icon="trash"
								disabled={keyBusy}
								onClick={() => setForgetConfirmOpen(true)}
							>
								{t('settings.provider.forgetKey')}
							</Button>
						)}
					</span>
				}
			/>
			<Dialog
				open={saveConfirmOpen}
				onClose={() => !keyBusy && setSaveConfirmOpen(false)}
				title={t('settings.provider.confirmTitle')}
				description={t('settings.provider.confirmDescription')}
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setSaveConfirmOpen(false)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={keyBusy || !destination}
							onClick={() => void saveKey()}
						>
							{keyBusy ? t('settings.provider.saving') : t('settings.provider.confirmSave')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{scopeBefore}
					<strong style={{ color: T.ink }}>{destinationProviderLabel}</strong>
					{scopeMiddle}
					<strong style={{ color: T.ink, wordBreak: 'break-word' }}>{destination?.origin}</strong>
					{scopeAfterOrigin}
					<span style={{ fontFamily: T.mono }}>{destination?.baseUrl}</span>
					{scopeEnd}
				</div>
			</Dialog>
			<Dialog
				open={forgetConfirmOpen}
				onClose={() => !keyBusy && setForgetConfirmOpen(false)}
				title={t('settings.provider.forgetTitle')}
				description={t('settings.provider.forgetDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setForgetConfirmOpen(false)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button variant="danger" size="sm" disabled={keyBusy} onClick={() => void forgetKey()}>
							{keyBusy ? t('settings.provider.forgetting') : t('settings.provider.forgetKey')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{forgetBefore}
					<strong style={{ color: T.ink }}>{destination?.origin}</strong>
					{forgetAfter}
				</div>
			</Dialog>
			<Dialog
				open={legacyConfirmOpen}
				onClose={() => !keyBusy && setLegacyConfirmOpen(false)}
				title={t('settings.provider.legacyTitle')}
				description={t('settings.provider.legacyDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setLegacyConfirmOpen(false)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={keyBusy}
							onClick={() => void forgetLegacyKey()}
						>
							{keyBusy ? t('settings.provider.removing') : t('settings.provider.removeOlder')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.provider.legacyBody')}
				</div>
			</Dialog>
		</Panel>
	);
}
