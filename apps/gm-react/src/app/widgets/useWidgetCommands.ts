import { useMemo } from 'react';
import type { SceneBoardCanvasProps } from '../SceneBoardModel';
import type { WidgetCommandHandler } from './WidgetRenderSlot';

/** Geometry/focus renders keep body callbacks stable; a new host closure replaces every callback. */
export function useWidgetCommands(
	widgets: SceneBoardCanvasProps['widgets'],
	onCommand: SceneBoardCanvasProps['onWidgetCommand'],
) {
	return useMemo(
		() =>
			new Map<string, WidgetCommandHandler>(
				onCommand
					? widgets.map(({ id }) => [id, (type, payload) => onCommand(id, type, payload)])
					: [],
			),
		[widgets, onCommand],
	);
}
