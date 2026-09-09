import { useEffect, useMemo, useState } from 'react';
import {
	MAP_IMPORT_MAX_ASSET_BYTES,
	NATIVE_ASSET_MIME_TYPES,
	deriveGridCalibration,
	deriveImportScale,
	previewMapImport,
	type MapGridCalibration,
	type MapGridShape,
	type MapImportElementKind,
	type MapImportPreview,
	type MapScale,
} from '@dndtools/core';
import { Dialog, Stepper } from '../../ds';
import { putAssetBytes } from '../../platform/storage/assetStore';
import { useRuntime } from '../../runtime/RuntimeContext';
import { type PickedFile } from './importShared';
import {
	ImportAlignPanel,
	ImportScalePanel,
	ImportWallsPanel,
	WizardNav,
	type CellBox,
} from './ImportMapPanels';
import {
	ImportPreviewPanel,
	ImportResultPanel,
	ImportSourcePanel,
	type ImportResultSummary,
} from './ImportMapSteps';
import { sampleLuminance, traceWalls, type TracedWallPreview } from './importWizard';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';

/**
 * RC-MAP-3.2 — the raster import wizard.
 *
 * v1 imported bytes and stopped, which left the DM with a picture and no way to tell the app how big
 * a square was. v2 adds three steps between the file and the commit — align the grid, name the scale,
 * optionally trace the walls — and then dispatches the EXISTING durable commands in order:
 *
 *   map.import-asset → map.configure-overlay → map.set-scale → map.create-layer + map.add-features
 *
 * Every one of those is a core command, so the whole wizard writes nothing itself. The follow-up
 * dispatches are reported individually on the result step: the asset can land while the scale is
 * refused, and saying so is the honest outcome (guardrail 9) rather than a blanket "Imported".
 */

/** The step sequence, by source. The external path has no raster to calibrate. */
const NATIVE_STEPS = ['source', 'align', 'scale', 'walls', 'preview', 'result'] as const;
const EXTERNAL_STEPS = ['source', 'preview', 'result'] as const;
type StepId = (typeof NATIVE_STEPS)[number];

const STEP_LABEL: Record<StepId, MessageKey> = {
	source: 'mapImport.step.source',
	align: 'mapImport.step.align',
	scale: 'mapImport.step.scale',
	walls: 'mapImport.step.walls',
	preview: 'mapImport.step.preview',
	result: 'mapImport.step.result',
};

/** The default calibration box: a tenth of the image, which is a plausible battle-map cell. */
const DEFAULT_CELL_BOX: CellBox = { a: { x: 0.4, y: 0.4 }, b: { x: 0.5, y: 0.5 } };

