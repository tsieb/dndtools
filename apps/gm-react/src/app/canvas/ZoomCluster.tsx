import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { LayoutHistory } from './useLayoutHistory';
import { srOnly } from '../screen-kit';
import { Button, IconButton } from '../../ds';
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
 * phone board can hold editing at Fit while a touched tile opens in a readable loupe.
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

/** Keep token text at a painted 12px minimum inside the transformed Fit layer at every tier. */
export function FitTextFloor() {
	return (
		<style>{`.board-fit-floor [style*="--scene-board-scale"]:not([style*="--scene-board-scale: 1;"]) {
 --fit-text-min: calc(12px / var(--scene-board-scale));
 ${Object.entries({
		'2xs': 0.625,
		xs: 0.75,
		sm: 0.8125,
		base: 0.9375,
		md: 1.0625,
		lg: 1.25,
		xl: 1.5,
		'2xl': 1.875,
		'3xl': 2.25,
 })
		.map(([name, rem]) => `--text-${name}: max(${rem}rem, calc(12px / var(--scene-board-scale)));`)
		.join('')}
 }`}</style>
	);
}

/** RC-CAN-8.6 — `fitEditing`: a phone arranges its Layout at Fit, with a loupe around the touched
 *  tile, and `fitFloor` lets that Fit go as small as the board needs. The reading zoom is left
 *  alone, so Done returns to it however editing was entered (`?edit=1`). */
export function phoneZoomSteps(
	phone: boolean,
	editing: boolean,
	zoom: ZoomPreset,
	fitEditing = false,
) {
	if (!phone) return { canvas: zoom, pressed: zoom, presets: ZOOM_PRESETS, fitFloor: undefined };
	const reading = zoom === 'fit' ? ('comfortable' as ZoomPreset) : zoom;
	if (editing && fitEditing)
		return {
			canvas: 'fit' as ZoomPreset,
			pressed: 'fit' as ZoomPreset,
			presets: ['fit'] as const,
			fitFloor: 0.01,
		};
	return {
		canvas: reading,
		pressed: editing ? reading : zoom,
		presets: editing ? (['comfortable', 'detail'] as const) : ZOOM_PRESETS,
		fitFloor: undefined,
	};
}

/** History stays available after removing the tile that was open in the phone loupe. */
export function PhoneEditHistory({ history }: { history?: LayoutHistory }) {
	if (!history) return null;
	return (
		<>
			<div data-testid="canvas-history-controls" style={{ display: 'flex', gap: 'var(--space-1)' }}>
				<Button size="sm" disabled={!history.canUndo} onClick={() => void history.undo()}>
					{history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo'}
				</Button>
				<Button size="sm" disabled={!history.canRedo} onClick={() => void history.redo()}>
					{history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : 'Redo'}
				</Button>
			</div>
			<div role="status" style={srOnly}>
				{history.announcement && (
					<span key={history.announcement.seq}>{history.announcement.text}</span>
				)}
			</div>
		</>
	);
}

/** A local magnifier: tile menus and dialogs retain their own focus and escape layers. */
/** Runs `open` after the tap's own click, swallowing that click so it cannot land on what `open` mounts. */
export function useAfterTapClick() {
	const cancel = useRef(() => {});
	useEffect(() => () => cancel.current(), []);
	return useCallback((open: () => void) => {
		cancel.current();
		const run = (event?: Event) => {
			event?.preventDefault();
			event?.stopPropagation();
			cancel.current();
			open();
		};
		const timer = window.setTimeout(run, 500);
		window.addEventListener('click', run, true);
		cancel.current = () => {
			window.clearTimeout(timer);
			window.removeEventListener('click', run, true);
		};
	}, []);
}
export function PhoneEditLoupe({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const trigger = document.activeElement as HTMLElement | null;
		ref.current?.focus();
		return () => {
			if (trigger?.isConnected) trigger.focus();
		};
	}, [open]);
	if (!open) return null;
	return (
		<div
			ref={ref}
			role="region"
			aria-label={title}
			tabIndex={-1}
			onKeyDown={(e) => {
				if (
					e.key === 'Escape' &&
					!e.defaultPrevented &&
					e.currentTarget.contains(e.target as Node)
				) {
					e.stopPropagation();
					onClose();
				}
			}}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 1,
				background: 'var(--color-surface-raised)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-lg)',
				overflow: 'auto',
				padding: 'var(--space-2)',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
				<strong>{title}</strong>
				<IconButton
					icon="close"
					label={t('common.action.close')}
					onClick={onClose}
					style={{ width: 44, height: 44 }}
				/>
			</div>
			{children}
		</div>
	);
}
