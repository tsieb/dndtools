import { useCallback } from 'react';
import type { CoreStateSlice, Scene } from '@dndtools/core';
import { useRuntime } from '../../../../runtime/RuntimeContext';
import type { BoardWidget } from '../../../board-helpers';
import type { WidgetQueryDetail, WidgetTemplateData } from '../../dataEnvironment';

/**
 * RC-WID-5.7 — what the GM board's template kinds share.
 *
 * The seven board tools (map, initiative, dice, timer, audio, quick reference, prep) used to be
 * hand-written bodies keyed by widget type, reading the vault and dispatching core commands on their
 * own. They are now template kinds: each draws from the queries its definition declares and acts
 * only through the commands its definition declares, so a copy the GM opens in the builder (a new
 * type, the same template) draws and works like the original.
 */

/**
 * The structured detail of the first declared query that carries one of this kind (`widget-timer`
 * a timer, `bound-map` a map…). Null when no such query is declared, or the declared one was withheld
 * from this viewer: a withheld query carries no detail, so the tile draws its empty state.
 */
export function detailOf<K extends WidgetQueryDetail['kind']>(
	data: WidgetTemplateData,
	kind: K,
): Extract<WidgetQueryDetail, { kind: K }> | null {
	for (const query of data.queries) {
		if (query.detail?.kind === kind) return query.detail as Extract<WidgetQueryDetail, { kind: K }>;
	}
	return null;
}

/** Whether the placed widget carries this declared command (the operate test every body made). */
export function declares(widget: BoardWidget, commandType: string): boolean {
	return widget.commands.includes(commandType);
}

export type WidgetCommandOutcome = { ok: true } | { ok: false; message: string };

/** The screen a placed instance sits on: widget commands address widgets by screen. */
function hostScene(state: CoreStateSlice, widgetId: string): Scene | null {
	return (
		Object.values(state.scenes.scenes).find((scene) =>
			scene.widgets.some((instance) => instance.id === widgetId),
		) ?? null
	);
}

/**
 * Run one of the widget's DECLARED commands through `widget.dispatch-command` and hand back the
 * core's answer, for a tile that announces the outcome itself (the HP keypad's "Damage 5 · Bog
 * Lurker", the map's "Map projected"). The core runs the widget's operate/configure check and then
 * the command's own, exactly as for any widget command. The envelope is the board's own: a fresh
 * idempotency key and the hosting screen's current revision. `placed` is false for a widget on no
 * screen (a builder preview), where there is nothing to run against.
 */
export function useWidgetCommandRunner(widget: BoardWidget): {
	placed: boolean;
	run: (commandType: string, payload: Record<string, unknown>) => Promise<WidgetCommandOutcome>;
} {
	const runtime = useRuntime();
	const placed = hostScene(runtime.state, widget.id) !== null;
	const run = useCallback(
		async (
			commandType: string,
			payload: Record<string, unknown>,
		): Promise<WidgetCommandOutcome> => {
			const scene = hostScene(runtime.state, widget.id);
			if (!scene) return { ok: false, message: '' };
			const result = await runtime.dispatch({
				type: 'widget.dispatch-command',
				actorId: runtime.defaultActorId,
				idempotencyKey: runtime.newId(),
				payload: {
					sceneId: scene.id,
					widgetInstanceId: widget.id,
					commandType,
					payload,
					expectedRevision: scene.ownership.revision,
				},
			});
			return result.status === 'accepted'
				? { ok: true }
				: { ok: false, message: result.rejection?.message ?? '' };
		},
		[runtime, widget.id],
	);
	return { placed, run };
}
