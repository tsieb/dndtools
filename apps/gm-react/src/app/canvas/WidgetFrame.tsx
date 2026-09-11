import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	CHARACTER_ENTITY_TYPE,
	CONTENT_ITEM_ENTITY_TYPE,
	type CoreEvent,
	type CoreStateSlice,
} from '@dndtools/core';
import { Button, Icon, IconButton, Menu, Toaster } from '../../ds';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../platform/escapeLayers';
import { useRuntime } from '../../runtime/RuntimeContext';
import { TIER_LABEL, visibilityChip, type BoardWidget } from '../board-helpers';
import { GRID } from '../SceneBoardModel';
import {
	safeBoundEntityName,
	tileBindingState,
	tileMetadataForWidget,
	type TileBindingState,
} from '../widgets/tileMeta';
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';

/**
 * The pieces a scene canvas is DRAWN from: one widget frame, and the two overlay buttons that sit
 * on top of the canvas (undo/redo and zoom).
 *
 * Moved out of `SceneBoardCanvas.tsx` verbatim by RC-ENG-1.1 to bring that file back under the
 * RC-STB-2.7 file-size gate. Nothing here changed behaviour: the frame's markup, its roving
 * tabindex, the forced-colors outline note, and the two overlay buttons are exactly as they were.
 * `WidgetGlyph` came along because the frame renders it; `SceneBoardCanvas` re-exports it so its
 * existing importers (Board, Inspector, AddWidgetPanel) keep their import path.
 */

// Widget definition icons are normally semantic registry keys ('map', 'dice', …). Third-party
// packages created by older builds may still contain an emoji glyph, so retain a decorative legacy
// fallback instead of replacing persisted package content with a broken square.
const isRegistryKey = (icon: string) => /^[a-z0-9-]+$/i.test(icon);

export function WidgetGlyph({
	icon,
	size = 'sm',
	color = 'var(--color-accent)',
}: {
	icon: string;
	size?: 'sm' | 'md' | number;
	color?: string;
}) {
	if (isRegistryKey(icon)) return <Icon name={icon} size={size} color={color} />;
	const px = size === 'md' ? 20 : typeof size === 'number' ? size : 16;
	return (
		<span aria-hidden style={{ fontSize: px, lineHeight: 1, flex: '0 0 auto' }}>
			{icon}
		</span>
	);
}

/** Undo/Redo overlay control. Disabled — not hidden — so the canvas never gains or loses a control
 *  under the user's cursor, and the shortcut and the button always agree about what is available. */
export function HistoryBtn({
	icon,
	label,
	disabled,
	onClick,
}: {
	icon: string;
	label: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 28,
				height: 28,
				border: 'none',
				borderRadius: 'var(--radius-sm)',
				background: 'transparent',
				color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
				cursor: disabled ? 'default' : 'pointer',
				opacity: disabled ? 0.5 : 1,
			}}
		>
			<Icon name={icon} size="sm" />
		</button>
	);
}

/** The zoom cluster's control: the same overlay button, never disabled. */
export function ZoomBtn(props: { icon: string; label: string; onClick: () => void }) {
	return <HistoryBtn {...props} disabled={false} />;
}

/** The header's binding glyph: a word as well as a shape, so no state rests on colour alone. */
const BINDING_GLYPH: Record<TileBindingState, { icon: string; label: string; tone: string }> = {
	bound: { icon: 'link', label: 'Bound', tone: 'var(--color-text-secondary)' },
	unbound: { icon: 'link', label: 'Not bound', tone: 'var(--color-text-secondary)' },
	missing: { icon: 'warning', label: 'Missing', tone: 'var(--color-status-warning-text)' },
	conflicted: { icon: 'warning', label: 'Conflict', tone: 'var(--color-status-warning-text)' },
	hidden: { icon: 'visibility-hidden', label: 'Hidden', tone: 'var(--color-text-secondary)' },
};

/** Density-sized, so the tile-menu trigger meets the touch floor on the profiles that ask for one. */
const TRIGGER_SIZE = 'var(--density-touch-target, 1.75rem)';
const MENU_WIDTH = 248;

