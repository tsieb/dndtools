import { memo, useLayoutEffect, useRef, useState } from 'react';
import { WidgetFrame, type WidgetFrameProps } from '../canvas/WidgetFrame';
import type { BoardWidget } from '../board-helpers';

/**
 * RC-ENG-3.2 — board frames that re-render only when something they draw changed.
 *
 * A GM Screen mounts every frame at once, and each host render used to hand all of them fresh
 * closures. The undo stack's mount reset and the pane's first width reading therefore re-rendered
 * every frame, and with it every widget body, twice more before the board settled. Frames now take
 * per-widget handlers that last as long as the widget and call the host's latest handler.
 */

type HandlerKey =
	| 'onKeyDown'
	| 'onFocusIn'
	| 'onStartMove'
	| 'onStartResize'
	| 'onCycleSize'
	| 'onResizeStep';
type FrameHandlers = Required<Pick<WidgetFrameProps, HandlerKey | 'registerRef'>>;

/** The host's frame handlers, each told which widget the event is for. */
export type BoardFrameHandlers = {
	[K in HandlerKey]: (w: BoardWidget, ...args: Parameters<FrameHandlers[K]>) => void;
};

/** Per-widget frame handlers with stable identity; `refs` maps each mounted frame by widget id. */
export function useFrameHandlers(
	widgets: readonly BoardWidget[],
	refs: { readonly current: Map<string, HTMLDivElement> },
	handlers: BoardFrameHandlers,
): (id: string) => FrameHandlers {
	// Written during render, like the canvas's draft refs: a frame this render mounts is focusable
	// (and can receive a key) before any effect of the host has run.
	const latest = useRef({ widgets, handlers });
	latest.current = { widgets, handlers };
	const bound = useRef(new Map<string, FrameHandlers>());
	const live = new Set(widgets.map((w) => w.id));
	for (const id of bound.current.keys()) if (!live.has(id)) bound.current.delete(id);
	return (id) => {
		let frame = bound.current.get(id);
		if (frame) return frame;
		const call =
			<K extends HandlerKey>(key: K) =>
			(...args: Parameters<FrameHandlers[K]>) => {
				const w = latest.current.widgets.find((candidate) => candidate.id === id);
				if (w)
					(latest.current.handlers[key] as (w: BoardWidget, ...rest: typeof args) => void)(
						w,
						...args,
					);
			};
		frame = {
			onKeyDown: call('onKeyDown'),
			onFocusIn: call('onFocusIn'),
			onStartMove: call('onStartMove'),
			onStartResize: call('onStartResize'),
			onCycleSize: call('onCycleSize'),
			onResizeStep: call('onResizeStep'),
			// By id, not through `latest`: React detaches a removed frame after the render that dropped it.
			registerRef: (el) => {
				if (el) refs.current.set(id, el);
				else refs.current.delete(id);
			},
		};
		bound.current.set(id, frame);
		return frame;
	};
}

/**
 * `WidgetFrame`, compared prop by prop. `scale` and `history` feed only edit-mode chrome (the menu
 * trigger, the selection chip, the resize handle), so in view mode a zoom step or an undo-stack
 * change leaves the frame and its body alone. Runtime changes still arrive through the frame's own
 * `useRuntime` subscription.
 */
export function sameFrameProps(prev: WidgetFrameProps, next: WidgetFrameProps): boolean {
	const keys = Object.keys(next) as (keyof WidgetFrameProps)[];
	if (keys.length !== Object.keys(prev).length) return false;
	const viewing = !prev.editing && !next.editing;
	return keys.every(
		(key) => prev[key] === next[key] || (viewing && (key === 'scale' || key === 'history')),
	);
}

export const BoardFrame = memo(WidgetFrame, sameFrameProps);

/**
 * The pane's content width, tracked with a `ResizeObserver`. The first reading happens before the
 * first paint: starting from 0 painted every frame at 100% and then re-rendered them at the fit scale.
 */
export function usePaneWidth(ref: { readonly current: HTMLElement | null }): number {
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		setWidth(node.clientWidth);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(Math.round(entry.contentRect.width));
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [ref]);
	return width;
}
