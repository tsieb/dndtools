import type { LayoutHistory } from './useLayoutHistory';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTER_ENTITY_TYPE, CONTENT_ITEM_ENTITY_TYPE, type CoreCommand } from '@dndtools/core';
import { Button, Icon, IconButton, Menu, Toaster } from '../../ds';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../platform/escapeLayers';
import { useRuntime } from '../../runtime/RuntimeContext';
import {
	FLOW_AUTHORING_TIER,
	FLOW_COLUMNS,
	FLOW_PANEL_MARGIN,
	FLOW_SPAN_PRESETS,
	flowPanelPosition,
	flowSpanOf,
	visibilityChip,
	type BoardWidget,
} from '../board-helpers';
import { T } from '../screen-kit';
import { GRID } from '../SceneBoardModel';
import {
	bindingSlot,
	sceneInstance,
	settingsFields,
	TileBindDialog,
	TileConfigureDialog,
} from './TileDialogs';

/** Density-sized, so the tile-menu trigger meets the touch floor on the profiles that ask for one. */
export const TRIGGER_SIZE = 'var(--density-touch-target, 1.75rem)';
const MENU_WIDTH = 248;

/** Tile-menu copy — English-only for now, like WidgetFrame's BINDING_GLYPH. */
const TEXT = {
	actions: (title: string) => `Actions for ${title}`,
	duplicated: (title: string) => `Duplicated ${title}`,
	move: 'Move',
	resize: 'Resize',
	resizeLocked: 'Resize (size is locked)',
	duplicate: 'Duplicate',
	bind: 'Bind…',
	configure: 'Configure…',
	configureNone: 'Configure… (no settings)',
	visibility: 'Visibility',
	remove: 'Remove',
};

/** A bound tile's source, by the same hash deep links the map body, Graph and character cards use. */
const SOURCE_LINK: Record<string, readonly [label: string, route: string]> = {
	map: ['Open map', '#/atlas?map='],
	[CHARACTER_ENTITY_TYPE]: ['Open character', '#/characters/'],
	[CONTENT_ITEM_ENTITY_TYPE]: ['Open note', '#/knowledge/'],
};

const VISIBILITY_ICON: Record<string, string> = {
	'dm-only': 'dm-only',
	shared: 'visibility-shared',
	'player-visible': 'visibility-players',
};

/** Flow's tile-menu copy (`FlowTileMenu`), English-only like `TEXT`. */
const FLOW_TEXT = {
	actions: (title: string) => `Actions for ${title}`,
	moveToStart: 'Move to start',
	moveBack: 'Move back',
	moveForward: 'Move forward',
	moveToEnd: 'Move to end',
	width: 'Width',
	remove: 'Remove',
};

const SEPARATOR = { height: 1, margin: 'var(--space-1) 0', background: 'var(--color-border)' };

/** A duplicate lands a grid step below the lowest tile sharing the source's columns, at the source's
 *  x: never on top of another tile, never past the bounded board's right edge. Everything else about
 *  the copy the core reads from its own scene (`scene.duplicate-widget`). */
function duplicatePosition(
	widgets: readonly { layout: { x: number; y: number; w: number; h: number } }[],
	{ x, y, w, h }: { x: number; y: number; w: number; h: number },
) {
	let bottom = y + h;
	for (const { layout: l } of widgets) {
		if (l.x < x + w && x < l.x + l.w) bottom = Math.max(bottom, l.y + l.h);
	}
	return { x, y: bottom + GRID };
}

function focusWhenMounted(widgetId: string, tries = 30) {
	const frame = document.querySelector<HTMLElement>(`[data-testid="widget-${widgetId}"]`);
	if (frame) frame.focus();
	else if (tries > 0) requestAnimationFrame(() => focusWhenMounted(widgetId, tries - 1));
}

/** Entering the submenu lands on its checked option; leaving it returns to the row that opened it. */
const firstSubItem = (sub: HTMLElement | null) =>
	sub?.querySelector<HTMLElement>('[aria-checked="true"]') ??
	sub?.querySelector<HTMLElement>('[role^="menuitem"]');
