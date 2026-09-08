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
