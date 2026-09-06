import type { ZodType } from 'zod';
import type { CoreCommand, CoreStateSlice } from '../commands/types';
import {
	configureWidgetInputSchema,
	dockWidgetInputSchema,
	layerWidgetInputSchema,
	moveGroupInputSchema,
	moveWidgetInputSchema,
	pinWidgetInputSchema,
	resizeWidgetInputSchema,
	setWidgetFocusOrderInputSchema,
} from '../schemas/commands';
import type { Scene, WidgetInstance } from '../state/scene-state';

/**
 * RC-CAN-1.1 / ADR-029 §1 — PURE INVERSE BUILDERS for the scene canvas layout commands.
 *
 * THE UNDO STACK IS NOT IN HERE, AND THAT IS THE DESIGN — the same design `map-undo.ts` states at
 * length for the map editor, and this module deliberately mirrors it rather than inventing a second
 * undo architecture:
 *
 *   - a co-DM must never be able to undo your drag from across the table. Undo belongs to one
 *     person's editing session, not to the campaign.
 *   - undo state must never enter the op log. The log is what the campaign IS, not a record of what
 *     somebody nearly did.
 *
 * So the core exports exactly this: a pure function from (an ACCEPTED command, the state BEFORE it
 * applied) to the command that exactly undoes it. The app keeps the stack, dispatches the returned
 * command through the normal `dispatchCommand` path — so an undo is an ordinary, authorized,
 * durably-logged mutation, never a back-door state write — and renders `label` in its toolbar.
 *
 * WHY `stateBefore`: every layout command overwrites a field outright, so the value to restore only
 * exists in the state before. The consequence is the one asymmetry, shared with `map-undo.ts`: a
 * command that MINTS an id inside its handler cannot be inverted from the state before, because the
 * id it produced is not in there. Those commands are reported honestly as NOT undoable (`null`)
 * instead of being handed a wrong inverse:
 *
 *   - `scene.add-widget` — the instance id is minted by the handler. Per ADR-029 §1 the app routes
 *     an add-undo to `scene.destroy-widget` using the id off the `scene.widget-added` event it
 *     already received, rather than duplicating a second removal path here.
 *   - `scene.destroy-widget` — nothing in `stateBefore` can be put back by an existing command;
 *     `scene.add-widget` would mint a NEW id and drop z/dock/pin/focus order. Its inverse is the
 *     durable `scene.restore-widget` command that ADR-029 §2 introduces (RC-CAN-1.2); until that
 *     lands, destroy is honestly not undoable.
 *   - `scene.group-widgets` — the handler mints a fresh `groupId`, and the command set has no
 *     ungroup: no command can put a widget's prior `groupId` back. Guessing one would silently
 *     corrupt existing groups, so this reports `null`.
 */

export interface UndoableWidgetCommand {
	command: CoreCommand;
	/** Human text for the canvas toolbar — describes the FORWARD action ("Moved widget"). */
	label: string;
}

function parse<TSchema extends ZodType>(
	schema: TSchema,
	payload: unknown,
): ReturnType<TSchema['parse']> | null {
	const result = schema.safeParse(payload);
	return result.success ? (result.data as ReturnType<TSchema['parse']>) : null;
}

function sceneOf(state: CoreStateSlice, sceneId: string): Scene | null {
	return state.scenes.scenes[sceneId] ?? null;
}

/**
 * The widget the forward command targeted, as it stood BEFORE. A widget the scene did not hold
 * means the forward command could not have been accepted against this state — the caller passed the
 * wrong `stateBefore`, so refuse rather than guess.
 */
function widgetOf(
	state: CoreStateSlice,
	sceneId: string,
	widgetInstanceId: string,
): WidgetInstance | null {
	const scene = sceneOf(state, sceneId);
	if (!scene) return null;
	return scene.widgets.find((widget) => widget.id === widgetInstanceId) ?? null;
}

function undoable(command: CoreCommand, label: string): UndoableWidgetCommand {
	return { command, label };
}

