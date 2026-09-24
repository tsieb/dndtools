import { getProp, type SceneVisibility } from '@dndtools/core';
import { Icon, Input, SegmentedControl, Select } from '../../ds';
import { useI18n } from '../../i18n';
import { T } from '../screen-kit';
import { PropGlyph } from './dock/AssetsPanel';
import { DOOR_KINDS, propLabel, SCATTER_SETS, VIS_TEXT_KEY } from './mapVocab';
import {
	ClearAreasButton,
	ClearFogButton,
	NumberControl,
	SnapMenu,
	TerrainSelect,
} from './ToolOptionControls';
import {
	AOE_TOOL_KIND,
	ROUTE_PACE_LABELS,
	STAMP_ROTATION,
	STAMP_SIZE_PERCENT,
	TEMPLATE_ROTATION,
	TEMPLATE_SIZE,
	templateKindTurns,
	TOOLS_BY_ID,
} from './tools';
import type { MapEditorApi } from './useMapEditor';

export function ToolOptionsBar({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	/** Live-region announcer for the bar's own destructive action (RC-MAP-3.9's "Clear all fog"). */
	announce?: (message: string) => void;
}) {
	const { t } = useI18n();
	const { tool, options, setOption } = editor;
	const def = TOOLS_BY_ID.get(tool);

	const visControl = (
		<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
			<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.new')}</span>
			<Select
				value={options.newVisibility}
				aria-label={t('toolOptions.newVisibility')}
				options={(['dm-only', 'player-visible', 'shared'] as const).map((v) => ({
					value: v,
					label: t(VIS_TEXT_KEY[v]),
				}))}
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
							label={t('toolOptions.size')}
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
					label={t('toolOptions.size')}
					value={options.brushSize}
					min={5}
					max={200}
					step={1}
					onChange={(v) => setOption('brushSize', v)}
				/>
			);
			break;
		case 'room':
			// The Room tool fills with `options.terrainStyle` (`EditorCanvas.tsx`'s `room` branch), but
			// its options bar showed only snapping — so the single option that decides what colour the
			// room comes out was invisible under the tool that uses it, and the only way to change it
			// was to arm Brush or Fill first. Same shape as the fog brush-size gap fixed by run #8.
			controls = (
				<>
					<TerrainSelect editor={editor} />
					<SnapMenu editor={editor} />
				</>
			);
			break;
		case 'wall':
			controls = <SnapMenu editor={editor} />;
			break;
		case 'door':
			controls = (
				<SegmentedControl
					ariaLabel={t('toolOptions.doorType')}
					value={options.doorKind}
					onChange={(v: string) => setOption('doorKind', v as typeof options.doorKind)}
					options={DOOR_KINDS.map((d) => ({ value: d.id, label: t(d.label) }))}
				/>
			);
			break;
		case 'water':
			controls = (
				<SegmentedControl
					ariaLabel={t('toolOptions.waterType')}
					value={options.waterKind}
					onChange={(v: string) => setOption('waterKind', v as typeof options.waterKind)}
					options={[
						{ value: 'river', label: t('toolOptions.water.river') },
						{ value: 'lake', label: t('toolOptions.water.lake') },
					]}
				/>
			);
			break;
		case 'light':
			controls = (
				<>
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
						<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.colour')}</span>
						<input
							type="color"
							aria-label={t('toolOptions.lightColour')}
							value={options.lightColor}
							onChange={(e) => setOption('lightColor', e.target.value)}
							style={{
								width: 34,
								height: 28,
								border: `1px solid ${T.bd}`,
								borderRadius: 'var(--radius-sm)',
								background: 'none',
								padding: 'var(--space-0)',
							}}
						/>
					</label>
					<NumberControl
						label={t('toolOptions.radius')}
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
		case 'stamp': {
			// RC-MAP-3.1 — the armed object reads as itself: its own catalogue glyph and localized name,
			// not the raw id with the `prop:` filed off (which showed a DM "double-doors").
			const armed = getProp(options.stampAsset);
			controls = (
				<div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.object')}</span>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 'var(--space-1-5)',
							font: `600 12.5px ${T.sans}`,
							color: T.ink,
							padding: 'var(--space-1) var(--space-2)',
							borderRadius: 'var(--radius-md)',
							border: `1px solid ${T.bd}`,
							background: T.raised,
						}}
					>
						{armed && <PropGlyph glyph={armed.glyph} size={14} color={T.sub} />}
						{armed ? propLabel(armed, t) : options.stampAsset.replace(/^prop:/, '')}
					</span>
					<button
						type="button"
						onClick={() => editor.setDock('assets')}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 'var(--space-1)',
							padding: 'var(--space-1) var(--space-2)',
							borderRadius: 'var(--radius-md)',
							border: `1px solid ${T.accBd}`,
							background: T.accSub,
							color: T.acc,
							cursor: 'pointer',
							font: `12px ${T.sans}`,
						}}
					>
						<Icon name="tool-stamp" size={13} /> {t('toolOptions.choose')}
					</button>
					<NumberControl
						label={t('toolOptions.rotation')}
						value={options.stampRotation}
						min={STAMP_ROTATION.min}
						max={STAMP_ROTATION.max}
						step={STAMP_ROTATION.step}
						unit="°"
						width={130}
						onChange={(v) => setOption('stampRotation', v)}
					/>
					<NumberControl
						label={t('toolOptions.stampSize')}
						value={Math.round(options.stampScale * 100)}
						min={STAMP_SIZE_PERCENT.min}
						max={STAMP_SIZE_PERCENT.max}
						step={STAMP_SIZE_PERCENT.step}
						unit="%"
						width={130}
						onChange={(v) => setOption('stampScale', v / 100)}
					/>
				</div>
			);
			break;
		}
		case 'scatter':
			controls = (
				<>
					<SegmentedControl
						ariaLabel={t('toolOptions.scatterObject')}
						value={options.scatterObject}
						onChange={(v: string) => setOption('scatterObject', v)}
						options={SCATTER_SETS.map((set) => ({ value: set.id, label: t(set.label) }))}
					/>
					<NumberControl
						label={t('toolOptions.density')}
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
						ariaLabel={t('toolOptions.fogMode')}
						value={options.fogMode}
						onChange={(v: string) => setOption('fogMode', v as typeof options.fogMode)}
						options={[
							{ value: 'reveal', label: t('toolOptions.fog.reveal') },
							{ value: 'conceal', label: t('toolOptions.fog.conceal') },
						]}
					/>
					<SegmentedControl
						ariaLabel={t('toolOptions.fogShape')}
						value={options.fogShape}
						onChange={(v: string) => setOption('fogShape', v as typeof options.fogShape)}
						options={[
							{ value: 'rect', label: t('toolOptions.fogShape.rect') },
							{ value: 'polygon', label: t('toolOptions.fogShape.polygon') },
							{ value: 'stroke', label: t('toolOptions.fogShape.stroke') },
						]}
					/>
					{/* The fog BRUSH reads `brushSize` (EditorCanvas passes it as `fogBrushRadius`) and the
					    `[` / `]` keys mutate it, but this bar never rendered it — so the size changed with
					    no readout anywhere and the only feedback was the painted result. Same control as
					    the terrain brush and the eraser, because it is literally the same option. */}
					{options.fogShape === 'stroke' && (
						<NumberControl
							label={t('toolOptions.size')}
							value={options.brushSize}
							min={5}
							max={200}
							step={1}
							onChange={(v) => setOption('brushSize', v)}
						/>
					)}
					<NumberControl
						label={t('toolOptions.feather')}
						value={Math.round(options.fogFeather * 100)}
						min={0}
						max={20}
						step={1}
						unit="%"
						onChange={(v) => setOption('fogFeather', v / 100)}
					/>
					<ClearFogButton editor={editor} announce={announce} />
				</>
			);
			break;
		case 'text':
			controls = (
				<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
					<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.label')}</span>
					<Input
						value={options.labelText}
						placeholder={t('toolOptions.labelPlaceholder')}
						aria-label={t('toolOptions.labelText')}
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
			controls = visControl;
			break;
		// RC-MAP-3.7 — name the route before drawing it, and pick the pace the status bar measures it
		// at. Pace is a lens on the drawn line, not a property of it, so it applies to the SELECTED
		// route immediately as well as to the next one.
		case 'route':
			controls = (
				<>
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
						<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.name')}</span>
						<Input
							value={options.routeName}
							placeholder={t('toolOptions.routeNamePlaceholder')}
							aria-label={t('toolOptions.routeName')}
							onChange={(e: { target: { value: string } }) =>
								setOption('routeName', e.target.value)
							}
							style={{ width: 200 }}
						/>
					</label>
					<label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
						<span style={{ font: `12px ${T.sans}`, color: T.sub }}>{t('toolOptions.pace')}</span>
						<Select
							value={options.travelPace}
							aria-label={t('toolOptions.travelPace')}
							options={editor.travelPaces.map((pace) => ({
								value: pace.key,
								label: t('toolOptions.paceOption', {
									pace: t(ROUTE_PACE_LABELS[pace.key]),
									distance: pace.distancePerDay,
									unit: pace.unit,
								}),
							}))}
							onChange={(e: { target: { value: string } }) =>
								setOption('travelPace', e.target.value as typeof options.travelPace)
							}
							style={{ minWidth: 190 }}
						/>
					</label>
					{visControl}
				</>
			);
			break;
		// RC-MAP-2.2 — the Combat group. Move carries only snapping (where the token lands is the
		// question, and the grid answers it); the four area tools carry the two numbers a DM reads off
		// the spell — how big, and which way it points — plus a way to take the areas back off the
		// board, so placing one is never a one-way door.
		case 'combat-move':
			controls = <SnapMenu editor={editor} />;
			break;
		case 'aoe-sphere':
		case 'aoe-cone':
		case 'aoe-line':
		case 'aoe-cube':
			controls = (
				<>
					<NumberControl
						label={t('toolOptions.areaSize')}
						value={options.templateSize}
						min={TEMPLATE_SIZE.min}
						max={TEMPLATE_SIZE.max}
						step={TEMPLATE_SIZE.step}
						unit={editor.map?.scale?.unit ?? undefined}
						onChange={(v) => setOption('templateSize', v)}
					/>
					{templateKindTurns(AOE_TOOL_KIND.get(tool) ?? 'sphere') && (
						<NumberControl
							label={t('toolOptions.areaRotation')}
							value={options.templateRotation}
							min={TEMPLATE_ROTATION.min}
							max={TEMPLATE_ROTATION.max}
							step={TEMPLATE_ROTATION.step}
							unit="°"
							width={120}
							onChange={(v) => setOption('templateRotation', v)}
						/>
					)}
					<ClearAreasButton editor={editor} announce={announce} />
				</>
			);
			break;
		default:
			controls = null;
	}

	return (
		<div
			role="group"
			aria-label={t('toolOptions.groupLabel', {
				tool: def ? t(def.label) : t('toolOptions.tool'),
			})}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-2) var(--space-3)',
				borderBottom: `1px solid ${T.bd}`,
				background: T.surf,
				flexWrap: 'wrap',
				minHeight: 46,
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					minWidth: 0,
				}}
			>
				<Icon name={def?.icon ?? 'tool-select'} size={15} color={T.acc} />
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink, whiteSpace: 'nowrap' }}>
					{def ? t(def.label) : tool}
				</span>
			</span>
			<span style={{ width: 1, height: 22, background: T.bd }} aria-hidden />
			{controls ?? (
				<span style={{ font: `12px ${T.sans}`, color: T.ter }}>{def ? t(def.hint) : null}</span>
			)}
		</div>
	);
}

export { clearAllFogOps } from './ToolOptionControls';