/** Tile-menu copy — English-only for now, like BINDING_GLYPH above. */
const TEXT = {
	actions: (title: string) => `Actions for ${title}`,
	duplicated: (title: string) => `Duplicated ${title}`,
	move: 'Move',
	resize: 'Resize',
	resizeLocked: 'Resize (size is locked)',
	duplicate: 'Duplicate',
	configure: 'Configure…',
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

const SEPARATOR = { height: 1, margin: 'var(--space-1) 0', background: 'var(--color-border)' };

type WidgetAdded = Extract<CoreEvent, { kind: 'scene.widget-added' }>;

function sceneInstance(state: CoreStateSlice, widgetId: string) {
	for (const scene of Object.values(state.scenes.scenes)) {
		const instance = scene.widgets.find((candidate) => candidate.id === widgetId);
		if (instance) return { scene, instance };
	}
	return null;
}

/** A duplicate lands below the lowest tile sharing the source's columns, at the source's x and size:
 *  never on top of another tile, never past the bounded board's right edge. */
function duplicateLayout(
	widgets: readonly { layout: { x: number; y: number; w: number; h: number } }[],
	{ x, y, w, h }: { x: number; y: number; w: number; h: number },
) {
	let bottom = y + h;
	for (const { layout: l } of widgets) {
		if (l.x < x + w && x < l.x + l.w) bottom = Math.max(bottom, l.y + l.h);
	}
	return { x, y: bottom + GRID, w, h };
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
			onClick={p.onSelect}
			style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
		>
			<span style={{ flex: 1 }}>{p.label}</span>
		</Button>
	);
}

interface TileMenuProps {
	handle: React.Ref<{ open: () => void }>;
	w: BoardWidget;
	scale: number;
	resizable: boolean;
	entityName: string | null;
}

/**
 * RC-CAN-2.4 — the tile's `…` menu, in edit mode. Move, Resize and Configure select the tile as Enter
 * does (arrows then move it, Shift+arrows resize it, the scene editor opens its Inspector) and Remove
 * is Delete: re-issued as keys on the frame, the host's CANVAS-016 handler and Delete's undo toast
 * stay their one owner. WAI-ARIA menu button: Enter/Space/↓ on the trigger or Shift+F10 on the frame
 * open it; ↑/↓/Home/End move; →, ← and Escape enter and leave the Visibility submenu; Escape closes
 * and returns focus; Tab closes and moves on. Portalled to <body>, because inside the canvas's
 * transform layer no z-index can lift it over the canvas's own zoom and history clusters.
 */
