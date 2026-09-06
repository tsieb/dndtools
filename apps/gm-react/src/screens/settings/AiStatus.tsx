import { useState } from 'react';
import { Badge, Chip, Input, Select, Toaster } from '../../ds';
import { Panel, SetRow, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import {
	AI_BACKEND_IDS,
	MAX_MODEL_CHARS,
	describeAiBackend,
	getAiLocalBackendSettings,
	getAiTaskRouting,
	routeAiTask,
	saveAiLocalBackendSettings,
	saveAiTaskRouting,
	type AiBackendId,
	type AiBackendStatus,
	type AiRouteUnavailableReason,
	type AiTaskRoute,
} from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
/* ---- AI model routing (RC-AI-3.1) — the status card for the backends the assistant can reach and
 * the per-task choice of which one serves which job. Reads and writes only device-local settings in
 * src/ai/providerConfig.ts: no Core command, no credential, nothing that syncs. Every unavailable
 * state names its own reason, so a job that will not run says why before it is asked to. ---------- */

const BACKEND_LABEL: Record<AiBackendId, MessageKey> = {
	provider: 'settings.router.backend.provider',
	local: 'settings.router.backend.local',
};

const REASON_LABEL: Record<AiRouteUnavailableReason, MessageKey> = {
	'consent-off': 'settings.router.reason.consentOff',
	'platform-unsupported': 'settings.router.reason.platformUnsupported',
	'incomplete-settings': 'settings.router.reason.incompleteSettings',
	'no-key': 'settings.router.reason.noKey',
	'task-off': 'settings.router.reason.taskOff',
	'capability-missing': 'settings.router.reason.capabilityMissing',
};

/** One backend: what it is, where it sends, what it can do, and whether it is usable now. */
function BackendRow({ status, first }: { status: AiBackendStatus; first: boolean }) {
	const { t, formatNumber } = useI18n();
	const { capabilities } = status;
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 10,
				padding: '11px 0',
				borderTop: first ? 'none' : `1px solid ${T.bd}`,
				flexWrap: 'wrap',
			}}
		>
			<div style={{ flex: '1 1 220px', minWidth: 0 }}>
				<div style={{ font: `600 13px ${T.sans}` }}>{t(BACKEND_LABEL[status.id])}</div>
				<div style={{ font: `11.5px ${T.mono}`, color: T.ter, wordBreak: 'break-word' }}>
					{status.destination ? `${status.destination.baseUrl} · ${status.model}` : status.model}
				</div>
				{!status.available && status.reason && (
					<div style={{ font: `11.5px/1.5 ${T.sans}`, color: T.ter, marginTop: 3 }}>
						{t(REASON_LABEL[status.reason])}
					</div>
				)}
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
					{capabilities.generation && (
						<Chip tone="neutral">{t('settings.router.capability.generation')}</Chip>
					)}
					<Chip tone="neutral">
						{t(
							capabilities.embeddings
								? 'settings.router.capability.embeddings'
								: 'settings.router.capability.noEmbeddings',
						)}
					</Chip>
					<Chip tone="neutral">
						{capabilities.contextTokens === null
							? t('settings.router.capability.contextUndeclared')
							: t('settings.router.capability.context', {
									tokens: formatNumber(capabilities.contextTokens),
								})}
					</Chip>
				</div>
			</div>
			<Badge status={status.available ? 'success' : 'neutral'}>
				{t(status.available ? 'settings.router.ready' : 'settings.router.notReady')}
			</Badge>
		</div>
	);
}

/** Model routing — which backend serves which job, and what each backend can do. */
export function AiRouterPanel({ onRoutingChange }: { onRoutingChange?: () => void }) {
	const { t } = useI18n();
	// The router reads device-local storage, not React state, so the card re-reads on every change
	// it makes (and on the provider panel's saves, which re-render this whole screen).
	const [, bump] = useState(0);
	const [localModel, setLocalModel] = useState(() => getAiLocalBackendSettings().model);
	const routing = getAiTaskRouting();
	const backends = AI_BACKEND_IDS.map(describeAiBackend);
	const localSupported = backends.find((b) => b.id === 'local')?.reason !== 'platform-unsupported';
	const embeddingsRoute = routeAiTask('embeddings');
	const embeddingsState = embeddingsRoute.available
		? t('settings.router.embeddingsReady', {
				backend: t(BACKEND_LABEL[embeddingsRoute.backendId]),
			})
		: t(REASON_LABEL[embeddingsRoute.reason]);

	const setAssistantRoute = (route: AiTaskRoute) => {
		saveAiTaskRouting({ assistant: route });
		bump((v) => v + 1);
		onRoutingChange?.();
		Toaster.success(
			route === 'off'
				? t('settings.router.routeSavedOff')
				: t('settings.router.routeSaved', { backend: t(BACKEND_LABEL[route]) }),
		);
	};

	const commitLocalModel = () => {
		const saved = saveAiLocalBackendSettings({ model: localModel });
		setLocalModel(saved.model);
		bump((v) => v + 1);
		onRoutingChange?.();
		Toaster.success(t('settings.router.localModelSaved', { model: saved.model }));
	};

	return (
		<Panel title={t('settings.router.title')}>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>{t('settings.router.intro')}</div>
			<div
				style={{
					font: `600 11px ${T.sans}`,
					letterSpacing: '.08em',
					textTransform: 'uppercase',
					color: T.ter,
					margin: '14px 0 2px',
				}}
			>
				{t('settings.router.backendsHeading')}
			</div>
			{backends.map((status, i) => (
				<BackendRow key={status.id} status={status} first={i === 0} />
			))}
			{localSupported && (
				<SetRow
					label={t('settings.router.modelRow')}
					help={t('settings.router.modelHelp', { model: LOCAL_OLLAMA.defaultModel })}
					control={
						<span style={{ flex: '0 0 240px' }}>
							<Input
								value={localModel}
								maxLength={MAX_MODEL_CHARS}
								aria-label={t('settings.router.modelAria')}
								onChange={(e: { target: { value: string } }) => setLocalModel(e.target.value)}
								onBlur={commitLocalModel}
							/>
						</span>
					}
				/>
			)}
			<SetRow
				label={t('settings.router.assistantRow')}
				help={t('settings.router.assistantHelp')}
				control={
					<span style={{ flex: '0 0 200px' }}>
						<Select
							aria-label={t('settings.router.assistantAria')}
							value={routing.assistant}
							onChange={(e: { target: { value: string } }) =>
								setAssistantRoute(e.target.value as AiTaskRoute)
							}
							options={[
								...AI_BACKEND_IDS.map((id) => ({ value: id, label: t(BACKEND_LABEL[id]) })),
								{ value: 'off', label: t('settings.router.routeOff') },
							]}
						/>
					</span>
				}
			/>
			<SetRow
				label={t('settings.router.embeddingsRow')}
				help={t('settings.router.embeddingsHelp')}
				control={
					<span style={{ font: `12px/1.5 ${T.sans}`, color: T.ter, maxWidth: 260 }}>
						{embeddingsState}
					</span>
				}
			/>
		</Panel>
	);
}
