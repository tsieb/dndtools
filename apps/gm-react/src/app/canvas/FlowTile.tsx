import { useRef } from 'react';
import { Icon, VisibilityChip } from '../../ds';
import { useI18n } from '../../i18n';
import { boardWidgetPresentation, type BoardWidget, type FlowPlacement } from '../board-helpers';
import { T } from '../screen-kit';
import { NoteFrameContext } from '../widgets/builtin/NoteBody';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot } from '../widgets/WidgetRenderSlot';
import { LIFT_TRANSITION, liftStyle, TileGrip, useHoverLift, WidgetGlyph } from './frameParts';
import { FlowPart, gridColumnOf, gridRowOf } from './FlowPart';
import { FlowTileMenu } from './FlowTileMenu';
import { useLongPress, type MenuHandle } from './menuParts';

// RC-POL-1.2 — the flow grid's tile, out of `FlowBoard.tsx`.

const noop = () => {};

/**
 * One tile in VIEW mode: a bare part as page content, any other tile in its flow frame (not a tab
 * stop here; `FlowBoard` adds its keyboard model to framed tiles). `placement` is null while a bare
 * part draws nothing.
 */
export function FlowViewTile({
	w,
	placement,
	count,
	columns,
	onCommand,
	onBlank,
}: {
	w: BoardWidget;
	placement: FlowPlacement | null;
	count: number;
	columns: number;
	onCommand?: (commandType: string, payload: Record<string, unknown>) => void;
	onBlank: (blank: boolean) => void;
}) {
	if (boardWidgetPresentation(w) === 'bare')
		return (
			<FlowPart placement={placement} onBlank={onBlank}>
				<WidgetRenderSlot widget={w} onCommand={onCommand} />
			</FlowPart>
		);
	if (!placement) return null;
	return (
		<FlowTile
			w={w}
			placement={placement}
			count={count}
			editing={false}
			selected={false}
			resizable={false}
			tabbable={false}
			dragging={false}
			dropSide={null}
			columns={columns}
			registerRef={noop}
			onKeyDown={noop}
			onFocusIn={noop}
			onStartDrag={noop}
			onSelect={noop}
			onMoveTo={noop}
			onSpan={noop}
			onCommand={onCommand}
		/>
	);
}

/** Half the grid gap plus half the indicator: centred in the gap beside the target tile. */
const OUTSIDE = `calc(-1 * ${T.space.two})`;

interface FlowTileProps {
	w: BoardWidget;
	placement: FlowPlacement;
	count: number;
	editing: boolean;
	selected: boolean;
	resizable: boolean;
	tabbable: boolean;
	dragging: boolean;
	/** RC-CAN-8.3: where a dragged tile would land relative to this one, while it is the target. */
	dropSide: 'before' | 'after' | null;
	/** The column count, so a full-row target shows its drop indicator above or below it. */
	columns: number;
	registerRef: (el: HTMLDivElement | null) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
	onFocusIn: () => void;
	onStartDrag: (e: React.PointerEvent) => void;
	onSelect: () => void;
	onMoveTo: (toIndex: number) => void;
	onSpan: (span: number) => void;
	onRemove?: () => void;
	onCommand?: (commandType: string, payload: Record<string, unknown>) => void;
}

