import { Button } from '../../ds';
import { ZoomBtn } from './WidgetFrame';
import { useI18n } from '../../i18n';
import { ZOOM_PRESETS, ZOOM_PRESET_KEY, type ZoomPreset } from '../SceneBoardModel';

/**
 * The free canvas's zoom cluster: continuous −/+ around the live percentage, then the three named
 * RC-CAN-3.1 steps it can always be brought back to.
 *
 * A pure move out of `SceneBoardCanvas.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). The markup and the labels are unchanged.
 */
export function ZoomCluster({
	scale,
	activePreset,
	onZoom,
	onPreset,
}: {
	scale: number;
	activePreset: ZoomPreset | null;
	onZoom: (factor: number) => void;
	onPreset: (preset: ZoomPreset) => void;
}) {
	const { t } = useI18n();
	return (
		<div
			data-testid="canvas-zoom-presets"
			role="group"
			aria-label={t('boardCanvas.zoomGroup')}
			style={{
				position: 'absolute',
				right: 16,
				bottom: 16,
				display: 'flex',
				alignItems: 'center',
				gap: 2,
				padding: 4,
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				boxShadow: 'var(--shadow-lg)',
			}}
		>
			<ZoomBtn icon="zoom-out" label={t('boardCanvas.zoomOut')} onClick={() => onZoom(1 / 1.2)} />
			<span
				style={{
					font: 'var(--text-2xs) var(--font-mono)',
					color: 'var(--color-text-secondary)',
					minWidth: 38,
					textAlign: 'center',
				}}
			>
				{Math.round(scale * 100)}%
			</span>
			<ZoomBtn icon="zoom-in" label={t('boardCanvas.zoomIn')} onClick={() => onZoom(1.2)} />
			{/* The free canvas keeps its continuous zoom above; the three presets are the
		    anchors it can always be brought back to, and are the same three the bounded
		    board is limited to. */}
			{ZOOM_PRESETS.map((p) => (
				<PresetBtn
					key={p}
					label={t(ZOOM_PRESET_KEY[p])}
					active={activePreset === p}
					onClick={() => onPreset(p)}
				/>
			))}
		</div>
	);
}

/** A named zoom step in the free canvas's cluster. Text, not an icon: "Comfortable" has no glyph,
 *  and the whole point of RC-CAN-3.1 is that the steps are named rather than numeric. */
function PresetBtn({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				height: 28,
				padding: '0 var(--space-2)',
				border: 'none',
				borderRadius: 'var(--radius-sm)',
				font: 'var(--text-2xs) var(--font-sans)',
				background: active ? 'var(--color-accent)' : 'transparent',
				color: active ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
				cursor: 'pointer',
			}}
		>
			{label}
		</button>
	);
}

/**
 * The bounded board's named zoom steps, drawn in the host's toolbar (RC-CAN-3.1) where they cannot
 * scroll away with the canvas they apply to. Moved here from `screens/Board.tsx` (RC-CAN-5.4) so the
 * phone can offer a subset: a phone in edit mode never paints the board at Fit, where tile text
 * would drop under 12px.
 */
export function ZoomPresetGroup({
	value,
	presets = ZOOM_PRESETS,
	onChange,
}: {
	value: ZoomPreset;
	presets?: readonly ZoomPreset[];
	onChange: (preset: ZoomPreset) => void;
}) {
	const { t } = useI18n();
	return (
		<div
			role="group"
			aria-label={t('boardCanvas.zoomGroup')}
			data-testid="board-zoom-presets"
			// Wraps INSIDE the group: at 200% text "Comfortable" alone is a third of a 360px phone, and
			// a group that could only wrap as a unit widened `#main-content`.
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 'var(--space-0-5)',
				flex: '0 1 auto',
				minWidth: 0,
			}}
		>
			{presets.map((preset) => (
				<Button
					key={preset}
					variant={value === preset ? 'primary' : 'ghost'}
					size="sm"
					aria-pressed={value === preset}
					onClick={() => onChange(preset)}
				>
					{t(ZOOM_PRESET_KEY[preset])}
				</Button>
			))}
		</div>
	);
}
