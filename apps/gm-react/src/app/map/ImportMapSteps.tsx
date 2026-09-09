import { MAP_IMPORT_MAX_ASSET_BYTES } from '@dndtools/core';
import type { MapImportElementKind, MapImportPreview, MapScale } from '@dndtools/core';
import { Button, Field, Icon, SegmentedControl, Select } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { IMPORT_ELEMENT_KINDS, PanelLabel, SUPPORT_PILL, type PickedFile } from './importShared';

/**
 * RC-MAP-3.2 — the import wizard's source, preview, and result steps.
 *
 * These three shipped with the v1 wizard and are UNCHANGED in behaviour; they moved out of
 * `ImportMapDialog.tsx` so that file stays under the 600-line ceiling once v2 added the align /
 * scale / trace steps. The result step gained one thing: it now reports the calibration follow-ups
 * (grid, scale, traced walls) and any refusal among them, so a partly-applied import says so.
 */

export interface ImportResultSummary {
	assetId: string | null;
	deduped: boolean;
	dropped: number;
	byteError: string | null;
	followUpErrors: string[];
	gridApplied: boolean;
	scaleApplied: boolean;
	wallsApplied: number;
}

export function ImportSourcePanel({
	source,
	onSourceChange,
	nativeMimes,
	picked,
	onPickFile,
	readError,
	formats,
	formatId,
	onFormatIdChange,
	declared,
	onDeclaredChange,
	canAdvance,
	onCancel,
	onNext,
}: {
	source: 'native' | 'external';
	onSourceChange: (source: 'native' | 'external') => void;
	nativeMimes: string[];
	picked: PickedFile | null;
	onPickFile: (file: File | undefined) => void;
	readError: string | null;
	formats: string[];
	formatId: string;
	onFormatIdChange: (formatId: string) => void;
	declared: MapImportElementKind[];
	onDeclaredChange: (update: (current: MapImportElementKind[]) => MapImportElementKind[]) => void;
	canAdvance: boolean;
	onCancel: () => void;
	onNext: () => void;
}) {
	const { t } = useI18n();
	return (
		<>
			<SegmentedControl
				fullWidth
				ariaLabel={t('mapImport.sourceType')}
				value={source}
				onChange={(v: string) => onSourceChange(v as 'native' | 'external')}
				options={[
					{ value: 'native', label: t('mapImport.source.native') },
					{ value: 'external', label: t('mapImport.source.external') },
				]}
			/>
			{source === 'native' ? (
				<label
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 8,
						padding: '26px 16px',
						border: `1.5px dashed ${T.bdS}`,
						borderRadius: 11,
						background: T.sunken,
						cursor: 'pointer',
						textAlign: 'center',
					}}
				>
					<input
						type="file"
						accept={nativeMimes.join(',')}
						style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
						onChange={(e: { target: { files: FileList | null } }) =>
							onPickFile(e.target.files?.[0])
						}
					/>
					<Icon name="upload" size={26} color={T.ter} />
					{picked ? (
						<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
							<strong style={{ color: T.ink }}>{picked.file.name}</strong> ·{' '}
							{t('mapImport.kilobytes', { kb: (picked.bytes.length / 1024).toFixed(1) })}
						</span>
					) : (
						<span style={{ font: `13px ${T.sans}`, color: T.sub }}>{t('mapImport.choose')}</span>
					)}
					<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
						{t('mapImport.accepted', {
							mb: Math.round(MAP_IMPORT_MAX_ASSET_BYTES / (1024 * 1024)),
						})}
					</span>
					<span style={{ font: `11px/1.5 ${T.sans}`, color: T.ter }}>
						{t('mapImport.sizeNote', {
							mb: Math.round(MAP_IMPORT_MAX_ASSET_BYTES / (1024 * 1024)),
						})}
					</span>
					{readError && <span style={{ font: `12px ${T.sans}`, color: T.err }}>{readError}</span>}
				</label>
			) : (
				<>
					<Field label={t('mapImport.format')} help={t('mapImport.formatHelp')}>
						<Select
							value={formatId}
							options={formats.map((f) => ({ value: f, label: f }))}
							onChange={(e: { target: { value: string } }) => onFormatIdChange(e.target.value)}
						/>
					</Field>
					<div>
						<PanelLabel>{t('mapImport.elements')}</PanelLabel>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
							{IMPORT_ELEMENT_KINDS.map((k) => {
								const on = declared.includes(k);
								return (
									<label
										key={k}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											padding: '6px 8px',
											borderRadius: 8,
											border: `1px solid ${on ? T.accBd : T.bd}`,
											background: on ? T.accSub : 'transparent',
											cursor: 'pointer',
											font: `12px ${T.sans}`,
											color: on ? T.acc : T.sub,
										}}
									>
										<input
											type="checkbox"
											checked={on}
											onChange={() =>
												onDeclaredChange((d) => (on ? d.filter((x) => x !== k) : [...d, k]))
											}
											style={{ accentColor: 'var(--color-accent)' }}
										/>
										{k}
									</label>
								);
							})}
						</div>
						<div style={{ marginTop: 8, font: `11px/1.5 ${T.sans}`, color: T.ter }}>
							{t('mapImport.declareHint')}
						</div>
					</div>
				</>
			)}
			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t('common.action.cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon={source === 'native' ? 'chevron-right' : 'preview'}
					disabled={!canAdvance}
					onClick={onNext}
				>
					{source === 'native' ? t('mapImport.next') : t('mapImport.preview')}
				</Button>
			</div>
		</>
	);
}