/**
 * Build the command that exactly undoes `command`, or `null` when it is not undoable.
 *
 * `command` MUST be one the core ACCEPTED, and `stateBefore` MUST be the state it was dispatched
 * against. Pure: no clock, no ids, no state mutation. The returned command is dispatched by the
 * caller, which is also what re-authorizes it.
 */
export function buildWidgetInverse(
	command: CoreCommand,
	stateBefore: CoreStateSlice,
): UndoableWidgetCommand | null {
	const actorId = command.actorId;

	switch (command.type) {
		case 'scene.move-widget': {
			const payload = parse(moveWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.move-widget',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						x: widget.layout.x,
						y: widget.layout.y,
					},
				},
				'Moved widget',
			);
		}

		case 'scene.resize-widget': {
			const payload = parse(resizeWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.resize-widget',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						w: widget.layout.w,
						h: widget.layout.h,
					},
				},
				'Resized widget',
			);
		}

		case 'scene.layer-widget': {
			const payload = parse(layerWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.layer-widget',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						z: widget.layout.z,
					},
				},
				'Changed widget layer',
			);
		}

		case 'scene.dock-widget': {
			const payload = parse(dockWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.dock-widget',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						dock: widget.layout.dock,
					},
				},
				widget.layout.dock === null ? 'Docked widget' : 'Moved widget dock',
			);
		}

		case 'scene.pin-widget': {
			const payload = parse(pinWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.pin-widget',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						pinned: widget.layout.pinned,
					},
				},
				widget.layout.pinned ? 'Unpinned widget' : 'Pinned widget',
			);
		}

		case 'scene.set-focus-order': {
			const payload = parse(setWidgetFocusOrderInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			return undoable(
				{
					type: 'scene.set-focus-order',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						widgetInstanceId: payload.widgetInstanceId,
						focusOrder: widget.layout.focusOrder,
					},
				},
				'Changed focus order',
			);
		}

		case 'scene.configure-widget': {
			const payload = parse(configureWidgetInputSchema, command.payload);
			if (!payload) return null;
			const widget = widgetOf(stateBefore, payload.sceneId, payload.widgetInstanceId);
			if (!widget) return null;
			// Restore only the fields the forward command actually set. The schema refuses a payload
			// carrying neither, so a forward command that set neither could not have been accepted.
			const restore: Record<string, unknown> = {
				sceneId: payload.sceneId,
				widgetInstanceId: payload.widgetInstanceId,
			};
			if (payload.configuration !== undefined) restore.configuration = widget.configuration;
			if (payload.binding !== undefined) restore.binding = widget.binding;
			if (restore.configuration === undefined && restore.binding === undefined) return null;
			return undoable(
				{ type: 'scene.configure-widget', actorId, payload: restore },
				'Configured widget',
			);
		}

		case 'scene.move-group': {
			const payload = parse(moveGroupInputSchema, command.payload);
			if (!payload) return null;
			const scene = sceneOf(stateBefore, payload.sceneId);
			// The handler rejects a group with no members, so an empty group means the wrong
			// `stateBefore` and the negated delta would move a DIFFERENT set of widgets.
			if (!scene?.widgets.some((widget) => widget.layout.groupId === payload.groupId)) return null;
			return undoable(
				{
					type: 'scene.move-group',
					actorId,
					payload: {
						sceneId: payload.sceneId,
						groupId: payload.groupId,
						// `-0` would round-trip as a distinct payload value for a zero delta; keep it plain.
						deltaX: payload.deltaX === 0 ? 0 : -payload.deltaX,
						deltaY: payload.deltaY === 0 ? 0 : -payload.deltaY,
					},
				},
				'Moved widget group',
			);
		}

		// Not undoable — see the module header for why each one is refused rather than guessed at.
		case 'scene.add-widget':
		case 'scene.destroy-widget':
		case 'scene.group-widgets':
			return null;

		default:
			return null;
	}
}
