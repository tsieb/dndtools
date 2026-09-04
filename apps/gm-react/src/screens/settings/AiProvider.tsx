import { useState } from 'react';
import { Badge, Button, Dialog, Input, Toaster } from '../../ds';
import { Panel, Seg, SetRow, T } from '../../app/screen-kit';
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
import { AI_PROVIDER_PRESETS, type AiProviderPreset } from './AiPresets';
/* ---- AI provider setup (ADR-021 — the BYO-key transport half of the AI & tools subpage) ---------- */
/** Which preset the current settings match (for the "selected" chip). Anthropic matches by kind. */
function matchingPresetId(settings: AiProviderSettings): string | null {
	for (const preset of AI_PROVIDER_PRESETS) {
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
	const activePresetId = matchingPresetId(settings);

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
			Toaster.warning('Forget the current key before switching providers.');
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
		destination?.provider === 'anthropic' ? 'Anthropic' : 'the OpenAI-compatible provider';

	const patch = (p: Partial<typeof settings>) => {
		const next = { ...settings, ...p };
		if (
			hasKey &&
			resolveAiProviderDestination(next)?.scope !== resolveAiProviderDestination(settings)?.scope
		) {
			Toaster.warning('Forget the current key before changing its provider or destination.');
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
			Toaster.error(
				`That API key is too long. The limit is ${MAX_API_KEY_CHARS.toLocaleString()} characters.`,
			);
			return;
		}
		setSaveConfirmOpen(false);
		setKeyDraft('');
		setHasKey(true);
		if (result.storage === 'os-encrypted') {
			Toaster.success('API key saved in OS-encrypted storage.');
		} else if (result.durableError) {
			Toaster.warning('Saved for this session, but OS-encrypted storage is unavailable.');
		} else {
			Toaster.success('API key saved for this browser session.');
		}
		onConfiguredChange();
	};
	const forgetKey = async () => {
		setKeyBusy(true);
		const result = await clearAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error(
				result.durableError
					? 'Could not remove the key from OS-encrypted storage. It remains available in this session.'
					: 'The key changed before it could be forgotten. Try again.',
			);
			return;
		}
		setForgetConfirmOpen(false);
		setHasKey(false);
		Toaster.success('API key forgotten.');
		onConfiguredChange();
	};
	const forgetLegacyKey = async () => {
		setKeyBusy(true);
		const result = await clearLegacyAiProviderKey();
		setKeyBusy(false);
		if (!result.cleared) {
			Toaster.error('Could not remove the older key from OS-encrypted storage. Try again.');
			return;
		}
		setLegacyConfirmOpen(false);
		setHasLegacyKey(false);
		Toaster.success('Older unassigned key removed.');
	};

	return (
		<Panel
			title="AI provider"
			action={
				<Badge status={configured ? 'success' : 'neutral'}>
					{configured ? 'Configured' : 'Not configured'}
				</Badge>
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				Bring your own key — Lamplight does not include one or send it through our servers. The key
				stays on this device (memory + this browser session; OS-encrypted storage in native apps)
				and is never written to the campaign, its history, or cloud backups. Until a key is saved,
				the assistant stays off.
			</div>
			<div style={{ marginTop: 14 }}>
				<div style={{ font: `600 12px ${T.sans}`, color: T.ink, marginBottom: 8 }}>
					Connect a provider
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
						gap: 10,
					}}
				>
					{AI_PROVIDER_PRESETS.map((preset) => {
						const selected = activePresetId === preset.id;
						const isOllama = preset.id === 'ollama';
						const platformUnsupported = isOllama && !capabilities.allowHttpLoopbackAi;
						// These were hard-`disabled`, which removed them from the tab order and took their
						// `title` with them — so `applyPreset`'s "Forget the current key first" warning was
						// unreachable dead code and the card just went grey for no stated reason. Soft-disable
						// instead: still looks unavailable, but stays focusable and says why when pressed.
						// (Same trade the DS Button makes for `aria-disabled`.)
						const lockReason = platformUnsupported
							? 'Local model runners need the desktop app — this platform blocks loopback requests.'
							: hasKey && !selected
								? 'Forget the current key before switching providers.'
								: null;
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
									{selected && <Badge status="success">selected</Badge>}
									{platformUnsupported && <Badge status="neutral">desktop-only</Badge>}
									{isOllama && ollama.status !== 'unknown' && (
										<Badge status={ollama.status === 'running' ? 'success' : 'neutral'}>
											{ollama.status === 'running'
												? `detected · ${ollama.models.length}`
												: 'not running'}
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
											Run: ollama pull {preset.model}
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
							{ollamaBusy ? 'Checking…' : 'Check for local Ollama'}
						</Button>
						<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
							Detection contacts only http://localhost:11434 after you choose to check.
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
					An older key without a verified destination was found. For safety, it is not active and
					will never be sent automatically. Check the destination below and re-enter the key if you
					still want to use it.{' '}
					<Button
						variant="ghost"
						size="sm"
						disabled={keyBusy}
						onClick={() => setLegacyConfirmOpen(true)}
					>
						Remove older copy
					</Button>
				</div>
			)}
			<SetRow
				label="Provider"
				help="Anthropic's API directly, or any OpenAI-compatible endpoint (local runner, proxy, other vendor)."
				control={
					<Seg
						value={settings.provider}
						ariaLabel="AI provider"
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
								label: 'OpenAI-compatible',
								disabled: hasKey,
							},
						]}
					/>
				}
			/>
			<SetRow
				label="Model"
				help={
					settings.provider === 'anthropic'
						? `Defaults to ${DEFAULT_ANTHROPIC_MODEL}.`
						: 'The model id the endpoint expects.'
				}
				control={
					<span style={{ flex: '0 0 240px' }}>
						<Input
							value={settings.model}
							maxLength={MAX_MODEL_CHARS}
							aria-label="Model id"
							onChange={(e: { target: { value: string } }) => patch({ model: e.target.value })}
						/>
					</span>
				}
			/>
			{settings.provider === 'openai-compatible' && (
				<SetRow
					label="Base URL"
					help={
						hasKey
							? 'Forget the current key before changing this destination.'
							: 'The API base, e.g. https://api.example.com/v1 — /chat/completions is appended.'
					}
					control={
						<span style={{ flex: '0 0 300px' }}>
							<Input
								value={settings.baseUrl}
								maxLength={MAX_BASE_URL_CHARS}
								disabled={hasKey}
								aria-label="API base URL"
								placeholder="https://api.example.com/v1"
								onChange={(e: { target: { value: string } }) => patch({ baseUrl: e.target.value })}
							/>
						</span>
					}
				/>
			)}
			<SetRow
				label="Credential destination"
				help="Your key is bound to this provider and receiving origin. It cannot be reused after the provider or host changes."
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
						{destination ? destination.baseUrl : 'Enter a valid API base URL'}
					</span>
				}
			/>
			<SetRow
				label="API key"
				help={
					hasKey
						? 'A key is stored on this device. Paste a new one to replace it.'
						: 'Paste your provider API key to turn the assistant on.'
				}
				control={
					<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
						<span style={{ flex: '1 1 220px', minWidth: 180 }}>
							<Input
								type="password"
								maxLength={MAX_API_KEY_CHARS}
								value={keyDraft}
								aria-label="Provider API key"
								placeholder={hasKey ? '••••••••  (stored)' : 'sk-…'}
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
							{keyBusy ? 'Saving…' : 'Save key'}
						</Button>
						{hasKey && (
							<Button
								variant="ghost"
								size="sm"
								icon="trash"
								disabled={keyBusy}
								onClick={() => setForgetConfirmOpen(true)}
							>
								Forget key
							</Button>
						)}
					</span>
				}
			/>
			<Dialog
				open={saveConfirmOpen}
				onClose={() => !keyBusy && setSaveConfirmOpen(false)}
				title="Confirm credential destination"
				description="Check where this provider key will be sent before saving it."
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={keyBusy}
							onClick={() => setSaveConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={keyBusy || !destination}
							onClick={() => void saveKey()}
						>
							{keyBusy ? 'Saving…' : 'Confirm and save'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This key will be available only to{' '}
					<strong style={{ color: T.ink }}>{destinationProviderLabel}</strong> at{' '}
					<strong style={{ color: T.ink, wordBreak: 'break-word' }}>{destination?.origin}</strong>.
					Requests use the API base{' '}
					<span style={{ fontFamily: T.mono }}>{destination?.baseUrl}</span>.
				</div>
			</Dialog>
			<Dialog
				open={forgetConfirmOpen}
				onClose={() => !keyBusy && setForgetConfirmOpen(false)}
				title="Forget this provider key?"
				description="The assistant will stay off until you confirm a destination and enter a key again."
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
							Cancel
						</Button>
						<Button variant="danger" size="sm" disabled={keyBusy} onClick={() => void forgetKey()}>
							{keyBusy ? 'Forgetting…' : 'Forget key'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This removes the key scoped to{' '}
					<strong style={{ color: T.ink }}>{destination?.origin}</strong> from this session and,
					when available, OS-encrypted storage.
				</div>
			</Dialog>
			<Dialog
				open={legacyConfirmOpen}
				onClose={() => !keyBusy && setLegacyConfirmOpen(false)}
				title="Remove the older unassigned key?"
				description="It is already inactive and will not be migrated automatically."
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
							Cancel
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={keyBusy}
							onClick={() => void forgetLegacyKey()}
						>
							{keyBusy ? 'Removing…' : 'Remove older copy'}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					This permanently removes the unassigned key. Re-enter it above only after confirming the
					receiving provider and address.
				</div>
			</Dialog>
		</Panel>
	);
}
