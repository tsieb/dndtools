import { useRef, type ReactNode } from 'react';
import type { MapGridCalibration, MapGridShape } from '@dndtools/core';
import { Button, Field, Icon, Input, SegmentedControl, Select, Slider, Switch } from '../../ds';
import { T } from '../screen-kit';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { ringPoints, type TracedWallPreview } from './importWizard';

/**
 * RC-MAP-3.2 — the raster import wizard's step panels.
 *
 * Split out of `ImportMapDialog.tsx` so the orchestrator stays readable (and under the 600-line
 * ceiling) while the wizard grew from three steps to six. Each panel is presentational: it renders
 * the step and reports the DM's choices upward. All policy — what a calibration means, what a scale
 * works out to, what counts as a wall — lives in the Processing Core.
 */

const CELL_MIN_PX = 1;

/** A small labelled readout row, used by the alignment and scale steps. */
function Readout({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'baseline',
				justifyContent: 'space-between',
				gap: 12,
				font: `13px ${T.sans}`,
			}}
		>
			<span style={{ color: T.ter }}>{label}</span>
			<span style={{ color: T.ink, fontWeight: 600 }}>{children}</span>
		</div>
	);
}

function HelpNote({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
	const border = tone === 'warn' ? T.warn : T.bd;
	return (
		<div
			style={{
				display: 'flex',
				gap: 8,
				padding: '9px 12px',
				borderRadius: 9,
				background: tone === 'warn' ? 'var(--color-status-warning-subtle)' : T.alt,
				border: `1px solid ${border}`,
				font: `12px/1.5 ${T.sans}`,
				color: T.sub,
			}}
		>
			<Icon
				name={tone === 'warn' ? 'warning' : 'info'}
				size={15}
				color={tone === 'warn' ? T.warn : T.info}
			/>
			<span>{children}</span>
		</div>
	);
}

export interface CellBox {
	a: { x: number; y: number };
	b: { x: number; y: number };
}

/**
 * Step "Align grid" — drag the two opposite corners of ONE grid cell over the image, or type the cell
 * size in pixels. Both paths write the same box and therefore derive the same calibration, which is
 * what keeps the pointer operation and its keyboard equivalent honest (WCAG 2.2 AA, 2.1.1).
 */
export function ImportAlignPanel({
	imageUrl,
	imageWidth,
	imageHeight,
	shape,
	onShapeChange,
	box,
	onBoxChange,
	calibration,
	calibrationError,
}: {
	imageUrl: string | null;
	imageWidth: number;
	imageHeight: number;
	shape: MapGridShape;
	onShapeChange: (shape: MapGridShape) => void;
	box: CellBox;
	onBoxChange: (box: CellBox) => void;
	calibration: MapGridCalibration | null;
	calibrationError: string | null;
}) {
	const { t } = useI18n();
	const frame = useRef<HTMLDivElement | null>(null);
	const dragging = useRef(false);

	const pointAt = (clientX: number, clientY: number) => {
		const rect = frame.current?.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) return null;
		return {
			x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
			y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
		};
	};

	const cellWidthPx = Math.round(Math.abs(box.b.x - box.a.x) * imageWidth);
	const cellHeightPx = Math.round(Math.abs(box.b.y - box.a.y) * imageHeight);

	const setCellPixels = (width: number, height: number) => {
		if (imageWidth <= 0 || imageHeight <= 0) return;
		const w = Math.max(CELL_MIN_PX, width) / imageWidth;
		const h = Math.max(CELL_MIN_PX, height) / imageHeight;
		onBoxChange({ a: box.a, b: { x: Math.min(1, box.a.x + w), y: Math.min(1, box.a.y + h) } });
	};

	const left = Math.min(box.a.x, box.b.x) * 100;
	const top = Math.min(box.a.y, box.b.y) * 100;
	const width = Math.abs(box.b.x - box.a.x) * 100;
	const height = Math.abs(box.b.y - box.a.y) * 100;

	return (
		<>
			<HelpNote>{t('mapImport.align.help')}</HelpNote>
			<div
				ref={frame}
				role="presentation"
				onPointerDown={(event: React.PointerEvent<HTMLDivElement>) => {
					const point = pointAt(event.clientX, event.clientY);
					if (!point) return;
					dragging.current = true;
					event.currentTarget.setPointerCapture(event.pointerId);
					onBoxChange({ a: point, b: point });
				}}
				onPointerMove={(event: React.PointerEvent<HTMLDivElement>) => {
					if (!dragging.current) return;
					const point = pointAt(event.clientX, event.clientY);
					if (point) onBoxChange({ a: box.a, b: point });
				}}
				onPointerUp={() => {
					dragging.current = false;
				}}
				style={{
					position: 'relative',
					aspectRatio:
						imageWidth > 0 && imageHeight > 0 ? `${imageWidth} / ${imageHeight}` : '3 / 2',
					maxHeight: 260,
					borderRadius: 10,
					border: `1px solid ${T.bd}`,
					background: T.sunken,
					overflow: 'hidden',
					touchAction: 'none',
					cursor: 'crosshair',
				}}
			>
				{imageUrl && (
					<img
						src={imageUrl}
						alt=""
						draggable={false}
						style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
					/>
				)}
				<svg
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
					style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
				>
					<rect
						x={left}
						y={top}
						width={width}
						height={height}
						fill="var(--color-accent-subtle)"
						fillOpacity={0.35}
						stroke="var(--color-accent)"
						strokeWidth={0.6}
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			</div>

			<SegmentedControl
				fullWidth
				ariaLabel={t('mapImport.align.shape')}
				value={shape}
				onChange={(value: string) => onShapeChange(value as MapGridShape)}
				options={[
					{ value: 'square', label: t('mapImport.align.square') },
					{ value: 'hex', label: t('mapImport.align.hex') },
				]}
			/>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
				<Field label={t('mapImport.align.cellWidth')}>
					<Input
						type="number"
						min={CELL_MIN_PX}
						value={String(cellWidthPx)}
						onChange={(event: { target: { value: string } }) =>
							setCellPixels(Number(event.target.value), cellHeightPx)
						}
					/>
				</Field>
				<Field label={t('mapImport.align.cellHeight')}>
					<Input
						type="number"
						min={CELL_MIN_PX}
						value={String(cellHeightPx)}
						onChange={(event: { target: { value: string } }) =>
							setCellPixels(cellWidthPx, Number(event.target.value))
						}
					/>
				</Field>
			</div>

			{calibration ? (
				<Readout label={t('mapImport.align.result')}>
					{t('mapImport.align.cells', {
						across: calibration.cellsAcross,
						down: calibration.cellsDown,
					})}
				</Readout>
			) : (
				<div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{calibrationError}</div>
			)}
			{shape === 'hex' && <HelpNote tone="warn">{t('mapImport.align.hexNote')}</HelpNote>}
		</>
	);
}

