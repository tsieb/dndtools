/**
 * Z-order math (UX-CANVAS-006 grouping and z-order). Pure functions that compute the new `z` value for a
 * widget moved in the stacking order — bring to front / send to back / bring forward / send backward —
 * from the current z-values of all widgets. Each result is a single `scene.layer-widget` payload's `z`,
 * so the keyboard shortcut, the context-menu item, and the layers-panel reorder all dispatch the same
 * core command. No DOM, no `$state`.
 */

export interface ZWidget {
	id: string;
	z: number;
}

function zValues(widgets: readonly ZWidget[]): number[] {
	return widgets.map((w) => w.z);
}

/** Bring a widget to the front: one above the current maximum z. Returns `null` if already on top. */
export function bringToFront(widgets: readonly ZWidget[], id: string): number | null {
	const target = widgets.find((w) => w.id === id);
	if (!target) return null;
	const max = Math.max(...zValues(widgets));
	if (target.z === max && widgets.filter((w) => w.z === max).length === 1) return null;
	return max + 1;
}

/** Send a widget to the back: one below the current minimum z. Returns `null` if already on bottom. */
export function sendToBack(widgets: readonly ZWidget[], id: string): number | null {
	const target = widgets.find((w) => w.id === id);
	if (!target) return null;
	const min = Math.min(...zValues(widgets));
	if (target.z === min && widgets.filter((w) => w.z === min).length === 1) return null;
	return min - 1;
}

/**
 * Bring a widget forward by one stacking step: swap z with the next-higher sibling. Returns the new z
 * (the sibling's z), or `null` when nothing is above it. Ties are broken so a repeated press keeps
 * advancing.
 */
export function bringForward(widgets: readonly ZWidget[], id: string): number | null {
	const target = widgets.find((w) => w.id === id);
	if (!target) return null;
	const above = widgets
		.filter((w) => w.id !== id && w.z >= target.z)
		.filter((w) => w.z > target.z || w.id > id)
		.sort((a, b) => a.z - b.z)[0];
	if (!above) return null;
	return above.z + 1;
}

/** Send a widget backward by one stacking step. Returns the new z, or `null` when nothing is below. */
export function sendBackward(widgets: readonly ZWidget[], id: string): number | null {
	const target = widgets.find((w) => w.id === id);
	if (!target) return null;
	const below = widgets
		.filter((w) => w.id !== id && w.z <= target.z)
		.filter((w) => w.z < target.z || w.id < id)
		.sort((a, b) => b.z - a.z)[0];
	if (!below) return null;
	return below.z - 1;
}

export type ZOrderOp = 'front' | 'back' | 'forward' | 'backward';

/** Resolve any z-order op to a new z value, or `null` when it would be a no-op. */
export function resolveZOrder(widgets: readonly ZWidget[], id: string, op: ZOrderOp): number | null {
	switch (op) {
		case 'front':
			return bringToFront(widgets, id);
		case 'back':
			return sendToBack(widgets, id);
		case 'forward':
			return bringForward(widgets, id);
		case 'backward':
			return sendBackward(widgets, id);
	}
}

/** Polite announcement after a z-order change (UX-CANVAS-006 accessibility). */
export function zOrderAnnouncement(name: string, op: ZOrderOp): string {
	const label: Record<ZOrderOp, string> = {
		front: 'brought to front',
		back: 'sent to back',
		forward: 'moved up one level in z-order',
		backward: 'moved down one level in z-order',
	};
	return `${name} ${label[op]}.`;
}
