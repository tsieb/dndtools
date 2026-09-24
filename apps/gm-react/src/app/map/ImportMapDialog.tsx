import { Dialog, Stepper } from '../../ds';
import { ImportAlignPanel, ImportScalePanel, ImportWallsPanel, WizardNav } from './ImportMapPanels';
import { ImportPreviewPanel, ImportResultPanel, ImportSourcePanel } from './ImportMapSteps';
import { STEP_LABEL } from './importWizardState';
import { useImportMap } from './useImportMap';

export function ImportMapDialog({
	mapId,
	mapName,
	onClose,
}: {
	mapId: string;
	mapName: string;
	onClose: () => void;
}) {
	const {
		t,
		step,
		setStep,
		source,
		setSource,
		picked,
		readError,
		formats,
		formatId,
		setFormatId,
		declared,
		setDeclared,
		busy,
		commitError,
		result,
		shape,
		setShape,
		cellBox,
		setCellBox,
		unitsPerCell,
		setUnitsPerCell,
		unit,
		setUnit,
		traceEnabled,
		setTraceEnabled,
		threshold,
		setThreshold,
		traced,
		traceError,
		tracing,
		imageUrl,
		steps,
		stepId,
		nativeMimes,
		pickFile,
		preview,
		calibration,
		calibrationError,
		mapScale,
		scaleError,
		runTrace,
		commit,
		canPreview,
		meta,
	} = useImportMap({ mapId, mapName, onClose });

	return (
		<Dialog
			open
			onClose={onClose}
			title={t('mapImport.title')}
			description={t('mapImport.description', { name: mapName })}
			icon="import"
			size="md"
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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
