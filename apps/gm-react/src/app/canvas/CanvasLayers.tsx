import type { CSSProperties, ReactNode } from 'react';
import type { SectionLayoutRegion } from '@dndtools/core';
import { useI18n } from '../../i18n';
import { srOnly } from '../screen-kit';
import { GRID, ZOOM_PRESET_KEY } from '../SceneBoardModel';
import type { Box, DragGuides as DragGuideSet } from './geometry';
import { DragGuides, Marquee, SectionBands } from './surfaceA11y';
import type { ZoomNotice } from './useCanvasZoom';
import type { LayoutHistory } from './useLayoutHistory';

// RC-POL-1.2 — the layers `SceneBoardCanvas` draws around its frames, out of that file.

type Extent = { width: number; height: number };

/** The canvas element's own box: the scroll and gesture rules of each policy. */
export function canvasSurfaceStyle(
	policy: 'bounded' | 'canvas',
	overflowsHorizontally: boolean,
): CSSProperties {
	return {
		position: 'relative',
		flex: 1,
		minHeight: 0,
		background: 'var(--color-bg)',
		// RC-CAN-3.1: Fit stops at `FIT_FLOOR`, and Comfortable/Detail are deliberately bigger
		// than the pane on a narrow window — so the bounded board scrolls sideways to the rest
		// of the layout instead of scaling it away.
		overflowX: overflowsHorizontally ? 'auto' : 'hidden',
		overflowY: policy === 'bounded' ? 'auto' : 'hidden',
		cursor: policy === 'canvas' ? 'grab' : 'default',
		// The bounded board deliberately overflows vertically. Let a finger pan that scroll
		// region; `none` turns a mobile GM Screen into a desktop-only scrollbar workflow.
		// Free-canvas scenes retain their gesture ownership for drag/pan/zoom interactions.
		touchAction: policy === 'bounded' ? (overflowsHorizontally ? 'pan-x pan-y' : 'pan-y') : 'none',
		borderRadius: 'var(--radius-lg)',
		border: '1px solid var(--color-border)',
	};
}

/** The scene's own surface under the tiles, sized to the scrolled extent on the bounded board. */
export function CanvasBackdrop({
	policy,
	theme,
	background,
	tx,
	ty,
	scale,
	extent,
}: {
	policy: 'bounded' | 'canvas';
	theme: string | undefined;
	background: string;
	tx: number;
	ty: number;
	scale: number;
	extent: Extent;
}) {
	return (
		<div
			data-testid="scene-background"
			data-theme={theme}
			style={{
				position: 'absolute',
				inset: 0,
				minWidth: policy === 'bounded' ? tx + extent.width * scale : undefined,
				minHeight: policy === 'bounded' ? ty + extent.height * scale : undefined,
				background: background === 'paper' ? 'var(--color-surface-raised)' : 'var(--color-bg)',
				pointerEvents: 'none',
			}}
		/>
	);
}

/** The transformed layer the frames sit in: the edit grid, section bands, marquee and guides. */
export function CanvasStage({
	measured,
	policy,
	tx,
	ty,
	scale,
	extent,
	showGrid,
	sections,
	marquee,
	guides,
	children,
}: {
	/** False until the pane is measured: see the `display` note below. */
	measured: boolean;
	policy: 'bounded' | 'canvas';
	tx: number;
	ty: number;
	scale: number;
	extent: Extent;
	showGrid: boolean;
	sections: SectionLayoutRegion[];
	marquee: Box | null;
	guides: (DragGuideSet & { id: string }) | null;
	children: ReactNode;
}) {
	return (
		<div
			style={
				{
					position: 'absolute',
					left: 0,
					top: 0,
					transformOrigin: '0 0',
					transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
					// Bare number: `.scene-board-operation` divides its touch target by it.
					'--scene-board-scale': String(scale),
					// The tiles mount before the pane is measured, and the fit scale that reading sets
					// restyles every one of them (their text sizes divide by it). Kept out of style until
					// then, a cold board computes its tiles' styles once (RC-ENG-3.2).
					display: measured ? undefined : 'none',
					minWidth: policy === 'bounded' ? extent.width : '100%',
					height: policy === 'bounded' ? extent.height : undefined,
				} as CSSProperties
			}
		>
			{showGrid && (
				<div
					style={{
						position: 'absolute',
						// Bounded covers only its own extent: an oversized sheet inside its scroll
						// container ballooned /board's scrollHeight. The free canvas keeps the sheet.
						...(policy === 'bounded'
							? { inset: 0 }
							: { left: -2000, top: -2000, width: 6000, height: 6000 }),
						backgroundImage: 'radial-gradient(var(--color-border-strong) 1px, transparent 1px)',
						backgroundSize: `${GRID}px ${GRID}px`,
						pointerEvents: 'none',
					}}
				/>
			)}
			<SectionBands sections={sections} />
			{children}
			{marquee && <Marquee box={marquee} />}
			{guides && <DragGuides {...guides} scale={scale} />}
		</div>
	);
}

/**
 * Permanent live regions: announced by CONTENT changing, never by a region being inserted (screen
 * readers drop those). Re-keying on `seq` repeats an identical announcement. RC-CAN-3.1: zoom steps
 * announce in a bare `aria-live`, since there is one `status` per canvas.
 */
export function CanvasAnnouncements({
	history,
	zoomNotice,
}: {
	history?: LayoutHistory;
	zoomNotice: ZoomNotice | null;
}) {
	const { t } = useI18n();
	return (
		<>
			{history && (
				<div role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
					{history.announcement && (
						<span key={history.announcement.seq}>{history.announcement.text}</span>
					)}
				</div>
			)}
			<div aria-live="polite" aria-atomic="true" style={srOnly}>
				{zoomNotice && (
					<span key={zoomNotice.seq}>
						{t('boardCanvas.zoomAnnouncement', {
							preset: t(ZOOM_PRESET_KEY[zoomNotice.preset]),
							percent: zoomNotice.percent,
						})}
					</span>
				)}
			</div>
		</>
	);
}
