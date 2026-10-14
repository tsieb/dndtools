import { useEffect, useId, useRef } from 'react';
import { Button } from '../../ds';
import { T } from '../screen-kit';

// RC-POL-1.2 — the tile menu's row, focus helpers and long-press, out of `TileActionMenu.tsx`.

/** Entering the submenu lands on its checked option; leaving it returns to the row that opened it. */
export const firstSubItem = (sub: HTMLElement | null) =>
	sub?.querySelector<HTMLElement>('[aria-checked="true"]') ??
	sub?.querySelector<HTMLElement>('[role^="menuitem"]');
export const focusParent = (sub: HTMLElement | null) =>
	sub?.parentElement?.querySelector<HTMLElement>('[data-submenu-parent]')?.focus();

export interface RowProps {
	label: string;
	/** A line under the label, read as the row's description. */
	hint?: string;
	icon?: string;
	parent?: boolean;
	expanded?: boolean;
	checked?: boolean;
	disabled?: boolean;
	keys?: string;
	onSelect: () => void;
}

export function MenuRow(p: RowProps) {
	const hintId = useId();
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
			aria-describedby={p.hint ? hintId : undefined}
			data-submenu-parent={p.parent || undefined}
			tabIndex={-1}
			onClick={() => {
				if (!p.disabled) p.onSelect();
			}}
			style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
		>
			<span style={{ flex: 1 }}>
				{p.label}
				{p.hint && (
					<span
						id={hintId}
						style={{
							display: 'block',
							whiteSpace: 'normal',
							font: `var(--text-xs)/1.4 ${T.sans}`,
							color: T.sub,
						}}
					>
						{p.hint}
					</span>
				)}
			</span>
		</Button>
	);
}

/** A viewport point: where a right-click or a long-press landed. */
export interface Point {
	x: number;
	y: number;
}

/** What a frame holds to open its tile menu: under the trigger, or at a pointer (RC-CAN-8.3). */
export interface MenuHandle {
	open: (at?: Point) => void;
}

/** How long a still finger has to rest on a tile before its menu opens, and how far it may drift. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;

/**
 * RC-CAN-8.3 — a touch held still on a tile opens its menu at the finger, the touch counterpart of a
 * right-click. Spread the handlers on the drag surface; `onPointerDown` must run before the board
 * starts its own gesture. When the press fires it takes the gesture over the way the browser does
 * when a touch becomes a scroll: it raises `pointercancel` on the window, and both boards abandon a
 * drag on that event, so the tile stays where it was.
 */
export function useLongPress(onPress: (at: Point) => void) {
	const timer = useRef<number | undefined>(undefined);
	const origin = useRef<Point>({ x: 0, y: 0 });
	const clear = () => window.clearTimeout(timer.current);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	return {
		onPointerDown: (e: React.PointerEvent) => {
			clear();
			if (e.pointerType !== 'touch') return;
			origin.current = { x: e.clientX, y: e.clientY };
			timer.current = window.setTimeout(() => {
				window.dispatchEvent(new Event('pointercancel'));
				onPress(origin.current);
			}, LONG_PRESS_MS);
		},
		onPointerMove: (e: React.PointerEvent) => {
			const { x, y } = origin.current;
			if (Math.hypot(e.clientX - x, e.clientY - y) > LONG_PRESS_SLOP) clear();
		},
		onPointerUp: clear,
		onPointerCancel: clear,
	};
}
