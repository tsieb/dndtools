import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTER_ENTITY_TYPE, CONTENT_ITEM_ENTITY_TYPE, type CoreEvent } from '@dndtools/core';
import { Button, IconButton, Menu, Toaster } from '../../ds';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../platform/escapeLayers';
import { useRuntime } from '../../runtime/RuntimeContext';
import { visibilityChip, type BoardWidget } from '../board-helpers';
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

const SEPARATOR = { height: 1, margin: 'var(--space-1) 0', background: 'var(--color-border)' };

type WidgetAdded = Extract<CoreEvent, { kind: 'scene.widget-added' }>;

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
 * RC-CAN-2.4 — the tile's `…` menu, in edit mode. Move and Resize select the tile as Enter does
 * (arrows then move it, Shift+arrows resize it) and Remove is Delete: re-issued as keys on the frame,
 * the host's CANVAS-016 handler and Delete's undo toast stay their one owner. Duplicate is the core's
 * `scene.duplicate-widget`. Bind… opens a picker of the entities the definition's binding slot takes;
 * Configure… opens the Inspector on the scene editor and a settings dialog on the board, which has
 * none. WAI-ARIA menu button: Enter/Space/↓ on the trigger or Shift+F10 on the frame open it;
 * ↑/↓/Home/End move; →, ← and Escape enter and leave the Visibility submenu; Escape closes and returns
 * focus; Tab closes and moves on. Portalled to <body>, because inside the canvas's transform layer no
 * z-index can lift it over the canvas's own zoom and history clusters.
 */
export function TileActionMenu({ handle, w, scale, resizable, entityName }: TileMenuProps) {
	const runtime = useRuntime();
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const subRef = useRef<HTMLDivElement | null>(null);
	const [box, setBox] = useState<DOMRect | null>(null);
	const [subOpen, setSubOpen] = useState(false);
	const [dialog, setDialog] = useState<'bind' | 'configure' | null>(null);
	const label = TEXT.actions(w.title);
	const show = () => {
		setSubOpen(false);
		setBox(anchorRef.current?.getBoundingClientRect() ?? null);
	};
	useImperativeHandle(handle, () => ({ open: show }));
	const close = () => setBox(null);
	const widgetDefs = runtime.state.widgets;
	const bindable = useMemo(() => !!bindingSlot(widgetDefs, w.type), [widgetDefs, w.type]);

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

	// A minted id is beyond the undo stack (useLayoutHistory); the copy's own Remove is undoable.
	async function duplicate() {
		close();
		const found = sceneInstance(runtime.state, w.id);
		if (!found) return;
		const result = await run({
			type: 'scene.duplicate-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId: found.scene.id,
				widgetInstanceId: w.id,
				position: duplicatePosition(found.scene.widgets, found.instance.layout),
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
	// Only the scene editor mounts an Inspector for a selection; /board gets the settings dialog.
	const onSceneEditor = globalThis.location.hash.startsWith('#/scene/');
	const configurable = onSceneEditor || settingsFields(w).length > 0;
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
