import type { CSSProperties } from 'react';
import { Icon, IconButton, Minimap } from '../../../ds';
import { T } from '../../screen-kit';
import { clamp01 } from '../mapVocab';
import { MapContextMenu } from './MapContextMenu';
import type { MapEditorApi } from '../useMapEditor';

type Pt = { x: number; y: number };

/**
 * RC-STB-2.7 — pure move out of EditorCanvas.tsx (no behaviour change): the zoom cluster + minimap,
 * the measurement readout, the path-tool hint, the party marker, and the context menu were the
 * canvas's HUD overlay layer, painted above the drawing surface but reading none of its gesture
 * state — the largest self-contained slice keeping that file over the file-size gate's grandfathered
 * baseline. All state and handlers still live in EditorCanvas.tsx and are threaded through as props.
 */
export function EditorCanvasHud({
	editor,
	quickMapMode,
	zoom,
	center,
	measureText,
	showPathHint,
	scaledStyle,
	contextMenu,
	onCloseContextMenu,
}: {
	editor: MapEditorApi;
	quickMapMode: boolean;
	zoom: number;
	center: Pt;
	measureText: string | null;
	showPathHint: boolean;
	scaledStyle: CSSProperties;
	contextMenu: { touch: boolean; anchorPx: Pt; mapPt: Pt } | null;
	onCloseContextMenu: () => void;
}) {
	return (
		<>
			{/* HUD: zoom cluster + minimap + measurement readout (above the drawing overlay) */}
			<div
				style={{
					position: 'absolute',
					right: 16,
					// Clears the Minimap below it. That box is `width={160}` at the default 1.4 aspect, so
					// its body is ~114px plus a ~24px header ≈ 138, and it sits at `bottom: 16` — i.e. its
					// top edge is 154px up. The old 150 put the zoom cluster's "100%" readout UNDER the
					// minimap's header on every desktop profile.
					bottom: quickMapMode ? 16 : 170,
					display: 'flex',
					flexDirection: 'column',
					gap: 6,
					zIndex: 6,
				}}
			>
				<IconButton
					icon="zoom-in"
					label={editor.t('atlas.zoomIn')}
					variant="outline"
					size="sm"
					onClick={() => editor.setZoom(Math.min(6, +(zoom + 0.2).toFixed(2)))}
				/>
				<IconButton
					icon="zoom-out"
					label={editor.t('atlas.zoomOut')}
					variant="outline"
					size="sm"
					onClick={() => editor.setZoom(Math.max(0.4, +(zoom - 0.2).toFixed(2)))}
				/>
				<IconButton
					icon="zoom-fit"
					label={editor.t('atlas.fit')}
					variant="outline"
					size="sm"
					onClick={() => {
						editor.setZoom(1);
						editor.setCenter({ x: 0.5, y: 0.5 });
					}}
				/>
				<span
					style={{
						textAlign: 'center',
						padding: '2px 0',
						borderRadius: 7,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)',
						font: `10.5px ${T.mono}`,
						color: T.ink,
					}}
				>
					{Math.round(zoom * 100)}%
				</span>
			</div>
			{!quickMapMode && (
				<div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6 }}>
					<Minimap
						viewport={{
							x: clamp01(center.x - 0.5 / zoom),
							y: clamp01(center.y - 0.5 / zoom),
							w: Math.min(1, 1 / zoom),
							h: Math.min(1, 1 / zoom),
						}}
						onJump={(p: Pt) => editor.setCenter({ x: clamp01(p.x), y: clamp01(p.y) })}
						width={160}
					/>
				</div>
			)}
			{measureText && (
				<div
					style={{
						position: 'absolute',
						left: '50%',
						top: 14,
						transform: 'translateX(-50%)',
						zIndex: 6,
						padding: '5px 12px',
						borderRadius: 8,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)',
						border: `1px solid ${T.accBd}`,
						font: `600 12.5px ${T.mono}`,
						color: T.acc,
					}}
				>
					{measureText}
				</div>
			)}
			{showPathHint && (
				<div
					style={{
						position: 'absolute',
						left: 14,
						bottom: 16,
						zIndex: 6,
						padding: '5px 11px',
						borderRadius: 8,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 82%, transparent)',
						border: `1px solid ${T.bd}`,
						font: `11.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					{editor.t('mapEditor.polygonHint')}
				</div>
			)}

			{/* RC-MAP-2.5 — the party's atlas mark on this map. Read-only here (dragging it is a later
			    story); `pointerEvents: 'none'` keeps it out of every tool's hit-testing. */}
			{editor.partyLocation && (
				<div style={{ ...scaledStyle, zIndex: 3 }}>
					<div
						role="img"
						aria-label={editor.t('mapEditor.partyMarker')}
						style={{
							position: 'absolute',
							left: `${editor.partyLocation.x * 100}%`,
							top: `${editor.partyLocation.y * 100}%`,
							transform: 'translate(-50%, -100%)',
						}}
					>
						<div
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 26,
								height: 26,
								borderRadius: '50% 50% 50% 0',
								transform: 'rotate(-45deg)',
								background: 'var(--color-accent)',
								color: 'var(--color-text-inverse)',
								border: '2px solid rgba(255,255,255,0.7)',
								boxShadow: 'var(--shadow-md)',
							}}
						>
							<span style={{ transform: 'rotate(45deg)', display: 'inline-flex' }}>
								<Icon name="pin" size={13} />
							</span>
						</div>
					</div>
				</div>
			)}

			{/* RC-MAP-2.5 — the canvas context menu: right-click on desktop, long-press sheet on touch. */}
			{contextMenu && (
				<MapContextMenu
					open
					touch={contextMenu.touch}
					anchor={contextMenu.anchorPx}
					onClose={onCloseContextMenu}
					onMarkPartyHere={() => void editor.markPartyHere(contextMenu.mapPt)}
				/>
			)}
		</>
	);
}