/** The units the scale step offers. Free-form on the core side; a short list keeps the copy honest. */
const SCALE_UNITS = ['feet', 'meters', 'miles', 'kilometers'] as const;

const UNIT_LABEL: Record<(typeof SCALE_UNITS)[number], MessageKey> = {
	feet: 'mapImport.scale.unit.feet',
	meters: 'mapImport.scale.unit.meters',
	miles: 'mapImport.scale.unit.miles',
	kilometers: 'mapImport.scale.unit.kilometers',
};

/** Step "Scale" — "1 square = 5 ft", which the core turns into the map's physical width. */
export function ImportScalePanel({
	unitsPerCell,
	onUnitsPerCellChange,
	unit,
	onUnitChange,
	calibration,
	scaleError,
	unitsPerMap,
}: {
	unitsPerCell: number;
	onUnitsPerCellChange: (value: number) => void;
	unit: string;
	onUnitChange: (unit: string) => void;
	calibration: MapGridCalibration | null;
	scaleError: string | null;
	unitsPerMap: number | null;
}) {
	const { t } = useI18n();
	return (
		<>
			<HelpNote>{t('mapImport.scale.help')}</HelpNote>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
				<Field label={t('mapImport.scale.perCell')}>
					<Input
						type="number"
						min={0}
						step="0.5"
						value={String(unitsPerCell)}
						onChange={(event: { target: { value: string } }) =>
							onUnitsPerCellChange(Number(event.target.value))
						}
					/>
				</Field>
				<Field label={t('mapImport.scale.unit')}>
					<Select
						value={unit}
						options={SCALE_UNITS.map((value) => ({ value, label: t(UNIT_LABEL[value]) }))}
						onChange={(event: { target: { value: string } }) => onUnitChange(event.target.value)}
					/>
				</Field>
			</div>
			{calibration && (
				<Readout label={t('mapImport.scale.acrossLabel')}>
					{t('mapImport.scale.cellCount', { count: calibration.cellsAcross })}
				</Readout>
			)}
			{unitsPerMap !== null ? (
				<Readout label={t('mapImport.scale.widthLabel')}>
					{t('mapImport.scale.width', { amount: Math.round(unitsPerMap), unit })}
				</Readout>
			) : (
				<div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{scaleError}</div>
			)}
		</>
	);
}