export function ImportPreviewPanel({
	preview,
	source,
	meta,
	commitError,
	busy,
	onBack,
	onCancel,
	onCommit,
}: {
	preview: MapImportPreview;
	source: 'native' | 'external';
	meta: Array<[MessageKey, string]>;
	commitError: string | null;
	busy: boolean;
	onBack: () => void;
	onCancel: () => void;
	onCommit: () => void;
}) {
	const { t } = useI18n();
	return (
		<>
			{!preview.ok ? (
				<div
					style={{
						display: 'flex',
						gap: 8,
						padding: 12,
						borderRadius: 9,
						background: 'var(--color-status-error-subtle)',
						border: `1px solid ${T.err}`,
					}}
				>
					<Icon name="error" size={16} color={T.err} />
					<span style={{ font: `13px ${T.sans}`, color: 'var(--color-status-error-text)' }}>
						{preview.message} {t('mapImport.cannotImport')}
					</span>
				</div>
			) : (
				<>
					{source === 'native' && preview.asset && (
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'auto 1fr',
								rowGap: 6,
								columnGap: 14,
								font: `13px ${T.sans}`,
							}}
						>
							{[
								...meta,
								['mapImport.meta.fingerprint', preview.asset.id] as [MessageKey, string],
							].map(([k, v]) => (
								<span key={k} style={{ display: 'contents' }}>
									<span style={{ color: T.ter }}>{t(k)}</span>
									<span
										style={{
											color: T.ink,
											fontFamily: k === 'mapImport.meta.fingerprint' ? T.mono : undefined,
											wordBreak: 'break-all',
										}}
									>
										{v}
									</span>
								</span>
							))}
						</div>
					)}
					{preview.diagnostics.length > 0 && (
						<div style={{ border: `1px solid ${T.bd}`, borderRadius: 9, overflow: 'hidden' }}>
							{preview.diagnostics.map((d, i) => {
								const s = SUPPORT_PILL[d.support] ?? SUPPORT_PILL.unsupported!;
								return (
									<div
										key={d.kind}
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											gap: 8,
											padding: '7px 11px',
											background: i % 2 ? T.alt : 'transparent',
										}}
									>
										<span style={{ font: `13px ${T.sans}`, color: T.ink }}>{d.kind}</span>
										<span
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: 4,
												padding: '2px 8px',
												borderRadius: 999,
												background: s.bg,
												color: s.tone,
												border: `1px solid ${s.tone}`,
												font: `600 10.5px ${T.sans}`,
											}}
										>
											<Icon name={s.icon} size={12} /> {t(s.label)}
										</span>
									</div>
								);
							})}
						</div>
					)}
					{preview.droppedElements.length > 0 && (
						<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
							{t('mapImport.dropped')}{' '}
							<strong style={{ color: T.ink }}>{preview.droppedElements.join(', ')}</strong>
						</div>
					)}
					<div
						style={{
							display: 'flex',
							gap: 8,
							padding: '9px 12px',
							borderRadius: 9,
							background: T.alt,
							border: `1px solid ${T.bd}`,
							font: `12px/1.5 ${T.sans}`,
							color: T.sub,
						}}
					>
						<Icon name="info" size={15} color={T.info} />
						<span>{t('mapImport.storageNote')}</span>
					</div>
				</>
			)}
			{commitError && <div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{commitError}</div>}
			<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
				<Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
					{t('mapImport.back')}
				</Button>
				<div style={{ display: 'flex', gap: 8 }}>
					<Button variant="ghost" size="sm" onClick={onCancel}>
						{t('common.action.cancel')}
					</Button>
					{preview.ok && (
						<Button variant="primary" size="sm" icon="check" disabled={busy} onClick={onCommit}>
							{busy ? t('mapImport.importing') : t('mapImport.import')}
						</Button>
					)}
				</div>
			</div>
		</>
	);
}

