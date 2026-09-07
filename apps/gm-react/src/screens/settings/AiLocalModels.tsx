import { useState } from 'react';
import { Badge, Button, Chip, Dialog, Input, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { usePlatformCapabilities } from '../../platform/capabilities';
import { MAX_MODEL_CHARS } from '../../ai/providerConfig';
import { LOCAL_OLLAMA } from '../../ai/localLlmGuidance';
import {
	deleteOllamaModel,
	formatModelSize,
	listOllamaModels,
	pullOllamaModel,
	type OllamaModel,
	type OllamaPullProgress,
} from '../../ai/ollamaDaemon';
import { errMsg } from './shared';
/* ---- Settings › AI & tools › Local models (RC-AI-3.3) — desktop-only management of the models
 * pulled onto the same Ollama daemon the router's local backend (RC-AI-3.1) and embeddings
 * (RC-AI-3.2) already speak to (`LOCAL_OLLAMA`). Purely device-local: no Core command, no
 * credential, nothing that syncs (same boundary as AiStatus.tsx). Listing is an explicit Refresh
 * click, never automatic on mount — opening Settings must not probe a loopback service on its own,
 * the same rule AiProvider.tsx's Ollama detection follows. ------------------------------------- */

type ListState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'loaded'; models: OllamaModel[] }
	| { status: 'error'; message: string };

/** Local models management — desktop only; other platforms see why instead of a dead panel. */
export function AiLocalModelsPanel() {
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const desktopOnly = capabilities.runtimeKind !== 'electron';
	const [list, setList] = useState<ListState>({ status: 'idle' });
	const [pullName, setPullName] = useState('');
	const [pulling, setPulling] = useState<OllamaPullProgress | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [busyDelete, setBusyDelete] = useState(false);

	if (desktopOnly) {
		return (
			<Panel title={t('settings.localModels.title')}>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.ter }}>
					{LOCAL_OLLAMA.desktopOnlyNote}
				</div>
			</Panel>
		);
	}

	const refresh = async () => {
		setList({ status: 'loading' });
		try {
			const models = await listOllamaModels();
			setList({ status: 'loaded', models });
		} catch (e) {
			setList({ status: 'error', message: errMsg(e, t('settings.localModels.listFailed')) });
		}
	};

	const pull = async () => {
		const model = pullName.trim();
		if (!model) return;
		setPulling({ status: t('settings.localModels.pullStarting'), percent: null });
		try {
			await pullOllamaModel(model, setPulling);
			Toaster.success(t('settings.localModels.pulled', { model }));
			setPullName('');
			await refresh();
		} catch (e) {
			Toaster.error(errMsg(e, t('settings.localModels.pullFailed', { model })));
		} finally {
			setPulling(null);
		}
	};

	const confirmDelete = async () => {
		const model = deleteTarget;
		if (!model) return;
		setBusyDelete(true);
		try {
			await deleteOllamaModel(model);
			Toaster.success(t('settings.localModels.deleted', { model }));
			setDeleteTarget(null);
			await refresh();
		} catch (e) {
			Toaster.error(errMsg(e, t('settings.localModels.deleteFailed', { model })));
		} finally {
			setBusyDelete(false);
		}
	};

	const totalBytes =
		list.status === 'loaded' ? list.models.reduce((sum, m) => sum + m.sizeBytes, 0) : 0;

	return (
		<Panel
			title={t('settings.localModels.title')}
			action={
				list.status === 'loaded' && list.models.length > 0 ? (
					<Badge status="neutral">
						{t('settings.localModels.diskTotal', { size: formatModelSize(totalBytes) })}
					</Badge>
				) : null
			}
		>
			<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
				{t('settings.localModels.intro')}
			</div>
			<div
				style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
			>
				<Button
					variant="secondary"
					size="sm"
					icon="retry"
					disabled={list.status === 'loading'}
					onClick={() => void refresh()}
				>
					{list.status === 'loading'
						? t('settings.localModels.refreshing')
						: t('settings.localModels.refresh')}
				</Button>
				{list.status === 'idle' && (
					<span style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
						{t('settings.localModels.refreshHint')}
					</span>
				)}
			</div>
			{list.status === 'error' && (
				<div style={{ marginTop: 10, font: `12px/1.5 ${T.sans}`, color: T.err }}>
					{list.message}
				</div>
			)}
			{list.status === 'loaded' && (
				<div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
					{list.models.length === 0 ? (
						<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
							{t('settings.localModels.empty')}
						</div>
					) : (
						list.models.map((model, i) => (
							<div
								key={model.name}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '9px 0',
									borderTop: i ? `1px solid ${T.bd}` : 'none',
									flexWrap: 'wrap',
								}}
							>
								<div style={{ flex: '1 1 200px', minWidth: 0 }}>
									<div style={{ font: `600 12.5px ${T.mono}`, wordBreak: 'break-word' }}>
										{model.name}
									</div>
									<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
										{formatModelSize(model.sizeBytes)}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									icon="trash"
									disabled={busyDelete}
									onClick={() => setDeleteTarget(model.name)}
								>
									{t('common.action.remove')}
								</Button>
							</div>
						))
					)}
				</div>
			)}
			<div
				style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
			>
				<span style={{ flex: '1 1 220px', minWidth: 160 }}>
					<Input
						value={pullName}
						maxLength={MAX_MODEL_CHARS}
						placeholder={t('settings.localModels.pullPlaceholder', {
							model: LOCAL_OLLAMA.defaultModel,
						})}
						aria-label={t('settings.localModels.pullAria')}
						disabled={pulling !== null}
						onChange={(e: { target: { value: string } }) => setPullName(e.target.value)}
					/>
				</span>
				<Button
					variant="primary"
					size="sm"
					icon="download"
					disabled={pulling !== null || pullName.trim() === ''}
					onClick={() => void pull()}
				>
					{pulling !== null ? t('settings.localModels.pulling') : t('settings.localModels.pull')}
				</Button>
			</div>
			{pulling && (
				<div style={{ marginTop: 8 }}>
					<Chip tone="neutral">
						{pulling.percent === null
							? pulling.status || t('settings.localModels.pullStarting')
							: t('settings.localModels.pullProgress', {
									status: pulling.status,
									percent: pulling.percent,
								})}
					</Chip>
				</div>
			)}
			<Dialog
				open={deleteTarget !== null}
				onClose={() => !busyDelete && setDeleteTarget(null)}
				title={t('settings.localModels.deleteTitle')}
				description={t('settings.localModels.deleteDescription')}
				tone="danger"
				size="sm"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={busyDelete}
							onClick={() => setDeleteTarget(null)}
						>
							{t('common.action.cancel')}
						</Button>
						<Button
							variant="danger"
							size="sm"
							disabled={busyDelete}
							onClick={() => void confirmDelete()}
						>
							{busyDelete ? t('settings.localModels.deleting') : t('common.action.remove')}
						</Button>
					</>
				}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('settings.localModels.deleteBody', { model: deleteTarget ?? '' })}
				</div>
			</Dialog>
		</Panel>
	);
}
