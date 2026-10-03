import {
	canvasSurfaceForRoute,
	getSceneDisplayForActor,
	listCanvasCommandActions,
	listCommandActions,
	resolveCommandAction,
	searchCommandActions,
	type CommandAction,
	type CommandActionGroup,
} from '@dndtools/core';
import { screenCanvasRoute } from '../../screens/screen/screenModel';
import { defaultTileSize } from '../board-helpers';
import { Toaster } from '../../ds';
import type { useI18n } from '../../i18n';
import type { useRuntime } from '../../runtime/RuntimeContext';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { activeCanvasSurface, shortcut, type CanvasSurfaceHandle } from './registry';
import {
	ACTION_GROUP_ICON,
	ACTION_LIMIT,
	contextualGroupsFor,
	slotFor,
	focusTileWhenRendered,
	type PaletteCommand,
} from './palettePresentation';
export interface PaletteContext {
	runtime: ReturnType<typeof useRuntime>;
	actorId: string;
	pathname: string;
	commandMode: boolean;
	needle: string;
	canvasPrefix: string | undefined;
	canvasSurface: CanvasSurfaceHandle | null;
	remember: (id: string) => void;
	onClose: () => void;
	t: ReturnType<typeof useI18n>['t'];
	withQuery: (...extra: (string | undefined)[]) => string;
	matchesNeedle: (...text: (string | undefined)[]) => boolean;
}