export function ImportResultPanel({
	mapName,
	result,
	cellsAcross,
	unitsPerCell,
	unit,
	mapScale,
	onClose,
}: {
	mapName: string;
	result: ImportResultSummary;
	cellsAcross: number;
	unitsPerCell: number;
	unit: string;
	mapScale: MapScale | null;
	onClose: () => void;
}) {
	const { t } = useI18n();
	return (
		<>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: 12,
					borderRadius: 9,
					background: 'var(--color-status-success-subtle)',
					border: `1px solid ${T.ok}`,
				}}
			>
				<Icon name="success" size={20} color={T.ok} />
				<div style={{ font: `13px ${T.sans}` }}>
					<div style={{ fontWeight: 600, color: T.ink }}>
						{t('mapImport.committed', { name: mapName })}
					</div>
					<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
						{result.assetId
							? result.deduped
								? t('mapImport.assetDeduped', { id: result.assetId })
								: t('mapImport.assetRecorded', { id: result.assetId })
							: t('mapImport.sceneRecorded')}
						{result.dropped > 0 ? t('mapImport.droppedCount', { count: result.dropped }) : ''}
					</div>
				</div>
			</div>
			{(result.gridApplied || result.scaleApplied || result.wallsApplied > 0) && (
				<ul
					style={{
						margin: 0,
						paddingLeft: 18,
						font: `12.5px/1.7 ${T.sans}`,
						color: T.sub,
					}}
				>
					{result.gridApplied && (
						<li>
							{t('mapImport.result.grid', {
								count: cellsAcross,
								units: unitsPerCell,
								unit,
							})}
						</li>
					)}
					{result.scaleApplied && mapScale && (
						<li>
							{t('mapImport.result.scale', {
								amount: Math.round(mapScale.unitsPerMap),
								unit: mapScale.unit,
							})}
						</li>
					)}
					{result.wallsApplied > 0 && (
						<li>{t('mapImport.result.walls', { count: result.wallsApplied })}</li>
					)}
				</ul>
			)}
			{result.followUpErrors.length > 0 && (
				<div
					style={{
						display: 'flex',
						gap: 8,
						padding: '9px 12px',
						borderRadius: 9,
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid ${T.warn}`,
						font: `12px/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="warning" size={15} color={T.warn} />
					<div>
						<div>{t('mapImport.result.followUpFailed')}</div>
						<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
							{result.followUpErrors.map((message) => (
								<li key={message}>{message}</li>
							))}
						</ul>
					</div>
				</div>
			)}
			{result.byteError && (
				<div
					style={{
						display: 'flex',
						gap: 8,
						padding: '9px 12px',
						borderRadius: 9,
						background: 'var(--color-status-warning-subtle)',
						border: `1px solid ${T.warn}`,
						font: `12px/1.5 ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="warning" size={15} color={T.warn} />
					<span>{t('mapImport.byteError', { message: result.byteError })}</span>
				</div>
			)}
			<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
				<Button variant="primary" size="sm" onClick={onClose}>
					{t('common.action.done')}
				</Button>
			</div>
		</>
	);
}