export function FlowTile({
	w,
	placement,
	count,
	editing,
	selected,
	resizable,
	tabbable,
	dragging,
	dropSide,
	columns,
	registerRef,
	onKeyDown,
	onFocusIn,
	onStartDrag,
	onSelect,
	onMoveTo,
	onSpan,
	onRemove,
	onCommand,
}: FlowTileProps) {
	const { t } = useI18n();
	const meta = tileMetadataForWidget(w);
	const placeholder = w.status !== 'available';
	const accent = `var(${meta.accentToken})`;
	const menuRef = useRef<MenuHandle | null>(null);
	const press = useLongPress((at) => menuRef.current?.open(at));
	const hover = useHoverLift(editing);
	// Selection, drop target and idle are three different rings, so a keyboard user and a pointer
	// user are told the same thing by the same affordance.
	const ring = dropSide
		? `2px dashed ${T.acc}`
		: selected
			? `2px solid ${T.acc}`
			: /* idle */ undefined;
	return (
		<div
			data-testid={`widget-${w.id}`}
			data-flow-index={placement.index}
			ref={registerRef}
			role="group"
			// Position is announced in EDIT mode only: in view mode a flow screen is just a page of
			// tiles, and "3 of 9" is layout telemetry nobody reading it asked for.
			aria-label={
				editing
					? t('boardCanvas.flow.name', {
							title: w.title,
							type: w.typeLabel,
							index: placement.index + 1,
							count,
						})
					: t('boardCanvas.frame.name', { title: w.title, type: w.typeLabel })
			}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={onKeyDown}
			onFocus={onFocusIn}
			{...hover.handlers}
			// RC-CAN-8.3: a right-click opens the tile menu at the pointer, as a long-press does. A press
			// inside the portalled menu bubbles here through React, so only this tile's own DOM counts.
			onContextMenu={(e) => {
				if (!editing || !e.currentTarget.contains(e.target as Node)) return;
				e.preventDefault();
				menuRef.current?.open({ x: e.clientX, y: e.clientY });
			}}
			className={meta.silhouetteClass}
			style={{
				gridColumn: gridColumnOf(placement),
				gridRow: gridRowOf(placement),
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				padding: T.space.three,
				borderRadius: T.radius.md,
				background: placeholder ? T.sunken : T.raised,
				border: `1px solid ${placeholder ? T.bdS : T.bd}`,
				// Heights follow CONTENT: no height, no maxHeight, and no `overflow:hidden` anywhere on
				// the path to the body — which is what keeps a tile from clipping at a narrow tier.
				minWidth: 0,
				minHeight: w.minSize?.height ?? 0,
				opacity: dragging ? 0.6 : placeholder ? 0.85 : 1,
				...(ring ? { outline: ring } : {}),
				outlineOffset: 2,
				...liftStyle(dragging ? 'drag' : hover.lifted ? 'hover' : 'rest', !!ring),
				transition: editing ? LIFT_TRANSITION : undefined,
			}}
		>
			{/* A BORDER, not a background: forced-colors repaints backgrounds as Canvas but keeps a
			    border and remaps it to CanvasText. Same reasoning as WidgetFrame's rail. */}
			<span
				aria-hidden
				data-testid="tile-accent-rail"
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					bottom: 0,
					width: 0,
					borderLeft: `4px solid ${accent}`,
				}}
			/>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: T.space.two,
					flex: '0 0 auto',
					minWidth: 0,
					// Room for the edit-mode grip and menu trigger.
					...(editing
						? { paddingInlineStart: T.space.three, paddingInlineEnd: T.space.eight }
						: {}),
				}}
			>
				<WidgetGlyph icon={meta.icon} size={16} color={accent} />
				<span
					style={{
						flex: 1,
						minWidth: 0,
						// Sans, not the display face: Cinzel starts at --text-xl (RC-ENG-8.4 emphasis lint).
						font: `700 var(--text-sm) ${T.sans}`,
						color: T.ink,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{w.title}
				</span>
				<VisibilityChip level={w.visibility} byException data-testid="visibility-badge" />
			</div>
			<span
				title={meta.description}
				style={{
					font: `var(--text-2xs) ${T.sans}`,
					letterSpacing: 'var(--tracking-wide)',
					textTransform: 'uppercase',
					color: T.ter,
					flex: '0 0 auto',
				}}
			>
				{w.typeLabel}
			</span>
			<div style={{ flex: 1, minWidth: 0, pointerEvents: editing ? 'none' : 'auto' }}>
				<NoteFrameContext.Provider value={true}>
					<WidgetRenderSlot widget={w} onCommand={editing ? undefined : onCommand} />
				</NoteFrameContext.Provider>
			</div>
			{w.statusNote && (
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: T.space.one,
						font: `600 var(--text-2xs) ${T.sans}`,
						color: 'var(--color-status-warning-text)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="warning" size={12} />
					{w.statusNote}
				</div>
			)}

			{/* The drag surface. It sits UNDER the menu in DOM order so the menu still takes presses. */}
			{editing && (
				<div
					data-testid={`flow-drag-${w.id}`}
					{...press}
					onPointerDown={(e) => {
						// A right press belongs to the context menu: selecting would open the scene
						// editor's Inspector, which takes focus and closes the menu it just opened.
						if (e.button === 2) return;
						press.onPointerDown(e);
						// A finger selects on release instead (see `finish`).
						if (e.pointerType !== 'touch') onSelect();
						onStartDrag(e);
					}}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: T.radius.md,
						cursor: 'grab',
						// A finger has to be able to scroll the screen it is reading; a drag is a
						// deliberate press-and-move, which `pan-y` still delivers as a pointermove. The grip
						// is `none`, so a finger on it drags in any direction — a phone's one column too.
						touchAction: 'pan-y',
						WebkitTouchCallout: 'none',
					}}
				>
					<TileGrip />
				</div>
			)}
			{dropSide && (
				<span
					aria-hidden
					data-testid="flow-drop-indicator"
					data-side={dropSide}
					style={{
						position: 'absolute',
						pointerEvents: 'none',
						background: T.acc,
						borderRadius: T.radius.full,
						// In the middle of the grid gap: a full-row tile is crossed above or below, a tile
						// sharing its row is marked at its leading or trailing edge.
						...(placement.span >= columns
							? {
									left: 0,
									right: 0,
									height: 4,
									[dropSide === 'before' ? 'top' : 'bottom']: OUTSIDE,
								}
							: {
									top: 0,
									bottom: 0,
									width: 4,
									[dropSide === 'before' ? 'left' : 'right']: OUTSIDE,
								}),
					}}
				/>
			)}
			{editing && (
				<FlowTileMenu
					handle={menuRef}
					w={w}
					index={placement.index}
					count={count}
					resizable={resizable}
					onMoveTo={onMoveTo}
					onSpan={onSpan}
					onRemove={onRemove}
				/>
			)}
		</div>
	);
}