/**
 * Step "Trace walls" — optional. The tracer runs marching squares over a luminance threshold in the
 * core and shows the result BEFORE anything is written, because the threshold that reads a printed
 * dungeon perfectly reads a watercolour world map as noise. AI-free, but the same rule applies: it
 * proposes, the DM disposes.
 */
export function ImportWallsPanel({
	enabled,
	onEnabledChange,
	threshold,
	onThresholdChange,
	traced,
	traceError,
	tracing,
	onTrace,
}: {
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	threshold: number;
	onThresholdChange: (value: number) => void;
	traced: TracedWallPreview | null;
	traceError: string | null;
	tracing: boolean;
	onTrace: () => void;
}) {
	const { t } = useI18n();
	return (
		<>
			<Switch checked={enabled} onChange={onEnabledChange} label={t('mapImport.walls.enable')} />
			<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
				{t('mapImport.walls.enableHelp')}
			</div>
			{enabled && (
				<>
					<Slider
						min={0}
						max={255}
						step={1}
						value={threshold}
						onChange={onThresholdChange}
						label={t('mapImport.walls.threshold')}
						valueLabel={String(threshold)}
						steppers
					/>
					<div style={{ display: 'flex', justifyContent: 'flex-start' }}>
						<Button
							variant="secondary"
							size="sm"
							icon="preview"
							disabled={tracing}
							onClick={onTrace}
						>
							{tracing ? t('mapImport.walls.tracing') : t('mapImport.walls.trace')}
						</Button>
					</div>
					{traceError && <div style={{ font: `12.5px ${T.sans}`, color: T.err }}>{traceError}</div>}
					{traced && (
						<>
							<Readout label={t('mapImport.walls.found')}>
								{t('mapImport.walls.foundCount', {
									walls: traced.features.length,
									points: traced.vertexCount,
								})}
							</Readout>
							<div
								style={{
									borderRadius: 10,
									border: `1px solid ${T.bd}`,
									background: T.sunken,
									padding: 6,
								}}
							>
								<svg
									viewBox="0 0 100 100"
									role="img"
									aria-label={t('mapImport.walls.previewLabel', {
										count: traced.features.length,
									})}
									style={{ display: 'block', width: '100%', maxHeight: 190 }}
								>
									{traced.features.map((feature) => (
										<polygon
											key={feature.id}
											points={ringPoints(feature.points)}
											fill="none"
											stroke="var(--color-accent)"
											strokeWidth={0.5}
											vectorEffect="non-scaling-stroke"
										/>
									))}
								</svg>
							</div>
							<HelpNote>{t('mapImport.walls.previewNote')}</HelpNote>
						</>
					)}
				</>
			)}
		</>
	);
}

/**
 * The Back · Cancel · Next footer shared by the three calibration steps. A single component keeps the
 * button order and labels identical across them (the alternative drifted three ways in review).
 */
export function WizardNav({
	onBack,
	onCancel,
	onNext,
	nextDisabled,
}: {
	onBack: () => void;
	onCancel: () => void;
	onNext: () => void;
	nextDisabled: boolean;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
			<Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
				{t('mapImport.back')}
			</Button>
			<div style={{ display: 'flex', gap: 8 }}>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t('common.action.cancel')}
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon="chevron-right"
					disabled={nextDisabled}
					onClick={onNext}
				>
					{t('mapImport.next')}
				</Button>
			</div>
		</div>
	);
}
