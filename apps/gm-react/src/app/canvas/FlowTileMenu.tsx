import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton, Menu } from '../../ds';
import { useI18n } from '../../i18n';
import {
	FLOW_AUTHORING_TIER,
	FLOW_COLUMNS,
	FLOW_PANEL_MARGIN,
	FLOW_SPAN_PRESETS,
	flowPanelPosition,
	flowSpanOf,
	type BoardWidget,
} from '../board-helpers';
import { T } from '../screen-kit';
import { useEditWidget } from '../../screens/extensions/useEditWidget';
import type { MenuHandle, Point } from './menuParts';

// RC-POL-1.2 — the flow grid's tile menu, out of `TileActionMenu.tsx`.

const FLOW_MENU_WIDTH = 224;
/** The grid a durable span is measured against, at every tier. See {@link flowPresetSpan}. */
export const AUTHORING_COLUMNS = FLOW_COLUMNS[FLOW_AUTHORING_TIER];

interface FlowMenuRowProps {
	label: string;
	icon?: string;
	checked?: boolean;
	disabled?: boolean;
	onSelect: () => void;
}

function FlowMenuRow({ label, icon, checked, disabled, onSelect }: FlowMenuRowProps) {
	return (
		<button
			type="button"
			role={checked === undefined ? 'menuitem' : 'menuitemradio'}
			aria-checked={checked === undefined ? undefined : checked}
			aria-disabled={disabled || undefined}
			disabled={disabled}
			onClick={() => {
				if (!disabled) onSelect();
			}}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: T.space.two,
				width: '100%',
				padding: T.space.two,
				border: 'none',
				borderRadius: T.radius.sm,
				background: checked ? T.accSub : 'transparent',
				color: disabled ? T.ter : T.ink,
				font: `var(--text-sm) ${T.sans}`,
				textAlign: 'start',
				cursor: disabled ? 'default' : 'pointer',
			}}
		>
			{icon && <Icon name={icon} size="sm" />}
			<span style={{ flex: 1, minWidth: 0 }}>{label}</span>
			{checked && <Icon name="check" size="sm" />}
		</button>
	);
}

interface FlowTileMenuProps {
	handle: React.Ref<MenuHandle>;
	w: BoardWidget;
	index: number;
	count: number;
	resizable: boolean;
	onMoveTo: (toIndex: number) => void;
	onSpan: (span: number) => void;
	onRemove?: () => void;
}

/**
 * The tile's own action menu. It is PORTALLED and positioned from the trigger's viewport rect: the
 * grid is a real `overflow:auto` scroll region, so an in-flow panel on the last row would have been
 * clipped by it — the same reason `TileActionMenu` portals.
 */
