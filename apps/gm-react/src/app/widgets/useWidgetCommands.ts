import { useMemo, useRef } from 'react';
import type { SceneBoardCanvasProps } from '../SceneBoardModel';
import type { WidgetCommandHandler } from './WidgetRenderSlot';

/**
 * One callback per widget, kept for as long as the widget is on the board. Each call goes to the
 * host's latest handler, so a new host closure (a render, a new scene revision) reaches the body
 * without handing fifty memoised frames and bodies a new prop. No host handler means no callbacks.
 */
export function useWidgetCommands(
	widgets: SceneBoardCanvasProps['widgets'],
	onCommand: SceneBoardCanvasProps['onWidgetCommand'],
) {
	// Written during render, as the canvas's own draft refs are: an operate press always follows a
	// committed render, and a frame mounted by this render already needs its callback.
	const latest = useRef(onCommand);
	latest.current = onCommand;
	const bound = useRef(new Map<string, WidgetCommandHandler>());
	const live = !!onCommand;
	return useMemo(() => {
		const next = new Map<string, WidgetCommandHandler>();
		if (live) {
			for (const { id } of widgets) {
				next.set(
					id,
					bound.current.get(id) ?? ((type, payload) => latest.current?.(id, type, payload)),
				);
			}
		}
		bound.current = next;
		return next;
	}, [widgets, live]);
}
