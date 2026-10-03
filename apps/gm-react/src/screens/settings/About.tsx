import { SettingsSection } from './Experience';
import { useEffect, useState } from 'react';
import {
	exportSupportBundle,
	getDmDiagnostics,
	type DiagnosticsContextInput,
	type ErrorTaxonomyCategory,
	type StorageCategory,
} from '@dndtools/core';
import { Badge, Button, DataTable, Stat, Toaster } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n, type MessageKey } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { downloadJsonFile, fileDateStamp } from '../../platform/download';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { isOnline } from '../../platform/preferences';
import { getErrorLog, installErrorLogListeners } from '../../diagnostics/errorLog';
import { collectStorageUsage } from '../../diagnostics/storageUsage';
import { collectPerfMarks } from '../../diagnostics/perfMarks';
import pkg from '../../../package.json';
import { AppUpdatesPanel } from './AppUpdates';
import { errMsg, formatBytes } from './shared';
import { LegalLinks } from '../legal/LegalLinks';

/* ---- About / Diagnostics (RC-ENG-6.1 — REAL core diagnostics view, wired to the DM/admin
 * `getDmDiagnostics`/`exportSupportBundle` queries in `@dndtools/core`). The screen assembles a
 * `DiagnosticsContextInput` from what the platform actually knows (sync op-log, the browser's
 * Performance/Storage APIs, an in-memory error log) and hands it to the core, which decides health,
 * taxonomy counts, and what an exported bundle may carry. A non-DM/non-grant actor sees the same
 * honest denial the core returns — never a fake diagnostics view. */

const HEALTH_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
	healthy: 'success',
	degraded: 'warning',
	unhealthy: 'danger',
};

const ERROR_CATEGORY_LABEL: Record<ErrorTaxonomyCategory, MessageKey> = {
	network: 'settings.about.errorCategory.network',
	sync: 'settings.about.errorCategory.sync',
	storage: 'settings.about.errorCategory.storage',
	permission: 'settings.about.errorCategory.permission',
	validation: 'settings.about.errorCategory.validation',
	render: 'settings.about.errorCategory.render',
	unknown: 'settings.about.errorCategory.unknown',
};

const STORAGE_CATEGORY_LABEL: Record<StorageCategory, MessageKey> = {
	vault: 'settings.about.storageCategory.vault',
	cache: 'settings.about.storageCategory.cache',
	assets: 'settings.about.storageCategory.assets',
	'sync-queue': 'settings.about.storageCategory.syncQueue',
	other: 'settings.about.storageCategory.other',
};

/** The public Privacy Policy / Terms links — shown to every actor, DM or not. */
function LegalPanel() {
	const { t } = useI18n();
	return (
		<SettingsSection gateKey="settings.about.legal">
			<Panel title={t('settings.about.legal')}>
				<div
					style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub, marginBottom: T.space.two }}
				>
					{t('settings.about.legalBody')}
				</div>
				<LegalLinks style={{ font: `var(--text-sm) ${T.sans}` }} />
			</Panel>
		</SettingsSection>
	);
}