function TileActionMenu({ handle, w, scale, resizable, entityName }: TileMenuProps) {
	const runtime = useRuntime();
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const subRef = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState<DOMRect | null>(null);
	const [subOpen, setSubOpen] = useState(false);
	const label = TEXT.actions(w.title);
	const show = () => {
		setSubOpen(false);
		setBox(anchorRef.current?.getBoundingClientRect() ?? null);
	};
	useImperativeHandle(handle, () => ({ open: show }));
	const close = () => setBox(null);

	// A fixed panel cannot follow a scrolling canvas, so a scroll anywhere dismisses it.
	useEffect(() => {
		if (!box) return;
		const dismiss = () => setBox(null);
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
	function viaFrame(key: 'Enter' | 'Delete') {
		const frame = anchorRef.current?.parentElement;
		close();
		frame?.focus();
		frame?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	}

	async function run(command: Parameters<typeof runtime.dispatch>[0]) {
		const result = await runtime.dispatch(command);
		if (result.status !== 'accepted') Toaster.error(result.rejection.message);
		return result;
	}

	// A minted id is beyond the undo stack (useLayoutHistory); the copy's own Remove is undoable.
	async function duplicate() {
		close();
		const found = sceneInstance(runtime.state, w.id);
		if (!found) return;
		const { scene, instance } = found;
		const result = await run({
			type: 'scene.add-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId: scene.id,
				widget: {
					type: instance.type,
					version: instance.version,
					layout: duplicateLayout(scene.widgets, instance.layout),
					configuration: instance.configuration,
					localState: {},
					binding: instance.binding,
				},
			},
		});
		if (result.status !== 'accepted') return;
		Toaster.success(TEXT.duplicated(w.title));
		const added = result.events.find((e): e is WidgetAdded => e.kind === 'scene.widget-added');
		if (added) focusWhenMounted(added.widgetInstanceId);
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
	// Only the scene editor mounts an Inspector for a selection; /board has none to open.
	const onSceneEditor = globalThis.location.hash.startsWith('#/scene/');
	// Right-aligned to the trigger, clamped to the layout viewport as the DS Popover clamps itself.
	const vp = document.documentElement;
	const panelStyle = box && {
		position: 'fixed',
		left: Math.max(8, Math.min(box.right - MENU_WIDTH, vp.clientWidth - MENU_WIDTH - 8)),
		...(vp.clientHeight - box.bottom >= box.top
			? { top: box.bottom + 4 }
			: { bottom: vp.clientHeight - box.top + 4 }),
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
							onSelect={() => viaFrame('Enter')}
						/>
						<MenuRow
							icon="zoom-fit"
							label={resizable ? TEXT.resize : TEXT.resizeLocked}
							keys={resizable ? 'Shift+ArrowRight Shift+ArrowDown' : undefined}
							disabled={!resizable}
							onSelect={() => viaFrame('Enter')}
						/>
						<MenuRow icon="duplicate" label={TEXT.duplicate} onSelect={() => void duplicate()} />
						<div role="separator" style={SEPARATOR} />
						{onSceneEditor && (
							<MenuRow
								icon="settings-gear"
								label={TEXT.configure}
								onSelect={() => viaFrame('Enter')}
							/>
						)}
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
		</div>
	);
}

export interface WidgetFrameProps {
	w: BoardWidget;
	x: number;
	y: number;
	width: number;
	height: number;
	editing: boolean;
	selected: boolean;
	scale: number;
	resizable: boolean;
	/** Roving tabindex: exactly one frame per canvas is tab-reachable (CANVAS-016). */
	tabbable: boolean;
	ariaLabel: string;
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
	onFocusIn: () => void;
	registerRef: (el: HTMLDivElement | null) => void;
	onStartMove: (e: React.PointerEvent) => void;
	onStartResize: (e: React.PointerEvent) => void;
	/** VIEW-mode operate dispatch, pre-bound to this widget instance. Absent while editing. */
	onCommand?: WidgetCommandHandler;
}

export function WidgetFrame({
	w,
	x,
	y,
	width,
	height,
	editing,
	selected,
	scale,
	resizable,
	tabbable,
	ariaLabel,
	onKeyDown,
	onFocusIn,
	registerRef,
	onStartMove,
	onStartResize,
	onCommand,
}: WidgetFrameProps) {
	const chip = visibilityChip(w.visibility);
	const placeholder = w.status !== 'available';
	// RC-CAN-2.2 — the header is the tile's identity at a glance: the type's accent rail and tinted
	// icon, the label, who can see it, and what it is bound to.
	const meta = tileMetadataForWidget(w);
	const binding = tileBindingState(w);
	const glyph = binding ? BINDING_GLYPH[binding] : null;
	const { state, defaultActorId } = useRuntime();
	const refType = w.bindingRef?.entityType ?? null;
	const refId = w.bindingRef?.entityId ?? null;
	// Memoised on primitives: a frame re-renders on every pointer move while a tile is dragged, and
	// the name is an actor-filtered core read, not a field lookup.
	const entityName = useMemo(
		() =>
			safeBoundEntityName(state, defaultActorId, {
				status: w.status,
				bindingRef: refType && refId ? { entityType: refType, entityId: refId } : null,
			}),
		[state, defaultActorId, w.status, refType, refId],
	);
	const accent = `var(${meta.accentToken})`;
	// RC-CAN-2.4: Shift+F10 and the ContextMenu key open the tile menu from a focused frame. A
	// keyboard-raised `contextmenu` lands on the frame too; a right-click lands on the drag overlay.
	const menuRef = useRef<{ open: () => void } | null>(null);
	const openMenu = (e: React.SyntheticEvent<HTMLDivElement>) => {
		if (!editing || e.target !== e.currentTarget) return false;
		e.preventDefault();
		menuRef.current?.open();
		return true;
	};
	return (
		<div
			data-testid={`widget-${w.id}`}
			ref={registerRef}
			role="group"
			aria-label={ariaLabel}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={(e) => {
				const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
				if (!(menuKey && openMenu(e))) onKeyDown(e);
			}}
			onContextMenu={openMenu}
			onFocus={onFocusIn}
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width,
				height,
				borderRadius: 'var(--radius-md)',
				// `outline`, NOT `box-shadow`: forced-colors mode suppresses box-shadow outright, so
				// the selected widget had NO ring at all in Windows High Contrast — and the only
				// other selection cue, the title chip at `top:-26`, is clipped by the bounded
				// container for top-row widgets. An outline survives and remaps to `Highlight`.
				// Emit the key ONLY when selected. `outline:'none'` is an INLINE style, so it beat the
				// app's global `:focus-visible` rule (styles/tokens/base.css) and left every widget
				// frame with no focus indicator at all — on the one surface whose whole navigation
				// model is a roving tabindex across those frames (CANVAS-016, WCAG 2.4.7).
				...(selected ? { outline: '2px solid var(--color-accent)' } : {}),
				outlineOffset: 2,
				transition: selected ? 'none' : 'outline-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<div
				className={meta.silhouetteClass}
				style={{
					position: 'relative',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					padding: 'var(--space-3)',
					borderRadius: 'var(--radius-md)',
					background: placeholder ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
					border: `1px solid ${placeholder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
					opacity: placeholder ? 0.85 : 1,
					overflow: 'hidden',
					pointerEvents: editing ? 'none' : 'auto',
				}}
			>
				{/* A BORDER, not a background: forced-colors mode repaints backgrounds as Canvas, which
				    would erase the rail, but keeps a border and remaps it to CanvasText. */}
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
						gap: 'var(--space-2)',
						flex: '0 0 auto',
						// Room for the edit-mode menu trigger, held at screen size (hence ÷ scale).
						...(editing ? { paddingRight: `calc(${TRIGGER_SIZE} / ${scale})` } : {}),
					}}
				>
					<WidgetGlyph icon={meta.icon} size={16} color={accent} />
					<span
						style={{
							flex: 1,
							minWidth: 0,
							font: '700 var(--text-sm) var(--font-display)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{w.title}
					</span>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '2px 7px',
							borderRadius: 'var(--radius-full)',
							background: chip.players
								? 'var(--color-accent-subtle)'
								: 'var(--color-surface-sunken)',
							// `--color-text-tertiary` on `--color-surface-sunken` is 3.54:1 in parchment
							// — under 4.5:1 for this 10px text, and this DM-only/Players chip renders
							// on EVERY widget frame on both /board and /scene/:id. Secondary is
							// 6.28:1 on the same surface.
							color: chip.players ? 'var(--color-accent)' : 'var(--color-text-secondary)',
							font: '600 var(--text-2xs) var(--font-sans)',
							whiteSpace: 'nowrap',
						}}
					>
						<Icon name={chip.players ? 'visibility-players' : 'dm-only'} size={11} />
						{chip.label}
					</span>
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						minWidth: 0,
						flex: '0 0 auto',
					}}
				>
					<span
						title={meta.description}
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							letterSpacing: 'var(--tracking-wide)',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
							whiteSpace: 'nowrap',
							flex: '0 0 auto',
						}}
					>
						{w.typeLabel}
					</span>
					{binding && glyph && (
						<span
							data-testid="tile-binding"
							data-binding-state={binding}
							title={entityName ? `Bound to ${entityName}` : glyph.label}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 'var(--space-1)',
								minWidth: 0,
								font: '600 var(--text-2xs) var(--font-sans)',
								color: glyph.tone,
							}}
						>
							<Icon name={glyph.icon} size={12} />
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								{entityName ?? glyph.label}
							</span>
						</span>
					)}
				</div>
				<div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
					<WidgetRenderSlot widget={w} onCommand={onCommand} />
				</div>
				{w.statusNote && (
					<div
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 5,
							font: '600 var(--text-2xs) var(--font-sans)',
							color: 'var(--color-status-warning-text)',
							flex: '0 0 auto',
						}}
					>
						<Icon name="warning" size={12} />
						{w.statusNote}
					</div>
				)}
			</div>

			{editing && (
				<div
					onPointerDown={onStartMove}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 'var(--radius-md)',
						cursor: 'grab',
					}}
				/>
			)}

			{/* After the drag overlay in DOM order, so it paints — and takes presses — above it. */}
			{editing && (
				<TileActionMenu
					handle={menuRef}
					w={w}
					scale={scale}
					resizable={resizable}
					entityName={entityName}
				/>
			)}

			{selected && (
				<>
					<div
						style={{
							position: 'absolute',
							top: -26,
							left: 0,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 5,
							padding: '2px 7px',
							borderRadius: 'var(--radius-sm)',
							background: 'var(--color-accent)',
							color: 'var(--color-accent-foreground)',
							font: '600 var(--text-2xs) var(--font-sans)',
							whiteSpace: 'nowrap',
							pointerEvents: 'none',
							transform: `scale(${1 / scale})`,
							transformOrigin: 'bottom left',
						}}
					>
						<Icon name={resizable ? 'move' : 'lock'} size={11} />
						{w.title}
						<span style={{ opacity: 0.85, fontWeight: 500 }}>· {TIER_LABEL[w.tier]}</span>
					</div>
					{resizable && (
						<div
							onPointerDown={onStartResize}
							style={{
								position: 'absolute',
								right: -5,
								bottom: -5,
								width: 14,
								height: 14,
								borderRadius: 4,
								background: 'var(--color-accent)',
								border: '2px solid var(--color-bg)',
								cursor: 'nwse-resize',
								transform: `scale(${1 / scale})`,
								transformOrigin: 'bottom right',
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}
