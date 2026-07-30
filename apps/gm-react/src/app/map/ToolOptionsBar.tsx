import { useState } from 'react';
import { Icon, Input, Popover, SegmentedControl, Select, Slider, Switch } from '../../ds';
import { T } from '../screen-kit';
import type { MapEditorApi } from './useMapEditor';
import { TOOLS_BY_ID } from './tools';
import { DOOR_KINDS, SCATTER_SETS, TERRAIN_STYLES, VIS_TEXT } from './mapVocab';
import type { SceneVisibility } from '@dndtools/core';

/**
 * MAP-021 — the context-sensitive tool-options bar. THE DECISION RULE: this bar carries parameters of
 * the VERB (what the next stroke/click will do), never of a selected object (that is the Inspector's
 * job). It changes per active tool and its state persists per tool via `editor.options`. When a tool
 * has more than ~4 controls the overflow lives behind a ⚙ Popover — never a modal, because these are
 * tuned while watching the canvas.
 */

/** Slider always PAIRED with a number input + steppers — a lone slider is a WCAG 2.5.7 failure. */
function NumberControl({
	label,
	value,
	min,
	max,
	step,
	unit,
	onChange,
	width = 150,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	unit?: string;
	onChange: (v: number) => void;
	width?: number;
}) {
	const clamp = (v: number) => Math.min(max, Math.max(min, v));
	// Clamping on every keystroke made multi-digit values impossible to type: with min=5, typing
	// "20" clamped the intermediate "2" to 5 and left you at 50. Hold the raw text while the field
	// has focus and only commit (clamped) on blur or Enter. The slider/steppers still clamp live.
	const [draft, setDraft] = useState<string | null>(null);
	const commitDraft = () => {
		if (draft === null) return;
		const parsed = Number(draft);
		setDraft(null);
		if (draft.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
	};
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub, whiteSpace: 'nowrap' }}>{label}</span>
			<Slider
				min={min}
				max={max}
				step={step}
				value={value}
				aria-label={label}
				valueLabel={`${value}${unit ? ` ${unit}` : ''}`}
				onChange={(v: number) => onChange(clamp(v))}
				style={{ width }}
			/>
			<button
				type="button"
				aria-label={`Decrease ${label}`}
				onClick={() => onChange(clamp(value - step))}
				style={stepBtn}
			>
				<Icon name="remove" size={13} />
			</button>
			<input
				type="number"
				aria-label={`${label} value`}
				value={draft ?? value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commitDraft}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						commitDraft();
					}
				}}
				style={{
					width: 54,
					textAlign: 'right',
					font: `12px ${T.mono}`,
					color: T.ink,
					background: T.sunken,
					border: `1px solid ${T.bdS}`,
					borderRadius: 6,
					padding: '4px 6px',
				}}
			/>
			<button
				type="button"
				aria-label={`Increase ${label}`}
				onClick={() => onChange(clamp(value + step))}
				style={stepBtn}
			>
				<Icon name="add" size={13} />
			</button>
		</div>
	);
}

const stepBtn = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	width: 26,
	height: 26,
	flex: '0 0 auto',
	borderRadius: 6,
	border: `1px solid ${T.bdS}`,
	background: T.raised,
	color: T.sub,
	cursor: 'pointer',
	padding: 0,
} as const;

function SnapMenu({ editor }: { editor: MapEditorApi }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ position: 'relative' }}>
			<button
				type="button"
				aria-label="Snapping options"
				aria-expanded={open}
				title="Snapping — hold Ctrl to momentarily disable"
				onClick={() => setOpen((v) => !v)}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					padding: '6px 10px',
					borderRadius: 8,
					border: `1px solid ${T.bd}`,
					background: T.raised,
					color: T.sub,
					cursor: 'pointer',
					font: `12px ${T.sans}`,
				}}
			>
				<Icon name="tool-magnet" size={14} />
				Snap
			</button>
			{open && (
				<Popover
					open
					onClose={() => setOpen(false)}
					title="Snapping"
					width={220}
					placement="bottom"
					// ds/Popover only sets a z-index in its `anchor` branch, and this options bar is a
					// static ancestor — so without an explicit z-index the flyout was painted UNDER the
					// positioned canvas wrapper and its switches were unclickable. Matches the header
					// export menu (MapEditor.tsx) and the layer row menu (LayersPanel.tsx).
					style={{
						position: 'absolute',
						left: 0,
						top: 'calc(100% + 6px)',
						transform: 'none',
						zIndex: 30,
					}}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{(
							[
								['snapGrid', 'Snap to grid'],
								['snapAngle', 'Snap to angle'],
								['snapObject', 'Snap to objects'],
							] as const
						).map(([key, label]) => (
							<label
								key={key}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 10,
								}}
							>
								<span style={{ font: `12.5px ${T.sans}`, color: T.ink }}>{label}</span>
								<Switch
									checked={editor.options[key]}
									aria-label={label}
									onChange={(v: boolean) => editor.setOption(key, v)}
								/>
							</label>
						))}
						<div style={{ font: `11px ${T.sans}`, color: T.ter }}>
							Hold Ctrl while drawing to disable temporarily.
						</div>
					</div>
				</Popover>
			)}
		</div>
	);
}

