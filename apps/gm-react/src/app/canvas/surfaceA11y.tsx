import { useCallback, useRef, useState } from 'react';
import { useI18n, type MessageKey } from '../../i18n';
import { srOnly } from '../screen-kit';
import type { SectionLayoutRegion } from '@dndtools/core';
import type { ArrangeAction, Box, DragGuides as DragGuideSet } from './geometry';

/**
 * RC-UX-2.2 — the screen-reader contract every widget surface shares: the GM Screen (`/board`), the
 * free scene canvas (`/scene/:id`) and the scene editor's flow layout.
 *
 * ROLE. A surface is `role="application"` only while its layout is being EDITED. That is when the
 * canvas owns the arrow keys (Space picks a tile up, arrows move it, Shift+arrows resize it), and
 * browse mode would otherwise eat every one of them. In VIEW mode the same surface is a labelled
 * `region`: a DM reading the board wants NVDA/VoiceOver to walk the widget content the normal way,
 * and `application` would switch that off for no gain.
 *
 * NAME. Surface + count ("GM Screen, 6 widgets"), so the size of what is behind the Tab stop is
 * known before entering it — and changes audibly when a widget is added or removed.
 *
 * LIST PATH. The frames themselves are the non-visual list: DOM order is the core's reading order
 * (`useReadingOrder`), so Tab walks every widget, and each frame's name carries its title, type and
 * (while editing) its position. No widget is reachable only by pointing.
 *
 * Copy is English-only, the convention the rest of this directory (`WidgetFrame`, `FlowBoard`) keeps.
 *
 * Below the contract are the surface-level pieces drawn over the board rather than in a tile: the
 * multi-selection arrange toolbar, the marquee, the drag guides and the section bands (moved here
 * from `WidgetFrame.tsx` in RC-CAN-8.3 to keep that file under the 800-line limit).
 */

/** The layout policy a surface renders under: the bounded GM Screen, a free scene canvas, or a
 *  scene's flow layout. */
export type CanvasSurfaceKind = 'bounded' | 'canvas' | 'flow';

const SURFACE_NAME: Record<CanvasSurfaceKind, { view: string; edit: string }> = {
	bounded: { view: 'GM Screen', edit: 'GM Screen layout editor' },
	canvas: { view: 'Scene canvas', edit: 'Scene layout editor' },
	flow: { view: 'Scene layout', edit: 'Scene layout editor' },
};

export const widgetCount = (n: number) => `${n} ${n === 1 ? 'widget' : 'widgets'}`;

export function canvasSurfaceProps(kind: CanvasSurfaceKind, editing: boolean, count: number) {
	const name = SURFACE_NAME[kind][editing ? 'edit' : 'view'];
	return {
		role: editing ? ('application' as const) : ('region' as const),
		'aria-label': `${name}, ${widgetCount(count)}`,
	};
}

/** Announcement copy for the canvas operations that had no voice before RC-UX-2.2. */
export const OPERATION_TEXT = {
	moved: (title: string, x: number, y: number) => `${title}, moved to ${x}, ${y}`,
	resized: (title: string, w: number, h: number) => `${title}, size ${w} by ${h}`,
	picked: (title: string) =>
		`${title} selected. Arrows move it, Shift with arrows resizes it, Escape puts it down.`,
	dropped: (title: string) => `${title} put down.`,
};

export interface OperationNotice {
	seq: number;
	text: string;
}

/** One message at a time; `seq` re-keys the node so an identical repeat still announces. */
export function useOperationNotice() {
	const [notice, setNotice] = useState<OperationNotice | null>(null);
	const seq = useRef(0);
	const announce = useCallback((text: string) => {
		seq.current += 1;
		setNotice({ seq: seq.current, text });
	}, []);
	return [notice, announce] as const;
}

/**
 * The permanent polite region the operations above speak through. Permanent so the region is in the
 * accessibility tree before the first message: a region inserted with its text already inside is
 * routinely dropped by screen readers.
 */
export function OperationLiveRegion({
	notice,
	testId,
}: {
	notice: OperationNotice | null;
	testId: string;
}) {
	return (
		<div data-testid={testId} aria-live="polite" aria-atomic="true" style={srOnly}>
			{notice && <span key={notice.seq}>{notice.text}</span>}
		</div>
	);
}

interface ArrangeButton {
	action: ArrangeAction;
	short: MessageKey;
	full: MessageKey;
	keys: string;
	/** Tiles the action needs before it can do anything. */
	min: number;
}

const ARRANGE_BUTTONS: ArrangeButton[] = [
	['left', 'A'],
	['center', 'H'],
	['right', 'D'],
	['top', 'W'],
	['middle', 'V'],
	['bottom', 'S'],
].map(([mode, key]) => ({
	action: { kind: 'align', mode } as ArrangeAction,
	short: `boardCanvas.arrange.${mode}` as MessageKey,
	full: `boardCanvas.arrange.${mode}Full` as MessageKey,
	keys: `Alt+${key}`,
	min: 2,
}));
ARRANGE_BUTTONS.push(
	{
		action: { kind: 'distribute', axis: 'horizontal' },
		short: 'boardCanvas.arrange.distributeH',
		full: 'boardCanvas.arrange.distributeHFull',
		keys: 'Alt+Shift+H',
		min: 3,
	},
	{
		action: { kind: 'distribute', axis: 'vertical' },
		short: 'boardCanvas.arrange.distributeV',
		full: 'boardCanvas.arrange.distributeVFull',
		keys: 'Alt+Shift+V',
		min: 3,
	},
	{
		action: { kind: 'layer', move: 'forward' },
		short: 'boardCanvas.arrange.forward',
		full: 'boardCanvas.arrange.forwardFull',
		keys: 'Control+]',
		min: 1,
	},
	{
		action: { kind: 'layer', move: 'backward' },
		short: 'boardCanvas.arrange.backward',
		full: 'boardCanvas.arrange.backwardFull',
		keys: 'Control+[',
		min: 1,
	},
);