export function paletteActions({
	runtime,
	actorId,
	pathname,
	commandMode,
	needle,
	canvasPrefix,
	canvasSurface,
	remember,
	onClose,
	t,
	withQuery,
	matchesNeedle,
}: PaletteContext): PaletteCommand[] {
	if (runtime.readOnly) return [];
	// ── Actions ──────────────────────────────────────────────────────────────────────────────
	// The core's actor-filtered action catalog. An action DISPATCHES; it does not navigate.
	const contextual = contextualGroupsFor(pathname);
	const dispatchAction = (action: CommandAction) => () => {
		const resolved = resolveCommandAction(action);
		// Belt and braces: an unavailable action is already rendered disabled, and the core
		// refuses it a second time here. Fail closed rather than pretend.
		if (!resolved) {
			Toaster.error(t('palette.toast.rejected'));
			return;
		}
		remember(`action:${action.id}`);
		void (async () => {
			try {
				const result = await runtime.dispatch({ ...resolved, actorId });
				if (result.status === 'rejected') Toaster.error(t('palette.toast.rejected'));
				else Toaster.success(t('palette.toast.ran', { title: action.title }));
			} catch {
				Toaster.error(t('palette.toast.notSaved'));
			}
		})();
		onClose();
	};
	// RC-CAN-4.3 — "Add tile: X" dispatches the provider's `scene.add-widget` unchanged except for
	// WHERE: on the mounted canvas it takes the gallery's next free slot instead of the library
	// default (which stacks every new tile on the first one), then enters edit mode and focuses
	// the new tile, exactly as a gallery pick does.
	const placeTile = (action: CommandAction) => () => {
		const resolved = resolveCommandAction(action);
		if (!resolved || resolved.type !== 'scene.add-widget') {
			Toaster.error(t('palette.toast.rejected'));
			return;
		}
		const payload = resolved.payload as {
			sceneId: string;
			widget: { layout: { x: number; y: number; w: number; h: number } };
		};
		const surface = activeCanvasSurface();
		const onCanvas = surface && surface.sceneId === payload.sceneId ? surface : null;
		// RC-CAN-8.1 — the same default-size table the gallery reads, so a palette tile matches its
		// seeded siblings instead of landing at the definition's own default.
		const declared = payload.widget.layout;
		const size = onCanvas
			? defaultTileSize({ width: declared.w, height: declared.h }, onCanvas.policy)
			: { w: declared.w, h: declared.h };
		const layout = onCanvas ? { ...declared, ...size, ...slotFor(onCanvas, size) } : declared;
		const before = new Set(
			(runtime.state.scenes.scenes[payload.sceneId]?.widgets ?? []).map((w) => w.id),
		);
		remember(`action:${action.id}`);
		onClose();
		void (async () => {
			try {
				const command = {
					type: 'scene.add-widget',
					actorId,
					payload: { ...payload, widget: { ...payload.widget, layout } },
				} as const;
				const stateBefore = runtime.state;
				const result = await runtime.dispatch(command);
				if (result.status === 'rejected') {
					Toaster.error(t('palette.toast.rejected'));
					return;
				}
				// On the canvas's own undo stack, so Ctrl+Z takes the tile back off like a gallery pick.
				onCanvas?.record?.(command, stateBefore, action.title.replace(/^Add tile: /, 'Added '));
				Toaster.success(t('palette.toast.ran', { title: action.title }));
				const current = activeCanvasSurface();
				if (current && current.sceneId === payload.sceneId && current.editable) {
					if (!current.editing) current.setEditing(true);
				}
				const added = result.nextState.scenes.scenes[payload.sceneId]?.widgets.find(
					(w) => !before.has(w.id),
				);
				if (added) focusTileWhenRendered(added.id);
			} catch {
				Toaster.error(t('palette.toast.notSaved'));
			}
		})();
	};
	const actionRow = (action: CommandAction, contextualRow: boolean): PaletteCommand => {
		const blocked =
			action.availability.status === 'unavailable' ? action.availability.reason : null;
		return {
			id: `action:${action.id}`,
			kind: 'action',
			label: action.title,
			icon: ACTION_GROUP_ICON[action.group],
			group: t(contextualRow ? 'palette.group.here' : 'palette.group.actions'),
			keywords: withQuery(action.keywords.join(' ')),
			// A blocked action keeps its row and says why, in the core's own generic words.
			description: blocked ?? undefined,
			disabled: blocked !== null,
			run: dispatchAction(action),
		};
	};
	// Hand-written action rows (advance card, the canvas verbs) gate on this; the core lists fail
	// closed on their own.
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const profileId = widgetProfileForRuntime();
	// RC-CAN-4.3 — on /board and /scene/:id the canvas's own provider supplies Add tile / Apply
	// template for THAT canvas, which supersedes the global catalog's home-scene "Add <widget>" and
	// "Apply preset" rows there (on a scene route those would have added to a different scene).
	const canvasRoute =
		screenCanvasRoute(pathname, runtime.state.commandCenter.homeSceneId) ??
		canvasSurfaceForRoute(pathname);
	const superseded: readonly CommandActionGroup[] = canvasRoute ? ['widget', 'preset'] : [];
	const catalog = listCommandActions(runtime.state, actorId, { profileId })
		// An action that needs a typed value (a preset name) has no field to collect it here, and
		// a row that can never fire is a dead control. Its own screen owns that form.
		.filter((action) => action.input === null && !superseded.includes(action.group));
	const contextualActions = catalog.filter((action) => contextual.includes(action.group));
	const otherActions = catalog.filter((action) => !contextual.includes(action.group));
	// Contextual actions are always offered; the rest of the catalog waits for a query or `>`.
	// Both lists are matched HERE, by the core's own matcher, because they carry the raw query.
	const matchedOthers =
		commandMode || needle !== '' ? searchCommandActions(otherActions, needle) : [];
	const actions: PaletteCommand[] = [
		...canvasRows(),
		...searchCommandActions(canvasPrefix ? [] : contextualActions, needle).map((action) =>
			actionRow(action, true),
		),
		...(canvasPrefix ? [] : matchedOthers)
			.slice(0, ACTION_LIMIT)
			.map((action) => actionRow(action, false)),
	];

	/**
	 * RC-CAN-4.3 — the canvas's verbs, ONLY on its two routes, all under "On this screen": Toggle
	 * edit and Undo (the toolbar button's and Ctrl/⌘+Z's own handlers, lent by the mounted screen
	 * through `registerCanvasSurface`), then Apply template and Add tile from the core provider.
	 * Templates are few and always offered; the tile types wait for a query or `>`, since a whole
	 * library of "Add tile" rows would bury everything else on an empty palette.
	 */
	function canvasRows(): PaletteCommand[] {
		if (!canvasRoute || (canvasPrefix && canvasPrefix !== canvasRoute.kind)) return [];
		const here = t('palette.group.here');
		const rows: PaletteCommand[] = [];
		const provided = listCanvasCommandActions(runtime.state, actorId, {
			profileId,
			surface: canvasRoute,
		});
		// The provider fails closed for a non-author; the GUI-only verbs must too.
		const canvasSceneId =
			canvasRoute.kind === 'board' ? runtime.state.commandCenter.homeSceneId : canvasRoute.sceneId;
		const lent =
			isDm && canvasSurface && canvasSceneId && canvasSurface.sceneId === canvasSceneId
				? canvasSurface
				: null;
		if (lent) {
			const editLabel = t(
				lent.editing ? 'palette.canvas.doneEditing' : 'palette.canvas.editLayout',
			);
			const editWords = t('palette.canvas.editKeywords');
			if (matchesNeedle(editLabel, editWords))
				rows.push({
					id: 'action:canvas.toggle-edit',
					kind: 'action',
					label: editLabel,
					icon: lent.editing ? 'check' : 'edit',
					group: here,
					keywords: commandMode ? withQuery(editWords) : editWords,
					disabled: !lent.editable,
					description: lent.editable ? undefined : t('palette.canvas.editBlocked'),
					run: () => {
						remember('action:canvas.toggle-edit');
						onClose();
						// Read the surface afresh: the screen re-registers on every render.
						const current = activeCanvasSurface();
						if (current?.editable) current.setEditing(!current.editing);
					},
				});
			const undoLabel = t('palette.canvas.undo');
			const undoWords = t('palette.canvas.undoKeywords');
			if (matchesNeedle(undoLabel, undoWords, lent.undoLabel ?? undefined))
				rows.push({
					id: 'action:canvas.undo',
					kind: 'action',
					label: undoLabel,
					icon: 'undo',
					group: here,
					keywords: commandMode ? withQuery(undoWords) : undoWords,
					// `canvas.undoRedo` prints "Ctrl/⌘+Z · Ctrl/⌘+Shift+Z"; this row fires only the first.
					shortcut: shortcut('canvas.undoRedo').keys.split(' · ')[0],
					disabled: !lent.canUndo,
					description: lent.canUndo
						? (lent.undoLabel ?? undefined)
						: t('palette.canvas.undoBlocked'),
					run: () => {
						remember('action:canvas.undo');
						onClose();
						activeCanvasSurface()?.undo();
					},
				});
		}
		const templates = provided.filter((action) => action.group === 'template');
		const tiles = provided.filter((action) => action.group === 'tile');
		rows.push(...searchCommandActions(templates, needle).map((action) => actionRow(action, true)));
		if (commandMode || needle !== '')
			rows.push(
				...searchCommandActions(tiles, needle)
					.slice(0, ACTION_LIMIT)
					.map((action) => ({ ...actionRow(action, true), run: placeTile(action) })),
			);
		return rows;
	}

	// I11 S11.2.3 — the one global keyboard shortcut the palette can also fire, so the row can
	// honestly print its key legend from the registry instead of advertising a chord it does not
	// perform. Same command, same guard, same message as the shell's Ctrl/⌘+→ handler.
	const display = getSceneDisplayForActor(
		runtime.state.session,
		runtime.state.permissions,
		actorId,
	);
	const advanceLabel = t('palette.action.advanceCard');
	const advanceKeywords = t('palette.action.advanceCardKeywords');
	// DM-only, like every other action here: `listCommandActions` fails closed on its own, so this
	// hand-written row has to as well — a player previewing the vault is offered no verbs at all.
	if (!canvasPrefix && isDm && matchesNeedle(advanceLabel, advanceKeywords))
		actions.push({
			id: 'action:scene-card.advance',
			kind: 'action',
			label: advanceLabel,
			icon: 'skip',
			group: t(contextual.length || canvasRoute ? 'palette.group.here' : 'palette.group.actions'),
			// Plain-text row: it only needs the raw query when the DS query still carries the sigil.
			keywords: commandMode ? withQuery(advanceKeywords) : advanceKeywords,
			shortcut: shortcut('global.advanceCard').keys,
			disabled: display.queuedCount === 0,
			description: display.queuedCount === 0 ? t('palette.action.advanceCardBlocked') : undefined,
			run: () => {
				remember('action:scene-card.advance');
				void (async () => {
					try {
						const result = await runtime.dispatch({
							type: 'scene-card.advance',
							actorId,
							payload: {},
						});
						if (result.status === 'rejected') Toaster.error(t('palette.toast.rejected'));
						else Toaster.success(t('palette.action.advanceCardDone'));
					} catch {
						Toaster.error(t('palette.toast.notSaved'));
					}
				})();
				onClose();
			},
		});

	return actions;
}