const focusParent = (sub: HTMLElement | null) =>
	sub?.parentElement?.querySelector<HTMLElement>('[data-submenu-parent]')?.focus();

interface RowProps {
	label: string;
	icon?: string;
	parent?: boolean;
	expanded?: boolean;
	checked?: boolean;
	disabled?: boolean;
	keys?: string;
	onSelect: () => void;
}

function MenuRow(p: RowProps) {
	return (
		<Button
			variant="ghost"
			size="sm"
			icon={p.icon}
			iconRight={p.parent ? 'chevron-right' : p.checked ? 'check' : undefined}
			role={p.checked === undefined ? 'menuitem' : 'menuitemradio'}
			aria-checked={p.checked}
			aria-haspopup={p.parent ? 'menu' : undefined}
			aria-expanded={p.parent ? p.expanded : undefined}
			aria-disabled={p.disabled || undefined}
			aria-keyshortcuts={p.keys}
			aria-label={p.label}
			data-submenu-parent={p.parent || undefined}
			tabIndex={-1}
			onClick={() => {
				if (!p.disabled) p.onSelect();
			}}
			style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
		>
			<span style={{ flex: 1 }}>{p.label}</span>
		</Button>
	);
}

/** A viewport point: where a right-click or a long-press landed. */
export interface Point {
	x: number;
	y: number;
}

/** What a frame holds to open its tile menu: under the trigger, or at a pointer (RC-CAN-8.3). */
export interface MenuHandle {
	open: (at?: Point) => void;
}

/** How long a still finger has to rest on a tile before its menu opens, and how far it may drift. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;

/**
 * RC-CAN-8.3 — a touch held still on a tile opens its menu at the finger, the touch counterpart of a
 * right-click. Spread the handlers on the drag surface; `onPointerDown` must run before the board
 * starts its own gesture. When the press fires it takes the gesture over the way the browser does
 * when a touch becomes a scroll: it raises `pointercancel` on the window, and both boards abandon a
 * drag on that event, so the tile stays where it was.
 */
export function useLongPress(onPress: (at: Point) => void) {
	const timer = useRef<number | undefined>(undefined);
	const origin = useRef<Point>({ x: 0, y: 0 });
	const clear = () => window.clearTimeout(timer.current);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	return {
		onPointerDown: (e: React.PointerEvent) => {
			clear();
			if (e.pointerType !== 'touch') return;
			origin.current = { x: e.clientX, y: e.clientY };
			timer.current = window.setTimeout(() => {
				window.dispatchEvent(new Event('pointercancel'));
				onPress(origin.current);
			}, LONG_PRESS_MS);
		},
		onPointerMove: (e: React.PointerEvent) => {
			const { x, y } = origin.current;
			if (Math.hypot(e.clientX - x, e.clientY - y) > LONG_PRESS_SLOP) clear();
		},
		onPointerUp: clear,
		onPointerCancel: clear,
	};
}

interface TileMenuProps {
	history?: LayoutHistory;
	handle: React.Ref<MenuHandle>;
	w: BoardWidget;
	scale: number;
	resizable: boolean;
	entityName: string | null;
}

/**
 * RC-CAN-2.4 — the tile's `…` menu, in edit mode. Move and Resize select the tile as Enter does
 * (arrows then move it, Shift+arrows resize it) and Remove is Delete: re-issued as keys on the frame,
 * the host's CANVAS-016 handler and Delete's undo toast stay their one owner. Duplicate is the core's
 * `scene.duplicate-widget`. Bind… opens a picker of the entities the definition's binding slot takes;
 * Configure… opens the Inspector on the scene editor and a settings dialog on the board, which has
 * none. WAI-ARIA menu button: Enter/Space/↓ on the trigger or Shift+F10 on the frame open it;
 * ↑/↓/Home/End move; →, ← and Escape enter and leave the Visibility submenu; Escape closes and returns
 * focus; Tab closes and moves on. Portalled to <body>, because inside the canvas's transform layer no
 * z-index can lift it over the canvas's own zoom and history clusters. RC-CAN-8.3: a right-click or a
 * long-press on the tile opens the same menu at the pointer (`MenuHandle.open(at)`).
 */
