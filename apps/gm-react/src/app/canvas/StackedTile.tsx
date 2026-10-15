import { useId, type KeyboardEvent } from 'react';
import { Button, Icon, IconButton } from '../../ds';
import { useI18n } from '../../i18n';
import {
	frameName,
	isWidgetResizable,
	visibilityChip,
	widgetSizePresets,
	type BoardWidget,
} from '../board-helpers';
import type { SceneBoardCanvasProps } from '../SceneBoardModel';
import { useDirection } from '../useViewport';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';
import { TileActionMenu } from './TileActionMenu';
import type { LayoutHistory } from './useLayoutHistory';
import { WidgetGlyph } from './frameParts';
import {
	BODY,
	CHIP_PLAYERS,
	CONTENT,
	DISCLOSURE,
	EDIT_CONTROLS,
	HEADER,
	HEADING,
	HEADING_ROW,
	RAIL,
	STATUS_NOTE,
	TILE,
	TITLE,
	TOUCH_TARGET,
} from './stackedStyles';

// RC-POL-1.2 — the stacked board's tile and its size presets, out of `StackedBoard.tsx`.

/** The header's height, which is also its touch target (`--space-12`). */
const HEADER_PX = 48;
/** However short a tile was authored, its body keeps enough room to show something. */
const MIN_BODY_PX = 120;

export interface StackedTileProps {
	selected?: boolean;
	history?: LayoutHistory;
	editControls?: import('react').ReactNode;
	widget: BoardWidget;
	open: boolean;
	fullScreen: boolean;
	hidden: boolean;
	onToggle: () => void;
	onFullScreen: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
	onCommand?: WidgetCommandHandler;
}

export function StackedTile({
	widget: w,
	selected,
	editControls,
	history,
	open,
	fullScreen,
	hidden,
	onToggle,
	onFullScreen,
	onKeyDown,
	onCommand,
}: StackedTileProps) {
	const { t } = useI18n();
	const dir = useDirection();
	const uid = useId();
	const headingId = `${uid}-title`;
	const bodyId = `${uid}-body`;
	const meta = tileMetadataForWidget(w);
	const chip = visibilityChip(w.visibility);
	const accent = `var(${meta.accentToken})`;
	const placeholder = w.status !== 'available';
	const showBody = open || fullScreen;
	// The authored height, less the header, so a tile keeps the proportions it has on the canvas.
	const bodyHeight = Math.max(w.h - HEADER_PX, MIN_BODY_PX);

	const identity = (
		<>
			<WidgetGlyph icon={meta.icon} size={16} color={accent} />
			<span style={TITLE}>{w.title}</span>
			{w.visibility !== 'dm-only' && (
				<span style={CHIP_PLAYERS}>
					<Icon name={chip.players ? 'visibility-players' : 'dm-only'} size={11} />
					{t(chip.label)}
				</span>
			)}
		</>
	);

	return (
		<div
			role="group"
			aria-labelledby={editControls ? undefined : headingId}
			aria-label={editControls ? frameName(w, { editing: true, selected }, t) : undefined}
			data-testid={`widget-${w.id}`}
			data-stacked-tile=""
			tabIndex={editControls ? 0 : undefined}
			className={meta.silhouetteClass}
			onKeyDown={onKeyDown}
			style={{
				...TILE,
				...(selected ? { outline: '2px solid var(--color-accent)' } : {}),
				// `display` rather than the `hidden` attribute, which an inline `display` would override.
				// The tile stays MOUNTED while another is full screen, so its widget keeps its state.
				display: hidden ? 'none' : 'flex',
				flex: fullScreen ? '1 1 auto' : '0 0 auto',
				background: placeholder ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
				border: `1px solid ${placeholder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
			}}
		>
			{/* A BORDER, not a background, for the same reason as WidgetFrame's rail: forced-colors
			    mode repaints backgrounds as Canvas but keeps a border. */}
			<span
				aria-hidden
				data-testid="tile-accent-rail"
				style={{ ...RAIL, borderInlineStart: `4px solid ${accent}` }}
			/>
			<div
				style={{
					...HEADER,
					borderBottom: showBody ? '1px solid var(--color-border)' : 'none',
				}}
			>
				<h3 style={HEADING}>
					{fullScreen ? (
						<span id={headingId} style={HEADING_ROW}>
							{identity}
						</span>
					) : (
						<button
							type="button"
							id={headingId}
							aria-expanded={open}
							aria-controls={bodyId}
							onClick={onToggle}
							style={{ ...HEADING_ROW, ...DISCLOSURE }}
						>
							<Icon
								name={open ? 'chevron-down' : dir === 'rtl' ? 'chevron-left' : 'chevron-right'}
								size="sm"
							/>
							{identity}
						</button>
					)}
				</h3>
				{editControls ? (
					<span style={{ width: 44, flexShrink: 0 }} />
				) : (
					<IconButton
						icon={fullScreen ? 'minimize-2' : 'maximize-2'}
						label={
							fullScreen
								? t('atlas.collapseMap', { name: w.title })
								: t('atlas.expandMap', { name: w.title })
						}
						variant="ghost"
						data-stacked-fullscreen={w.id}
						onClick={onFullScreen}
						style={TOUCH_TARGET}
					/>
				)}
			</div>
			{editControls && (
				<TileActionMenu
					handle={null}
					w={w}
					scale={1}
					resizable={false}
					entityName={null}
					history={history}
				/>
			)}
			{selected && (
				<span
					data-testid="tile-selection-chip"
					style={{
						padding: 'var(--space-1)',
						color: 'var(--color-accent-foreground)',
						background: 'var(--color-accent)',
						font: 'var(--text-xs) var(--font-sans)',
					}}
				>
					{w.title}
				</span>
			)}
			{editControls}
			<div
				id={bodyId}
				data-testid="stacked-tile-body"
				style={{
					...BODY,
					display: showBody ? 'flex' : 'none',
					...(fullScreen ? { flex: '1 1 auto' } : { height: bodyHeight }),
				}}
			>
				<div style={CONTENT}>
					<WidgetRenderSlot widget={w} onCommand={onCommand} />
				</div>
				{w.statusNote && (
					<div style={STATUS_NOTE}>
						<Icon name="warning" size={12} />
						{w.statusNote}
					</div>
				)}
			</div>
		</div>
	);
}

export function TileSizePresets({
	widget,
	onResize,
}: {
	widget: BoardWidget;
	onResize?: SceneBoardCanvasProps['onResize'];
}) {
	const { t } = useI18n();
	if (!onResize || !isWidgetResizable(widget)) return null;
	return (
		<div
			role="group"
			aria-label={t('boardArrange.size', { name: widget.title })}
			style={EDIT_CONTROLS}
		>
			{widgetSizePresets(widget, true, false).map((size, i) => (
				<Button
					key={i}
					size="sm"
					aria-pressed={widget.w === size.w && widget.h === size.h}
					onClick={() => void onResize(widget.id, size.w, size.h)}
				>
					{t((['boardArrange.small', 'boardArrange.medium', 'boardArrange.large'] as const)[i])}
				</Button>
			))}
		</div>
	);
}