export function FlowTileMenu({
	handle,
	w,
	index,
	count,
	resizable,
	onMoveTo,
	onSpan,
	onRemove,
}: FlowTileMenuProps) {
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	// The tile's DURABLE span, not `placement.span`: the placement is clamped to the current tier and
	// stretched when the tile lands alone in a row, so checking against it would tick the wrong row —
	// and at phone, where every placement is span 1, it would tick EVERY row at once.
	const authoredSpan = flowSpanOf(w, AUTHORING_COLUMNS);
	const [box, setBox] = useState<{ top: number; left: number } | null>(null);
	const edit = useEditWidget(w.id, w.type);
	const { t } = useI18n();
	const label = t('boardCanvas.tileMenu.actions', { title: w.title });
	const close = () => setBox(null);
	// Under the trigger, or at the pointer for a right-click or long-press (RC-CAN-8.3).
	const show = (at?: Point) => {
		const rect = anchorRef.current?.getBoundingClientRect();
		if (at) setBox({ top: at.y, left: at.x });
		else if (rect)
			setBox({ top: rect.bottom + 4, left: Math.max(8, rect.right - FLOW_MENU_WIDTH) });
	};
	useImperativeHandle(handle, () => ({ open: show }));
	const run = (action: () => void) => {
		close();
		action();
	};
	// Measure the panel once it exists and pull it back on screen — see {@link flowPanelPosition}.
	useLayoutEffect(() => {
		const el = panelRef.current;
		if (!box || !el) return;
		const root = document.documentElement;
		const next = flowPanelPosition(box, el.getBoundingClientRect(), {
			width: root.clientWidth,
			height: root.clientHeight,
		});
		if (Math.abs(next.top - box.top) > 0.5 || Math.abs(next.left - box.left) > 0.5) setBox(next);
	}, [box]);
	return (
		<div ref={anchorRef} style={{ position: 'absolute', top: T.space.two, right: T.space.two }}>
			<IconButton
				icon="more"
				label={label}
				variant="outline"
				size="sm"
				aria-haspopup="menu"
				aria-expanded={!!box}
				data-testid="flow-tile-actions"
				onClick={() => (box ? close() : show())}
			/>
			{box &&
				createPortal(
					// `Menu`/`Popover` are not ref-forwarding, and `Popover` keeps its own root ref for
					// outside-press dismissal, so the measured element is this wrapper rather than the panel.
					<div
						ref={panelRef}
						style={{
							position: 'fixed',
							top: box.top,
							left: box.left,
							zIndex: 'var(--z-overlay)',
							// Taller than the screen (a short viewport, a phone in landscape): scroll the rows
							// rather than cropping them — `Popover`'s own root is `overflow: hidden`.
							maxHeight: `calc(100dvh - ${FLOW_PANEL_MARGIN * 2}px)`,
							overflowY: 'auto',
						}}
					>
						<Menu
							title={label}
							triggerRef={anchorRef}
							onClose={close}
							width={FLOW_MENU_WIDTH}
							data-testid="flow-tile-menu"
						>
							<FlowMenuRow
								icon="arrow-up"
								label={t('boardCanvas.flow.moveToStart')}
								disabled={index === 0}
								onSelect={() => run(() => onMoveTo(0))}
							/>
							<FlowMenuRow
								icon="arrow-left"
								label={t('boardCanvas.flow.moveBack')}
								disabled={index === 0}
								onSelect={() => run(() => onMoveTo(index - 1))}
							/>
							<FlowMenuRow
								icon="arrow-right"
								label={t('boardCanvas.flow.moveForward')}
								disabled={index >= count - 1}
								onSelect={() => run(() => onMoveTo(index + 1))}
							/>
							<FlowMenuRow
								icon="arrow-down"
								label={t('boardCanvas.flow.moveToEnd')}
								disabled={index >= count - 1}
								onSelect={() => run(() => onMoveTo(count - 1))}
							/>
							<div
								role="group"
								aria-label={t('boardCanvas.flow.width')}
								style={{
									borderTop: `1px solid ${T.bd}`,
									marginTop: T.space.one,
									paddingTop: T.space.one,
								}}
							>
								{FLOW_SPAN_PRESETS.map((preset) => (
									<FlowMenuRow
										key={preset.labelKey}
										label={t(preset.labelKey)}
										checked={authoredSpan === preset.span}
										disabled={!resizable}
										onSelect={() => run(() => onSpan(preset.span))}
									/>
								))}
							</div>
							{edit.available && (
								<div style={{ borderTop: `1px solid ${T.bd}`, marginTop: T.space.one }}>
									<FlowMenuRow
										icon="edit"
										label={t('boardCanvas.tileMenu.edit')}
										onSelect={() => run(() => void edit.open())}
									/>
								</div>
							)}
							{onRemove && (
								<div style={{ borderTop: `1px solid ${T.bd}`, marginTop: T.space.one }}>
									<FlowMenuRow
										icon="trash"
										label={t('boardCanvas.tileMenu.remove')}
										onSelect={() => run(onRemove)}
									/>
								</div>
							)}
						</Menu>
					</div>,
					document.body,
				)}
			{edit.editor}
		</div>
	);
}