export function TileActionMenu({
	handle,
	w,
	scale,
	resizable,
	entityName,
	history,
}: TileMenuProps) {
	const runtime = useRuntime();
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const subRef = useRef<HTMLDivElement | null>(null);
	// The trigger's rect, or a zero-size rect at the pointer (`at`) for a right-click or long-press.
	const [box, setBox] = useState<{
		top: number;
		bottom: number;
		left: number;
		right: number;
		at: boolean;
	} | null>(null);
	const [subOpen, setSubOpen] = useState(false);
	const [dialog, setDialog] = useState<'bind' | 'configure' | null>(null);
	const label = TEXT.actions(w.title);
	const show = (at?: Point) => {
		setSubOpen(false);
		const rect = anchorRef.current?.getBoundingClientRect();
		if (at) setBox({ top: at.y, bottom: at.y, left: at.x, right: at.x, at: true });
		else
			setBox(
				rect
					? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, at: false }
					: null,
			);
	};
	useImperativeHandle(handle, () => ({ open: show }));
	const close = () => setBox(null);
	const widgetDefs = runtime.state.widgets;
	const bindable = useMemo(() => !!bindingSlot(widgetDefs, w.type), [widgetDefs, w.type]);

	// A fixed panel cannot follow a scrolling canvas, so a scroll anywhere dismisses it — except the
	// panel's own, which a capped-height menu does when focus walks to a row below its fold.
	useEffect(() => {
		if (!box) return;
		const dismiss = (e: Event) => {
			if (e.target instanceof Element && e.target.closest('[data-testid="tile-actions-menu"]'))
				return;
			setBox(null);
		};
		window.addEventListener('scroll', dismiss, true);
		return () => window.removeEventListener('scroll', dismiss, true);
	}, [box]);

	// While open, the submenu claims Escape from the Popover around it (escapeLayers), so Escape
	// steps back one level instead of closing everything.
	useEffect(() => {
		if (!subOpen || !box) return;
		firstSubItem(subRef.current)?.focus();
		const token = pushEscapeLayer(() => subRef.current);
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || !ownsEscape(token)) return;
			e.stopPropagation();
			focusParent(subRef.current);
			setSubOpen(false);
		};
		document.addEventListener('keydown', onKey, true);
		return () => {
			document.removeEventListener('keydown', onKey, true);
			popEscapeLayer(token);
		};
	}, [subOpen, box]);

	function onMenuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
		// Nothing typed inside the menu is a canvas shortcut: `1` must not zoom, Ctrl+Z must not undo.
		e.stopPropagation();
		const target = e.target as HTMLElement;
		if (e.key === 'Tab') {
			// Hand the Tab on from the trigger, so focus continues past it rather than from <body>.
			(anchorRef.current?.firstElementChild as HTMLElement | null)?.focus();
			return close();
		}
		const inSub = !!subRef.current?.contains(target);
		const items = Array.from(
			e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
		).filter((item) => !!subRef.current?.contains(item) === inSub);
		const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
		const at = items.indexOf(target);
		if (e.key === 'ArrowDown') focusAt(at + 1);
		else if (e.key === 'ArrowUp') focusAt(at - 1);
		else if (e.key === 'Home') focusAt(0);
		else if (e.key === 'End') focusAt(items.length - 1);
		else if (e.key === 'ArrowRight' && target.dataset.submenuParent) {
			if (subOpen) firstSubItem(subRef.current)?.focus();
			else setSubOpen(true);
		} else if (e.key === 'ArrowLeft' && inSub) {
			focusParent(subRef.current);
			setSubOpen(false);
		} else return;
		e.preventDefault();
	}

	/** Re-issue a key on the frame, so the host's own handler stays the owner of the operation. */
	function viaFrame(key: 'Enter' | ' ' | 'Delete') {
		const frame = anchorRef.current?.parentElement;
		close();
		frame?.focus();
		frame?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	}

	/** Focus the frame first: the Dialog returns focus to whatever held it when it opened. */
	function openDialog(kind: 'bind' | 'configure') {
		const frame = anchorRef.current?.parentElement;
		close();
		frame?.focus();
		setDialog(kind);
	}

	async function run(command: Parameters<typeof runtime.dispatch>[0]) {
		const result = await runtime.dispatch(command);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
		return result;
	}

	// Allocate the identity before dispatch so the existing history can build an exact inverse.
	async function duplicate() {
		close();
		const found = sceneInstance(runtime.state, w.id);
		if (!found) return;
		const copyId = runtime.newId();
		const command: CoreCommand = {
			type: 'scene.duplicate-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId: found.scene.id,
				widgetInstanceId: w.id,
				position: duplicatePosition(found.scene.widgets, found.instance.layout),
				copyId,
			},
		};
		const ok = history
			? await history.run(command, TEXT.duplicated(w.title))
			: (await run(command)).status === 'accepted';
		if (!ok) return;
		Toaster.success(TEXT.duplicated(w.title));
		focusWhenMounted(copyId);
	}

	function setVisibility(visibility: string) {
		close();
		const found = sceneInstance(runtime.state, w.id);
		if (!found) return;
		void run({
			type: 'scene.configure-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId: found.scene.id,
				widgetInstanceId: w.id,
				configuration: { ...found.instance.configuration, visibility },
			},
		});
	}

	const ref = w.bindingRef;
	const source = ref && entityName ? SOURCE_LINK[ref.entityType] : undefined;
	// Only the scene editor mounts an Inspector for a selection; /board gets the settings dialog.
	const onSceneEditor = globalThis.location.hash.startsWith('#/scene/');
	const configurable = onSceneEditor || settingsFields(w).length > 0;
	// Right-aligned to the trigger, clamped to the layout viewport as the DS Popover clamps itself.
	// It opens on the roomier side and scrolls inside that room: on a phone the open Visibility
	// group made it taller than the space under a tile near the top, leaving its last rows unreachable.
	const vp = document.documentElement;
	const below = vp.clientHeight - (box?.bottom ?? 0);
	const panelStyle = box && {
		position: 'fixed',
		// A trigger's menu hangs right-aligned under it; a pointer's opens rightwards from the point.
		left: Math.max(
			8,
			Math.min(box.at ? box.left : box.right - MENU_WIDTH, vp.clientWidth - MENU_WIDTH - 8),
		),
		...(below >= box.top
			? { top: box.bottom + 4, maxHeight: below - 12 }
			: { bottom: vp.clientHeight - box.top + 4, maxHeight: box.top - 12 }),
		overflowY: 'auto' as const,
	};

	return (
		<div
			ref={anchorRef}
			// A press here must not reach the canvas, which would clear the selection or start a pan.
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				position: 'absolute',
				top: 6,
				right: 6,
				// Held at screen size, like the selection chip: at Fit a 1:1 trigger is half a fingertip.
				transform: `scale(${1 / scale})`,
				transformOrigin: 'top right',
			}}
		>
			<IconButton
				icon="more"
				label={label}
				variant="outline"
				size="sm"
				aria-haspopup="menu"
				aria-expanded={!!box}
				data-testid="tile-actions-trigger"
				onClick={() => (box ? close() : show())}
				onKeyDown={(e: React.KeyboardEvent) => {
					if (e.key !== 'ArrowDown') return;
					e.preventDefault();
					show();
				}}
				style={{ width: TRIGGER_SIZE, height: TRIGGER_SIZE }}
			/>
			{panelStyle &&
				createPortal(
					<Menu
						title={label}
						triggerRef={anchorRef}
						onClose={close}
						width={MENU_WIDTH}
						data-testid="tile-actions-menu"
						onKeyDown={onMenuKeyDown}
						style={panelStyle}
					>
						<MenuRow
							icon="move"
							label={TEXT.move}
							keys="ArrowUp ArrowDown ArrowLeft ArrowRight"
							onSelect={() => viaFrame(' ')}
						/>
						<MenuRow
							icon="zoom-fit"
							label={resizable ? TEXT.resize : TEXT.resizeLocked}
							keys={resizable ? 'Shift+ArrowRight Shift+ArrowDown' : undefined}
							disabled={!resizable}
							onSelect={() => viaFrame(' ')}
						/>
						<MenuRow icon="duplicate" label={TEXT.duplicate} onSelect={() => void duplicate()} />
						<div role="separator" style={SEPARATOR} />
						{bindable && (
							<MenuRow icon="link" label={TEXT.bind} onSelect={() => openDialog('bind')} />
						)}
						<MenuRow
							icon="settings-gear"
							label={configurable ? TEXT.configure : TEXT.configureNone}
							disabled={!configurable}
							onSelect={() => {
								if (onSceneEditor) viaFrame('Enter');
								else if (configurable) openDialog('configure');
							}}
						/>
						<div role="none">
							<MenuRow
								icon="eye"
								label={TEXT.visibility}
								parent
								expanded={subOpen}
								onSelect={() => setSubOpen(!subOpen)}
							/>
							{subOpen && (
								<div
									ref={subRef}
									role="menu"
									aria-label={TEXT.visibility}
									style={{ paddingLeft: 'var(--space-4)' }}
								>
									{Object.keys(VISIBILITY_ICON).map((value) => (
										<MenuRow
											key={value}
											icon={VISIBILITY_ICON[value]}
											label={visibilityChip(value).label}
											checked={w.visibility === value}
											onSelect={() => setVisibility(value)}
										/>
									))}
								</div>
							)}
						</div>
						{ref && source && (
							<MenuRow
								icon="enter"
								label={source[0]}
								onSelect={() => {
									close();
									globalThis.location.hash = `${source[1]}${encodeURIComponent(ref.entityId)}`;
								}}
							/>
						)}
						<div role="separator" style={SEPARATOR} />
						<MenuRow
							icon="trash"
							label={TEXT.remove}
							keys="Delete"
							onSelect={() => viaFrame('Delete')}
						/>
					</Menu>,
					document.body,
				)}
			{dialog &&
				createPortal(
					// A portal still bubbles through the React tree: without this, typing in a dialog
					// field would reach the frame (arrows move the tile, Delete removes it) and the canvas
					// (`1` zooms). The Dialog's own Escape and Tab trap listen on `document`, unaffected.
					<div onKeyDown={(e) => e.stopPropagation()}>
						{dialog === 'bind' ? (
							<TileBindDialog w={w} onClose={() => setDialog(null)} />
						) : (
							<TileConfigureDialog w={w} onClose={() => setDialog(null)} />
						)}
					</div>,
					document.body,
				)}
		</div>
	);
}

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
	const label = FLOW_TEXT.actions(w.title);
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
								label={FLOW_TEXT.moveToStart}
								disabled={index === 0}
								onSelect={() => run(() => onMoveTo(0))}
							/>
							<FlowMenuRow
								icon="arrow-left"
								label={FLOW_TEXT.moveBack}
								disabled={index === 0}
								onSelect={() => run(() => onMoveTo(index - 1))}
							/>
							<FlowMenuRow
								icon="arrow-right"
								label={FLOW_TEXT.moveForward}
								disabled={index >= count - 1}
								onSelect={() => run(() => onMoveTo(index + 1))}
							/>
							<FlowMenuRow
								icon="arrow-down"
								label={FLOW_TEXT.moveToEnd}
								disabled={index >= count - 1}
								onSelect={() => run(() => onMoveTo(count - 1))}
							/>
							<div
								role="group"
								aria-label={FLOW_TEXT.width}
								style={{
									borderTop: `1px solid ${T.bd}`,
									marginTop: T.space.one,
									paddingTop: T.space.one,
								}}
							>
								{FLOW_SPAN_PRESETS.map((preset) => (
									<FlowMenuRow
										key={preset.label}
										label={preset.label}
										checked={authoredSpan === preset.span}
										disabled={!resizable}
										onSelect={() => run(() => onSpan(preset.span))}
									/>
								))}
							</div>
							{onRemove && (
								<div style={{ borderTop: `1px solid ${T.bd}`, marginTop: T.space.one }}>
									<FlowMenuRow
										icon="trash"
										label={FLOW_TEXT.remove}
										onSelect={() => run(onRemove)}
									/>
								</div>
							)}
						</Menu>
					</div>,
					document.body,
				)}
		</div>
	);
}