/**
 * RC-CAN-3.6 — the multi-selection toolbar: align, distribute, layer and group, each also a
 * shortcut (`geometry.ts` `arrangeShortcut`). A real toolbar of buttons, so every arrange action is
 * reachable without a pointer AND without memorising a chord. Buttons a selection this small cannot
 * use are disabled rather than hidden, so the bar does not reflow under the cursor.
 */
export function ArrangeBar({
	count,
	grouped,
	policy,
	onAction,
}: {
	count: number;
	grouped: boolean;
	policy: 'bounded' | 'canvas';
	onAction: (action: ArrangeAction) => void;
}) {
	const { t } = useI18n();
	const buttons: ArrangeButton[] = [
		...ARRANGE_BUTTONS,
		grouped
			? {
					action: { kind: 'ungroup' },
					short: 'boardCanvas.arrange.ungroup',
					full: 'boardCanvas.arrange.ungroupFull',
					keys: 'Control+Shift+G',
					min: 1,
				}
			: {
					action: { kind: 'group' },
					short: 'boardCanvas.arrange.group',
					full: 'boardCanvas.arrange.groupFull',
					keys: 'Control+G',
					min: 2,
				},
	];
	return (
		<div
			role="toolbar"
			aria-label={t('boardCanvas.arrange.toolbar', { count })}
			data-testid="canvas-arrange-bar"
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				position: 'absolute',
				...(policy === 'bounded' ? { top: 12, left: 12 } : { top: 16, left: 16 }),
				maxWidth: 'calc(100% - 24px)',
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: 'var(--space-1)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				boxShadow: 'var(--shadow-lg)',
				zIndex: 1,
			}}
		>
			{buttons.map((button) => (
				<button
					key={button.short}
					type="button"
					aria-label={t(button.full)}
					aria-keyshortcuts={button.keys}
					title={`${t(button.full)} (${button.keys})`}
					disabled={count < button.min}
					onClick={() => onAction(button.action)}
					style={{
						minHeight: 28,
						border: 'none',
						borderRadius: 'var(--radius-sm)',
						padding: '0 var(--space-2)',
						background: 'transparent',
						color:
							count < button.min ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
						font: '600 var(--text-xs) var(--font-sans)',
						cursor: count < button.min ? 'default' : 'pointer',
					}}
				>
					{t(button.short)}
				</button>
			))}
		</div>
	);
}

/** RC-CAN-3.6 — the marquee rectangle, in board coordinates inside the canvas transform layer. */
export function Marquee({ box }: { box: Box }) {
	return (
		<div
			data-testid="canvas-marquee"
			aria-hidden
			style={{
				position: 'absolute',
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				border: '1px dashed var(--color-accent)',
				background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
				pointerEvents: 'none',
				zIndex: 100000,
			}}
		/>
	);
}

/**
 * RC-CAN-8.3 — the snap guides and distance hints drawn while a tile is dragged, in board units
 * inside the canvas transform layer. Lines and labels are divided by `scale` so they stay one
 * screen pixel thin and readable at Fit.
 */
export function DragGuides({ guides, gaps, scale }: DragGuideSet & { scale: number }) {
	const line = `${1 / scale}px dashed var(--color-accent)`;
	return (
		<div
			aria-hidden
			data-testid="canvas-drag-guides"
			style={{ position: 'absolute', zIndex: 100000 }}
		>
			{guides.map((g) => (
				<span
					key={`${g.axis}${g.at}`}
					data-guide={g.axis}
					style={{
						position: 'absolute',
						...(g.axis === 'x'
							? { left: g.at, top: g.from, height: g.to - g.from, borderLeft: line }
							: { top: g.at, left: g.from, width: g.to - g.from, borderTop: line }),
					}}
				/>
			))}
			{gaps.map((gap) => (
				<span
					key={`${gap.axis}${gap.from}`}
					data-gap={gap.distance}
					style={{
						position: 'absolute',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						...(gap.axis === 'x'
							? { left: gap.from, top: gap.at, width: gap.distance, borderTop: line }
							: { top: gap.from, left: gap.at, height: gap.distance, borderLeft: line }),
					}}
				>
					<span
						style={{
							padding: '0 var(--space-1)',
							borderRadius: 'var(--radius-sm)',
							background: 'var(--color-accent)',
							color: 'var(--color-accent-foreground)',
							font: '600 var(--text-2xs) var(--font-sans)',
							whiteSpace: 'nowrap',
							transform: `scale(${1 / scale})`,
						}}
					>
						{Math.round(gap.distance)}
					</span>
				</span>
			))}
		</div>
	);
}

/** The scene's named sections, drawn under the tiles; never a pointer target. */
export function SectionBands({ sections }: { sections: readonly SectionLayoutRegion[] }) {
	return sections.map((section) => (
		<div
			key={section.id}
			data-testid={`scene-section-${section.id}`}
			role="region"
			aria-label={section.name}
			style={{
				position: 'absolute',
				left: section.bounds.x,
				top: section.bounds.y,
				width: section.bounds.w,
				height: section.bounds.h,
				pointerEvents: 'none',
				border: '1px solid var(--color-border-strong)',
				background: 'color-mix(in srgb, var(--color-surface) 35%, transparent)',
			}}
		>
			<div
				style={{
					padding: 'var(--space-1) var(--space-2)',
					background: 'var(--color-surface)',
					color: 'var(--color-text-primary)',
					fontWeight: 600,
				}}
			>
				{section.name}
			</div>
		</div>
	));
}
