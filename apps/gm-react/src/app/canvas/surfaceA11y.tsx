import { useCallback, useRef, useState } from 'react';
import { srOnly } from '../screen-kit';

/**
 * RC-UX-2.2 — the screen-reader contract every widget surface shares: the GM Screen (`/board`), the
 * free scene canvas (`/scene/:id`) and the scene editor's flow layout.
 *
 * ROLE. A surface is `role="application"` only while its layout is being EDITED. That is when the
 * canvas owns the arrow keys (Space picks a tile up, arrows move it, Shift+arrows resize it), and
 * browse mode would otherwise eat every one of them. In VIEW mode the same surface is a labelled
 * `region`: a DM reading the board wants NVDA/VoiceOver to walk the widget content the normal way,
 * and `application` would switch that off for no gain.
 *
 * NAME. Surface + count ("GM Screen, 6 widgets"), so the size of what is behind the Tab stop is
 * known before entering it — and changes audibly when a widget is added or removed.
 *
 * LIST PATH. The frames themselves are the non-visual list: DOM order is the core's reading order
 * (`useReadingOrder`), so Tab walks every widget, and each frame's name carries its title, type and
 * (while editing) its position. No widget is reachable only by pointing.
 *
 * Copy is English-only, the convention the rest of this directory (`WidgetFrame`, `FlowBoard`) keeps.
 */

/** The layout policy a surface renders under: the bounded GM Screen, a free scene canvas, or a
 *  scene's flow layout. */
export type CanvasSurfaceKind = 'bounded' | 'canvas' | 'flow';

const SURFACE_NAME: Record<CanvasSurfaceKind, { view: string; edit: string }> = {
	bounded: { view: 'GM Screen', edit: 'GM Screen layout editor' },
	canvas: { view: 'Scene canvas', edit: 'Scene layout editor' },
	flow: { view: 'Scene layout', edit: 'Scene layout editor' },
};

export const widgetCount = (n: number) => `${n} ${n === 1 ? 'widget' : 'widgets'}`;

export function canvasSurfaceProps(kind: CanvasSurfaceKind, editing: boolean, count: number) {
	const name = SURFACE_NAME[kind][editing ? 'edit' : 'view'];
	return {
		role: editing ? ('application' as const) : ('region' as const),
		'aria-label': `${name}, ${widgetCount(count)}`,
	};
}

/** Announcement copy for the canvas operations that had no voice before RC-UX-2.2. */
export const OPERATION_TEXT = {
	moved: (title: string, x: number, y: number) => `${title}, moved to ${x}, ${y}`,
	resized: (title: string, w: number, h: number) => `${title}, size ${w} by ${h}`,
	picked: (title: string) =>
		`${title} selected. Arrows move it, Shift with arrows resizes it, Escape puts it down.`,
	dropped: (title: string) => `${title} put down.`,
};

export interface OperationNotice {
	seq: number;
	text: string;
}

/** One message at a time; `seq` re-keys the node so an identical repeat still announces. */
export function useOperationNotice() {
	const [notice, setNotice] = useState<OperationNotice | null>(null);
	const seq = useRef(0);
	const announce = useCallback((text: string) => {
		seq.current += 1;
		setNotice({ seq: seq.current, text });
	}, []);
	return [notice, announce] as const;
}

/**
 * The permanent polite region the operations above speak through. Permanent so the region is in the
 * accessibility tree before the first message: a region inserted with its text already inside is
 * routinely dropped by screen readers.
 */
export function OperationLiveRegion({
	notice,
	testId,
}: {
	notice: OperationNotice | null;
	testId: string;
}) {
	return (
		<div data-testid={testId} aria-live="polite" aria-atomic="true" style={srOnly}>
			{notice && <span key={notice.seq}>{notice.text}</span>}
		</div>
	);
}