export function SettingsAbout() {
	const { t, formatDate } = useI18n();
	const runtime = useRuntime();
	const [storageUsage, setStorageUsage] = useState<DiagnosticsContextInput['storageUsage']>([]);
	const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());

	useEffect(() => {
		installErrorLogListeners();
	}, []);
	useEffect(() => {
		let cancelled = false;
		void collectStorageUsage().then((entries) => {
			if (!cancelled) setStorageUsage(entries);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const actorId = runtime.defaultActorId;
	const ops = runtime.state.sync.operations;
	const lastOpAt = ops.length > 0 ? (ops[ops.length - 1]?.issuedAt ?? null) : null;

	const context: DiagnosticsContextInput = {
		appVersion: pkg.version,
		platformProfileId: widgetProfileForRuntime(),
		generatedAt,
		online: isOnline(),
		syncSources: [
			{
				sourceId: 'local-vault',
				kind: 'local-vault',
				displayName: t('settings.about.localVault'),
				state: 'connected',
				detail: null,
				pendingOperations: ops.length,
				lastSyncedAt: lastOpAt,
			},
		],
		capabilities: [],
		schema: [],
		environment: {},
		errorLog: getErrorLog(),
		storageUsage,
		perfMarks: collectPerfMarks(),
	};

	const diagnostics = getDmDiagnostics(runtime.state.permissions, context, actorId);

	if (diagnostics.kind !== 'available') {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
				<SettingsSection gateKey="settings.about.title">
					<Panel title={t('settings.about.title')}>
						<div style={{ font: `var(--text-sm)/1.6 ${T.sans}`, color: T.sub }}>
							{t('settings.about.denied')}
						</div>
					</Panel>
				</SettingsSection>
				{/* Keeping the app current is not a DM-only concern — a player on this desktop install
				    still needs to be able to update it. */}
				<SettingsSection gateKey="settings.updates.title">
					<AppUpdatesPanel />
				</SettingsSection>
				<LegalPanel />
			</div>
		);
	}

	const exportBundle = async () => {
		setGeneratedAt(new Date().toISOString());
		const bundle = exportSupportBundle(runtime.state.permissions, context, actorId, {
			includeSecrets: false,
		});
		if (bundle.kind !== 'bundle') {
			Toaster.error(t('settings.about.exportFailed'));
			return;
		}
		try {
			const result = await downloadJsonFile(
				`diagnostics-bundle-${fileDateStamp()}.json`,
				bundle,
				t('settings.about.exportFileTitle'),
			);
			if (result.status === 'exported') Toaster.success(t('settings.about.exported'));
		} catch (e: unknown) {
			Toaster.error(errMsg(e, t('settings.about.exportFailed')));
		}
	};

	const errorRows = (Object.keys(diagnostics.errorTaxonomy) as ErrorTaxonomyCategory[])
		.map((category) => ({ category, count: diagnostics.errorTaxonomy[category] }))
		.filter((row) => row.count > 0);

	const perfRows = diagnostics.perfMarks.map((mark, i) => ({
		key: `${mark.metricId}-${i}`,
		metricId: mark.metricId,
		value: mark.value,
	}));

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: T.space.four }}>
			<SettingsSection gateKey="settings.updates.title">
				<AppUpdatesPanel />
			</SettingsSection>

			<SettingsSection gateKey="settings.about.title">
				<Panel
					title={t('settings.about.title')}
					action={
						<Badge status={HEALTH_TONE[diagnostics.health]}>
							{t(`settings.about.health.${diagnostics.health}` as MessageKey)}
						</Badge>
					}
				>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))',
							gap: T.space.three,
						}}
					>
						{[
							[t('settings.about.appVersion'), diagnostics.appVersion],
							[
								t('settings.about.platform'),
								t(`settings.about.platformName.${diagnostics.platformProfileId}` as MessageKey),
							],
							[
								t('settings.about.lastSync'),
								diagnostics.lastSyncAt
									? formatDate(new Date(diagnostics.lastSyncAt), {
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit',
										})
									: t('settings.about.never'),
							],
							[t('settings.about.storageTotal'), formatBytes(diagnostics.storageUsage.totalBytes)],
						].map(([label, value]) => (
							// The DS Stat figure is sized for a short number; a date or a platform name wrapped
							// to four lines at that size, so these values use the sub-heading step instead.
							<Stat
								key={label}
								// The DS label is tertiary text, 4.49:1 on parchment's raised surface; secondary
								// passes in every theme.
								label={<span style={{ color: T.sub }}>{label}</span>}
								value={
									<span style={{ fontSize: 'var(--text-lg)', overflowWrap: 'anywhere' }}>
										{value}
									</span>
								}
							/>
						))}
					</div>
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.about.storage">
				<Panel title={t('settings.about.storage')}>
					<DataTable
						ariaLabel={t('settings.about.storage')}
						columns={[
							{
								key: 'category',
								header: t('settings.about.colCategory'),
								strong: true,
								render: (c: StorageCategory) => t(STORAGE_CATEGORY_LABEL[c]),
							},
							{
								key: 'bytes',
								header: t('settings.about.colSize'),
								align: 'right',
								render: (b: number) => formatBytes(b),
							},
						]}
						rows={(Object.keys(diagnostics.storageUsage.byCategory) as StorageCategory[]).map(
							(category) => ({
								category,
								bytes: diagnostics.storageUsage.byCategory[category],
							}),
						)}
						rowKey={(r: { category: StorageCategory }) => r.category}
						empty={t('settings.about.noStorage')}
					/>
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.about.errors">
				<Panel title={t('settings.about.errors')}>
					<DataTable
						ariaLabel={t('settings.about.errors')}
						columns={[
							{
								key: 'category',
								header: t('settings.about.colCategory'),
								strong: true,
								render: (c: ErrorTaxonomyCategory) => t(ERROR_CATEGORY_LABEL[c]),
							},
							{ key: 'count', header: t('settings.about.colCount'), align: 'right' },
						]}
						rows={errorRows}
						rowKey={(r: { category: ErrorTaxonomyCategory }) => r.category}
						empty={t('settings.about.noErrors')}
					/>
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.about.perf">
				<Panel title={t('settings.about.perf')}>
					<DataTable
						ariaLabel={t('settings.about.perf')}
						columns={[
							{ key: 'metricId', header: t('settings.about.colMetric'), strong: true },
							{
								key: 'value',
								header: t('settings.about.colDuration'),
								align: 'right',
								render: (v: number) => `${v.toFixed(1)} ms`,
							},
						]}
						rows={perfRows}
						rowKey={(r: { key: string }) => r.key}
						empty={t('settings.about.noPerf')}
					/>
				</Panel>
			</SettingsSection>

			<SettingsSection gateKey="settings.about.export">
				<Panel title={t('settings.about.export')}>
					<div
						style={{
							font: `var(--text-sm)/1.6 ${T.sans}`,
							color: T.sub,
							marginBottom: T.space.two,
						}}
					>
						{t('settings.about.exportBody')}
					</div>
					<Button variant="secondary" size="sm" icon="download" onClick={() => void exportBundle()}>
						{t('settings.about.exportButton')}
					</Button>
				</Panel>
			</SettingsSection>

			<LegalPanel />
		</div>
	);
}
