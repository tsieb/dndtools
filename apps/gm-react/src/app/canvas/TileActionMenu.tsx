import type { LayoutHistory } from './useLayoutHistory';
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTER_ENTITY_TYPE, CONTENT_ITEM_ENTITY_TYPE, type CoreCommand } from '@dndtools/core';
import { IconButton, Menu, Toaster } from '../../ds';
import { ownsEscape, popEscapeLayer, pushEscapeLayer } from '../../platform/escapeLayers';
import { useRuntime } from '../../runtime/RuntimeContext';
import { type BoardWidget } from '../board-helpers';

import { useI18n, type MessageKey } from '../../i18n';
import { GRID } from '../SceneBoardModel';
import { useEditWidget } from '../../screens/extensions/WidgetBuilder';
import { bindingSlot, sceneInstance, TileBindDialog, TileConfigureDialog } from './TileDialogs';
import { widgetSettingsFields } from '../widgetBuilder/draft';
import { MenuRow, firstSubItem, focusParent, type MenuHandle, type Point } from './menuParts';
export { useLongPress, type MenuHandle, type Point } from './menuParts';

/** Density-sized, so the tile-menu trigger meets the touch floor on the profiles that ask for one. */
export const TRIGGER_SIZE = 'var(--density-touch-target, 1.75rem)';
const MENU_WIDTH = 248;

/** A bound tile's source, by the same hash deep links the map body, Graph and character cards use. */
const SOURCE_LINK: Record<string, readonly [label: MessageKey, route: string]> = {
	map: ['boardCanvas.menu.openMap', '#/atlas?map='],
	[CHARACTER_ENTITY_TYPE]: ['boardCanvas.menu.openCharacter', '#/characters/'],
	[CONTENT_ITEM_ENTITY_TYPE]: ['boardCanvas.menu.openNote', '#/knowledge/'],
};

const VISIBILITY_ICON: Record<string, string> = {
	'dm-only': 'dm-only',
	shared: 'visibility-shared',
	'player-visible': 'visibility-players',
};
const VISIBILITY_LABEL: Record<string, MessageKey> = {
	'dm-only': 'boardCanvas.visibility.dmOnly',
	shared: 'boardCanvas.visibility.shared',
	'player-visible': 'boardCanvas.visibility.players',
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
	const { t } = useI18n();
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
	// RC-WID-6.6 — "Edit widget": the builder on this tile's definition, copied first when not the GM's.
	const edit = useEditWidget(w.id, w.type);
	const label = t('boardCanvas.menu.actions', { title: w.title });
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
			? await history.run(command, t('boardCanvas.step.duplicated', { title: w.title }))
			: (await run(command)).status === 'accepted';
		if (!ok) return;
		Toaster.success(t('boardCanvas.duplicatedToast', { title: w.title }));
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
	// RC-WID-6.8 — the settings that do something on a tile: no visibility (it has its own row) and no
	// dock preference (no tile canvas docks). With none, the row says so and Edit widget is the way on.
	const settings = useMemo(() => widgetSettingsFields(w.configFields), [w.configFields]);
	const configurable = onSceneEditor || settings.length > 0;
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
							label={t('boardCanvas.menu.move')}
							keys="ArrowUp ArrowDown ArrowLeft ArrowRight"
							onSelect={() => viaFrame(' ')}
						/>
						<MenuRow
							icon="zoom-fit"
							label={
								resizable
									? t('boardCanvas.menu.resize')
									: t('boardCanvas.menu.resizeLocked', { title: w.title })
							}
							keys={resizable ? 'Shift+ArrowRight Shift+ArrowDown' : undefined}
							disabled={!resizable}
							onSelect={() => viaFrame(' ')}
						/>
						<MenuRow
							icon="duplicate"
							label={t('boardCanvas.menu.duplicate')}
							onSelect={() => void duplicate()}
						/>
						<div role="separator" style={SEPARATOR} />
						{bindable && (
							<MenuRow
								icon="link"
								label={t('boardCanvas.menu.bind')}
								onSelect={() => openDialog('bind')}
							/>
						)}
						{configurable ? (
							<MenuRow
								icon="settings-gear"
								label={t('boardCanvas.menu.configure')}
								onSelect={() => {
									if (onSceneEditor) viaFrame('Enter');
									else openDialog('configure');
								}}
							/>
						) : (
							<MenuRow
								icon="settings-gear"
								label={t('boardCanvas.menu.noSettings')}
								hint={t(
									edit.available
										? 'boardCanvas.menu.noSettingsEdit'
										: 'boardCanvas.menu.noSettingsFixed',
								)}
								disabled
								onSelect={() => undefined}
							/>
						)}
						{edit.available && (
							<MenuRow
								icon="edit"
								label={t('boardCanvas.menu.edit')}
								onSelect={() => {
									// The frame holds focus, so the builder hands it back there on close.
									const frame = anchorRef.current?.parentElement;
									close();
									frame?.focus();
									void edit.open();
								}}
							/>
						)}
						<div role="none">
							<MenuRow
								icon="eye"
								label={t('boardCanvas.menu.visibility')}
								parent
								expanded={subOpen}
								onSelect={() => setSubOpen(!subOpen)}
							/>
							{subOpen && (
								<div
									ref={subRef}
									role="menu"
									aria-label={t('boardCanvas.menu.visibility')}
									style={{ paddingLeft: 'var(--space-4)' }}
								>
									{Object.keys(VISIBILITY_ICON).map((value) => (
										<MenuRow
											key={value}
											icon={VISIBILITY_ICON[value]}
											label={t(VISIBILITY_LABEL[value])}
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
								label={t(source[0])}
								onSelect={() => {
									close();
									globalThis.location.hash = `${source[1]}${encodeURIComponent(ref.entityId)}`;
								}}
							/>
						)}
						<div role="separator" style={SEPARATOR} />
						<MenuRow
							icon="trash"
							label={t('boardCanvas.menu.remove')}
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
							<TileConfigureDialog
								w={{ ...w, configFields: settings }}
								onClose={() => setDialog(null)}
							/>
						)}
					</div>,
					document.body,
				)}
			{edit.editor}
		</div>
	);
}

// RC-POL-1.2 — the flow grid's tile menu lives in its own file; re-exported for its callers.
export { AUTHORING_COLUMNS, FlowTileMenu } from './FlowTileMenu';
