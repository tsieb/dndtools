import { useMemo, useState } from 'react';
import {
	NATIVE_ASSET_MIME_TYPES,
	previewMapImport,
	type MapImportElementKind,
	type MapImportPreview,
} from '@dndtools/core';
import { Button, Dialog, Field, Icon, SegmentedControl, Select, Stepper } from '../../ds';
import { T } from '../screen-kit';
import { putAssetBytes } from '../../platform/storage/assetStore';
import { useRuntime } from '../../runtime/RuntimeContext';
import { IMPORT_ELEMENT_KINDS, PanelLabel, SUPPORT_PILL, type PickedFile } from './importShared';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';

export function ImportMapDialog({
	mapId,
	mapName,
	onClose,
}: {
	mapId: string;
	mapName: string;
	onClose: () => void;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const [step, setStep] = useState(0);
	const [source, setSource] = useState<'native' | 'external'>('native');
	const [picked, setPicked] = useState<PickedFile | null>(null);
	const [readError, setReadError] = useState<string | null>(null);
	const formats = runtime.mapImportAdapters.formats();
	const [formatId, setFormatId] = useState(formats[0] ?? '');
	const [declared, setDeclared] = useState<MapImportElementKind[]>([
		'dimensions',
		'grid',
		'background-image',
	]);
	const [busy, setBusy] = useState(false);
	const [commitError, setCommitError] = useState<string | null>(null);
	const [result, setResult] = useState<{
		assetId: string | null;
		deduped: boolean;
		dropped: number;
		byteError: string | null;
	} | null>(null);

	const nativeMimes = Object.keys(NATIVE_ASSET_MIME_TYPES);

	async function pickFile(file: File | undefined) {
		setReadError(null);
		setPicked(null);
		if (!file) return;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			let dimensions: { width: number; height: number } | null = null;
			if (file.type !== 'image/svg+xml') {
				try {
					const bmp = await createImageBitmap(file);
					dimensions = { width: bmp.width, height: bmp.height };
					bmp.close();
				} catch {
					dimensions = null; // undecodable raster — the core validates MIME/size itself
				}
			}
			setPicked({ file, bytes, dimensions });
		} catch (err) {
			setReadError(err instanceof Error ? err.message : String(err));
		}
	}

	// Read-only, pure preview against the SAME registry + validation the commit handler re-runs
	// (MAP-002/MAP-020): nothing is written until the explicit commit in step 2.
	const preview: MapImportPreview | null = useMemo(() => {
		if (step !== 1) return null;
		const now = new Date().toISOString();
		if (source === 'native') {
			if (!picked) return null;
			return previewMapImport(runtime.mapImportAdapters, {
				formatId: null,
				asset: {
					bytes: picked.bytes,
					mimeType: picked.file.type,
					fileName: picked.file.name,
					dimensions: picked.dimensions,
				},
				declaredElements: [],
				importedBy: actorId,
				importedAt: now,
			});
		}
		return previewMapImport(runtime.mapImportAdapters, {
			formatId: formatId || 'unknown',
			asset: null,
			declaredElements: declared,
			importedBy: actorId,
			importedAt: now,
		});
	}, [step, source, picked, formatId, declared, actorId, runtime.mapImportAdapters]);

	async function commit() {
		if (busy) return;
		setBusy(true);
		setCommitError(null);
		try {
			const res = await runtime.dispatch(
				source === 'native'
					? {
							type: 'map.import-asset',
							actorId,
							payload: {
								mapId,
								bytes: Array.from(picked?.bytes ?? []),
								asset: {
									mimeType: picked?.file.type ?? '',
									fileName: picked?.file.name ?? '',
									dimensions: picked?.dimensions ?? null,
								},
							},
						}
					: {
							type: 'map.commit-import',
							actorId,
							payload: { mapId, formatId, declaredElements: declared, bytes: null, asset: null },
						},
			);
			if (res.status === 'accepted') {
				const ev = (
					res.events as
						| Array<{
								kind: string;
								assetId?: string | null;
								assetDeduped?: boolean;
								droppedElementCount?: number;
						  }>
						| undefined
				)?.find((e) => e.kind === 'map.import-committed');
				// Store the REAL bytes in the app-side content-addressed store (same hash id as the core
				// metadata record, so the canvas can resolve them). A byte-store failure is reported
				// honestly on the result step — the metadata record stands, the raster just won't render.
				let byteError: string | null = null;
				if (source === 'native' && picked) {
					try {
						await putAssetBytes(picked.bytes, picked.file.type);
					} catch (err) {
						byteError = err instanceof Error ? err.message : String(err);
					}
				}
				setResult({
					assetId: ev?.assetId ?? null,
					deduped: ev?.assetDeduped ?? false,
					dropped: ev?.droppedElementCount ?? 0,
					byteError,
				});
				setStep(2);
			} else {
				setCommitError(res.rejection.message);
			}
		} catch (error) {
			// `finally` alone only un-freezes the button. `runtime.dispatch` RETHROWS after a failed
			// persist, so without this branch Import simply did nothing, forever, with no message —
			// the wizard sat on the preview step looking as though the click had never registered.
			setCommitError(error instanceof Error ? error.message : t('mapImport.failed'));
		} finally {
			setBusy(false);
		}
	}

	const canPreview =
		source === 'native' ? picked !== null : declared.length > 0 && formatId.length > 0;
	const meta: Array<[MessageKey, string]> = picked
		? [
				['mapImport.meta.filename', picked.file.name],
				['mapImport.meta.mime', picked.file.type || t('mapImport.meta.unknown')],
				[
					'mapImport.meta.dimensions',
					picked.dimensions
						? t('mapImport.pixels', {
								width: picked.dimensions.width,
								height: picked.dimensions.height,
							})
						: '—',
				],
				[
					'mapImport.meta.byteSize',
					t('mapImport.kilobytes', { kb: (picked.bytes.length / 1024).toFixed(1) }),
				],
			]
		: [];

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('mapImport.title')}
			description={t('mapImport.description', { name: mapName })}
			icon="import"
			size="md"
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<Stepper
					steps={[
						t('mapImport.step.source'),
						t('mapImport.step.preview'),
						t('mapImport.step.result'),
					]}
					current={step}
				/>

				{step === 0 && (
					<>
						<SegmentedControl
							fullWidth
							ariaLabel={t('mapImport.sourceType')}
							value={source}
							onChange={(v: string) => setSource(v as 'native' | 'external')}
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
										void pickFile(e.target.files?.[0])
									}
								/>
								<Icon name="upload" size={26} color={T.ter} />
								{picked ? (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
										<strong style={{ color: T.ink }}>{picked.file.name}</strong> ·{' '}
										{t('mapImport.kilobytes', { kb: (picked.bytes.length / 1024).toFixed(1) })}
									</span>
								) : (
									<span style={{ font: `13px ${T.sans}`, color: T.sub }}>
										{t('mapImport.choose')}
									</span>
								)}
								<span style={{ font: `11px ${T.sans}`, color: T.ter }}>
									{t('mapImport.accepted', {
										mb: Math.round((8 * 1024 * 1024) / (1024 * 1024)),
									})}
								</span>
								{readError && (
									<span style={{ font: `12px ${T.sans}`, color: T.err }}>{readError}</span>
								)}
							</label>
						) : (
							<>
								<Field label={t('mapImport.format')} help={t('mapImport.formatHelp')}>
									<Select
										value={formatId}
										options={formats.map((f) => ({ value: f, label: f }))}
										onChange={(e: { target: { value: string } }) => setFormatId(e.target.value)}
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
															setDeclared((d) => (on ? d.filter((x) => x !== k) : [...d, k]))
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
							<Button variant="ghost" size="sm" onClick={onClose}>
								{t('common.action.cancel')}
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon="preview"
								disabled={!canPreview}
								onClick={() => setStep(1)}
							>
								{t('mapImport.preview')}
							</Button>
						</div>
					</>
				)}

				{step === 1 && preview && (
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
						{commitError && (
							<div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{commitError}</div>
						)}
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
							<Button variant="ghost" size="sm" icon="chevron-left" onClick={() => setStep(0)}>
								{t('mapImport.back')}
							</Button>
							<div style={{ display: 'flex', gap: 8 }}>
								<Button variant="ghost" size="sm" onClick={onClose}>
									{t('common.action.cancel')}
								</Button>
								{preview.ok && (
									<Button
										variant="primary"
										size="sm"
										icon="check"
										disabled={busy}
										onClick={() => void commit()}
									>
										{busy ? t('mapImport.importing') : t('mapImport.import')}
									</Button>
								)}
							</div>
						</div>
					</>
				)}

				{step === 2 && result && (
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
				)}
			</div>
		</Dialog>
	);
}

// ── MapBuilder — the full-screen authoring overlay ──────────────────────────────────────────────
//
// MAP-021: the shell is now the rebuilt professional editor (`app/map/MapEditor.tsx`). This wrapper
// keeps `MapBuilder`'s public signature so `screens/Atlas.tsx` (which imports it plus `MapCanvas` and
// the shared vocab above) keeps compiling and working unchanged. `MapTool` is a subset of the editor's
// `ToolId`, so the Atlas launcher's initial tool/fog mode pass straight through.