export function ToolOptionsBar({ editor }: { editor: MapEditorApi }) {
	const { tool, options, setOption } = editor;
	const def = TOOLS_BY_ID.get(tool);

	const visControl = (
		<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub }}>New</span>
			<Select
				value={options.newVisibility}
				aria-label="New object visibility"
				options={[
					{ value: 'dm-only', label: VIS_TEXT['dm-only'] },
					{ value: 'player-visible', label: VIS_TEXT['player-visible'] },
					{ value: 'shared', label: VIS_TEXT.shared },
				]}
				onChange={(e: { target: { value: string } }) =>
					setOption('newVisibility', e.target.value as SceneVisibility)
				}
				style={{ minWidth: 140 }}
			/>
		</label>
	);

	let controls: React.ReactNode;
	switch (tool) {
		case 'brush':
		case 'fill':
			controls = (
				<>
					<TerrainSelect editor={editor} />
					{tool === 'brush' && (
						<NumberControl
							label="Size"
							value={options.brushSize}
							min={5}
							max={200}
							step={1}
							onChange={(v) => setOption('brushSize', v)}
						/>
					)}
					<SnapMenu editor={editor} />
				</>
			);
			break;
		case 'erase':
			controls = (
				<NumberControl
					label="Size"
					value={options.brushSize}
					min={5}
					max={200}
					step={1}
					onChange={(v) => setOption('brushSize', v)}
				/>
			);
			break;
		case 'room':
		case 'wall':
			controls = <SnapMenu editor={editor} />;
			break;
		case 'door':
			controls = (
				<SegmentedControl
					ariaLabel="Door type"
					value={options.doorKind}
					onChange={(v: string) => setOption('doorKind', v as typeof options.doorKind)}
					options={DOOR_KINDS.map((d) => ({ value: d.id, label: d.label }))}
				/>
			);
			break;
		case 'water':
			controls = (
				<SegmentedControl
					ariaLabel="Water type"
					value={options.waterKind}
					onChange={(v: string) => setOption('waterKind', v as typeof options.waterKind)}
					options={[
						{ value: 'river', label: 'River' },
						{ value: 'lake', label: 'Lake' },
					]}
				/>
			);
			break;
		case 'light':
			controls = (
				<>
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
						<span style={{ font: `12px ${T.sans}`, color: T.sub }}>Colour</span>
						<input
							type="color"
							aria-label="Light colour"
							value={options.lightColor}
							onChange={(e) => setOption('lightColor', e.target.value)}
							style={{
								width: 34,
								height: 28,
								border: `1px solid ${T.bd}`,
								borderRadius: 6,
								background: 'none',
								padding: 0,
							}}
						/>
					</label>
					<NumberControl
						label="Radius"
						value={Math.round(options.lightRadius * 100)}
						min={2}
						max={40}
						step={1}
						unit="%"
						onChange={(v) => setOption('lightRadius', v / 100)}
					/>
				</>
			);
			break;
		case 'stamp':
			controls = (
				<div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
					<span style={{ font: `12px ${T.sans}`, color: T.sub }}>Object</span>
					<span
						style={{
							font: `600 12.5px ${T.sans}`,
							color: T.ink,
							padding: '5px 10px',
							borderRadius: 7,
							border: `1px solid ${T.bd}`,
							background: T.raised,
						}}
					>
						{options.stampAsset.replace(/^prop:/, '')}
					</span>
					<button
						type="button"
						onClick={() => editor.setDock('assets')}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 5,
							padding: '5px 10px',
							borderRadius: 7,
							border: `1px solid ${T.accBd}`,
							background: T.accSub,
							color: T.acc,
							cursor: 'pointer',
							font: `12px ${T.sans}`,
						}}
					>
						<Icon name="tool-stamp" size={13} /> Choose…
					</button>
				</div>
			);
			break;
		case 'scatter':
			controls = (
				<>
					<SegmentedControl
						ariaLabel="Scatter object"
						value={options.scatterObject}
						onChange={(v: string) => setOption('scatterObject', v)}
						options={SCATTER_SETS.map((s) => ({ value: s.id, label: s.label }))}
					/>
					<NumberControl
						label="Density"
						value={Math.round(options.scatterDensity * 100)}
						min={5}
						max={100}
						step={5}
						unit="%"
						onChange={(v) => setOption('scatterDensity', v / 100)}
					/>
				</>
			);
			break;
		case 'fog':
			controls = (
				<>
					<SegmentedControl
						ariaLabel="Fog mode"
						value={options.fogMode}
						onChange={(v: string) => setOption('fogMode', v as typeof options.fogMode)}
						options={[
							{ value: 'reveal', label: 'Reveal' },
							{ value: 'conceal', label: 'Conceal' },
						]}
					/>
					<SegmentedControl
						ariaLabel="Fog shape"
						value={options.fogShape}
						onChange={(v: string) => setOption('fogShape', v as typeof options.fogShape)}
						options={[
							{ value: 'rect', label: 'Rect' },
							{ value: 'polygon', label: 'Polygon' },
							{ value: 'stroke', label: 'Brush' },
						]}
					/>
					{/* The fog BRUSH reads `brushSize` (EditorCanvas passes it as `fogBrushRadius`) and the
					    `[` / `]` keys mutate it, but this bar never rendered it — so the size changed with
					    no readout anywhere and the only feedback was the painted result. Same control as
					    the terrain brush and the eraser, because it is literally the same option. */}
					{options.fogShape === 'stroke' && (
						<NumberControl
							label="Size"
							value={options.brushSize}
							min={5}
							max={200}
							step={1}
							onChange={(v) => setOption('brushSize', v)}
						/>
					)}
					<NumberControl
						label="Feather"
						value={Math.round(options.fogFeather * 100)}
						min={0}
						max={20}
						step={1}
						unit="%"
						onChange={(v) => setOption('fogFeather', v / 100)}
					/>
				</>
			);
			break;
		case 'text':
			controls = (
				<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
					<span style={{ font: `12px ${T.sans}`, color: T.sub }}>Label</span>
					<Input
						value={options.labelText}
						placeholder="Type the label, then click the map"
						aria-label="Label text"
						onChange={(e: { target: { value: string } }) => setOption('labelText', e.target.value)}
						style={{ width: 220 }}
					/>
				</label>
			);
			break;
		case 'poi':
			controls = visControl;
			break;
		case 'token':
		case 'route':
			controls = visControl;
			break;
		default:
			controls = null;
	}

	return (
		<div
			role="group"
			aria-label={`${def?.label ?? 'Tool'} options`}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '8px 14px',
				borderBottom: `1px solid ${T.bd}`,
				background: T.surf,
				flexWrap: 'wrap',
				minHeight: 46,
			}}
		>
			<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
				<Icon name={def?.icon ?? 'tool-select'} size={15} color={T.acc} />
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap' }}>
					{def?.label ?? tool}
				</span>
			</span>
			<span style={{ width: 1, height: 22, background: T.bd }} aria-hidden />
			{controls ?? <span style={{ font: `12px ${T.sans}`, color: T.ter }}>{def?.hint}</span>}
		</div>
	);
}

function TerrainSelect({ editor }: { editor: MapEditorApi }) {
	return (
		<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub }}>Terrain</span>
			<Select
				value={editor.options.terrainStyle}
				aria-label="Terrain style"
				options={TERRAIN_STYLES.map((s) => ({ value: s.id, label: s.label }))}
				onChange={(e: { target: { value: string } }) =>
					editor.setOption('terrainStyle', e.target.value)
				}
				style={{ minWidth: 150 }}
			/>
		</label>
	);
}