/** Default luminance cut. Printed dungeon ink sits well under this; parchment sits well over it. */
const DEFAULT_TRACE_THRESHOLD = 96;

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
	// `ImportResultSummary` also carries the RC-MAP-3.2 follow-up outcomes: a refused scale must not
	// read as a clean import, so each is reported separately on the result step.
	const [result, setResult] = useState<ImportResultSummary | null>(null);

	// RC-MAP-3.2 — calibration / scale / trace state. All of it is preview-only until `commit()`.
	const [shape, setShape] = useState<MapGridShape>('square');
	const [cellBox, setCellBox] = useState<CellBox>(DEFAULT_CELL_BOX);
	const [unitsPerCell, setUnitsPerCell] = useState(5);
	const [unit, setUnit] = useState('feet');
	const [traceEnabled, setTraceEnabled] = useState(false);
	const [threshold, setThreshold] = useState(DEFAULT_TRACE_THRESHOLD);
	const [traced, setTraced] = useState<TracedWallPreview | null>(null);
	const [traceError, setTraceError] = useState<string | null>(null);
	const [tracing, setTracing] = useState(false);
	const [imageUrl, setImageUrl] = useState<string | null>(null);

	const steps = source === 'native' ? NATIVE_STEPS : EXTERNAL_STEPS;
	const stepId: StepId = steps[Math.min(step, steps.length - 1)] as StepId;

	const nativeMimes = Object.keys(NATIVE_ASSET_MIME_TYPES);

	// A blob URL for the alignment preview. Revoked on change/unmount so a 50 MB raster is not pinned
	// in memory after the dialog closes.
	useEffect(() => {
		if (!picked) {
			setImageUrl(null);
			return;
		}
		const url = URL.createObjectURL(picked.file);
		setImageUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [picked]);

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
			// A new file invalidates every calibration made against the previous one.
			setCellBox(DEFAULT_CELL_BOX);
			setTraced(null);
			setTraceError(null);
		} catch (err) {
			setReadError(err instanceof Error ? err.message : String(err));
		}
	}

	// Read-only, pure preview against the SAME registry + validation the commit handler re-runs
	// (MAP-002/MAP-020): nothing is written until the explicit commit in step 2.
	const preview: MapImportPreview | null = useMemo(() => {
		if (stepId !== 'preview') return null;
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
					maxBytes: MAP_IMPORT_MAX_ASSET_BYTES,
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
	}, [stepId, source, picked, formatId, declared, actorId, runtime.mapImportAdapters]);

	// RC-MAP-3.2 — the calibration + scale the align/scale steps derive. Pure, recomputed on every
	// change, and never written until commit.
	const calibrationResult = useMemo(
		() =>
			deriveGridCalibration({
				corners: [cellBox.a, cellBox.b],
				imageWidth: picked?.dimensions?.width ?? 0,
				imageHeight: picked?.dimensions?.height ?? 0,
				shape,
			}),
		[cellBox, picked, shape],
	);
	const calibration: MapGridCalibration | null =
		'error' in calibrationResult ? null : calibrationResult;
	const calibrationError = 'error' in calibrationResult ? calibrationResult.error.message : null;

	const scaleResult = useMemo(
		() => (calibration ? deriveImportScale(calibration, unitsPerCell, unit) : null),
		[calibration, unitsPerCell, unit],
	);
	const mapScale: MapScale | null =
		scaleResult && !('error' in scaleResult) ? (scaleResult as MapScale) : null;
	const scaleError = scaleResult && 'error' in scaleResult ? scaleResult.error.message : null;

	async function runTrace() {
		if (!picked || tracing) return;
		setTracing(true);
		setTraceError(null);
		try {
			const sample = await sampleLuminance(picked.file);
			if (!sample) {
				setTraced(null);
				setTraceError(t('mapImport.walls.unavailable'));
				return;
			}
			setTraced(traceWalls(sample, threshold, runtime.newId()));
		} catch (error) {
			setTraced(null);
			setTraceError(error instanceof Error ? error.message : t('mapImport.walls.unavailable'));
		} finally {
			setTracing(false);
		}
	}

	/** Dispatch one follow-up command, collecting a refusal instead of aborting the whole import. */
	async function runFollowUp(errors: string[], command: unknown): Promise<boolean> {
		try {
			const res = await runtime.dispatch(command as never);
			if (res.status === 'accepted') return true;
			errors.push(res.rejection.message);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : t('mapImport.failed'));
		}
		return false;
	}

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
									// The handler re-validates size itself; without the same cap the preview used,
									// a 20 MB map would preview clean and then be refused at 8 MB on commit.
									maxBytes: MAP_IMPORT_MAX_ASSET_BYTES,
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
				// RC-MAP-3.2 — the calibration follow-ups. Each is its own durable core command, dispatched
				// only after the asset itself landed, and each refusal is collected rather than thrown
				// away: an accepted image with a refused scale must not read as a clean import.
				const followUpErrors: string[] = [];
				let gridApplied = false;
				let scaleApplied = false;
				let wallsApplied = 0;
				if (source === 'native') {
					const targetMapId = (ev as { mapId?: string } | undefined)?.mapId ?? mapId;
					if (calibration) {
						const applied = await runFollowUp(followUpErrors, {
							type: 'map.configure-overlay',
							actorId,
							payload: {
								mapId: targetMapId,
								gridVisible: true,
								gridSize: calibration.cellsAcross,
								unitsPerCell,
							},
						});
						gridApplied = applied;
					}
					if (mapScale) {
						scaleApplied = await runFollowUp(followUpErrors, {
							type: 'map.set-scale',
							actorId,
							payload: { mapId: targetMapId, scale: mapScale },
						});
					}
					if (traceEnabled && traced && traced.features.length > 0) {
						const layerId = runtime.newId();
						const layerMade = await runFollowUp(followUpErrors, {
							type: 'map.create-layer',
							actorId,
							payload: {
								mapId: targetMapId,
								id: layerId,
								name: t('mapImport.walls.layerName'),
								category: 'terrain',
								visibility: 'dm-only',
							},
						});
						if (layerMade) {
							const added = await runFollowUp(followUpErrors, {
								type: 'map.add-features',
								actorId,
								payload: { mapId: targetMapId, layerId, features: traced.features },
							});
							if (added) wallsApplied = traced.features.length;
						}
					}
				}
				setResult({
					assetId: ev?.assetId ?? null,
					deduped: ev?.assetDeduped ?? false,
					dropped: ev?.droppedElementCount ?? 0,
					byteError,
					followUpErrors,
					gridApplied,
					scaleApplied,
					wallsApplied,
				});
				setStep(steps.length - 1);
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
				<Stepper steps={steps.map((id) => t(STEP_LABEL[id]))} current={step} />

				{stepId === 'source' && (
					<ImportSourcePanel
						source={source}
						onSourceChange={(next) => {
							setSource(next);
							setStep(0);
						}}
						nativeMimes={nativeMimes}
						picked={picked}
						onPickFile={(file) => void pickFile(file)}
						readError={readError}
						formats={formats}
						formatId={formatId}
						onFormatIdChange={setFormatId}
						declared={declared}
						onDeclaredChange={setDeclared}
						canAdvance={canPreview}
						onCancel={onClose}
						onNext={() => setStep(1)}
					/>
				)}

				{stepId === 'align' && (
					<>
						<ImportAlignPanel
							imageUrl={imageUrl}
							imageWidth={picked?.dimensions?.width ?? 0}
							imageHeight={picked?.dimensions?.height ?? 0}
							shape={shape}
							onShapeChange={setShape}
							box={cellBox}
							onBoxChange={setCellBox}
							calibration={calibration}
							calibrationError={calibrationError}
						/>
						<WizardNav
							onBack={() => setStep(0)}
							onCancel={onClose}
							onNext={() => setStep(2)}
							nextDisabled={calibration === null}
						/>
					</>
				)}

				{stepId === 'scale' && (
					<>
						<ImportScalePanel
							unitsPerCell={unitsPerCell}
							onUnitsPerCellChange={setUnitsPerCell}
							unit={unit}
							onUnitChange={setUnit}
							calibration={calibration}
							scaleError={scaleError}
							unitsPerMap={mapScale?.unitsPerMap ?? null}
						/>
						<WizardNav
							onBack={() => setStep(1)}
							onCancel={onClose}
							onNext={() => setStep(3)}
							nextDisabled={mapScale === null}
						/>
					</>
				)}

				{stepId === 'walls' && (
					<>
						<ImportWallsPanel
							enabled={traceEnabled}
							onEnabledChange={setTraceEnabled}
							threshold={threshold}
							onThresholdChange={setThreshold}
							traced={traced}
							traceError={traceError}
							tracing={tracing}
							onTrace={() => void runTrace()}
						/>
						<WizardNav
							onBack={() => setStep(2)}
							onCancel={onClose}
							onNext={() => setStep(4)}
							nextDisabled={false}
						/>
					</>
				)}

				{stepId === 'preview' && preview && (
					<ImportPreviewPanel
						preview={preview}
						source={source}
						meta={meta}
						commitError={commitError}
						busy={busy}
						onBack={() => setStep((current) => Math.max(0, current - 1))}
						onCancel={onClose}
						onCommit={() => void commit()}
					/>
				)}

				{stepId === 'result' && result && (
					<ImportResultPanel
						mapName={mapName}
						result={result}
						cellsAcross={calibration?.cellsAcross ?? 0}
						unitsPerCell={unitsPerCell}
						unit={unit}
						mapScale={mapScale}
						onClose={onClose}
					/>
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
