import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FLOW_COLUMNS, type FlowPlacement } from '../board-helpers';
import { T } from '../screen-kit';

/**
 * RC-CAN-7.6 — the pieces of a flow tile in BARE presentation (RC-WID-5.3), shared by `FlowBoard`
 * and the Command Center: a bare part is page content, sized by the grid to what it draws, with no
 * frame, and out of the layout while its body draws nothing.
 */

/**
 * The gap between bare parts. A bare part has no padding of its own, so the space between two of
 * them is the grid gap: the hub's 28px, 24px in a phone's single column. Framed tiles keep the
 * tighter tile gap, their frames carry the rest.
 */
export function flowPartGap(columns: number): string {
	return columns <= FLOW_COLUMNS.phone ? T.space.six : `calc(${T.space.six} + ${T.space.one})`;
}

/** The ids of view-mode bare tiles whose bodies currently draw nothing, and the setter they report to. */
export function useBlankTiles() {
	const [blank, setBlank] = useState<ReadonlySet<string>>(() => new Set());
	const report = useCallback((id: string, isBlank: boolean) => {
		setBlank((current) => {
			if (current.has(id) === isBlank) return current;
			const next = new Set(current);
			if (isBlank) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);
	return [blank, report] as const;
}

/** A bare tile's grid cell, or out of the grid (`display: none`, still mounted) while it draws nothing. */
export function FlowPart({
	placement,
	onBlank,
	children,
}: {
	placement: FlowPlacement | null;
	onBlank: (blank: boolean) => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const report = useRef(onBlank);
	report.current = onBlank;
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const check = () => {
			const region = node.querySelector<HTMLElement>('[data-widget-region]');
			// The grid sizes a part to its content, so its region never scrolls; it must not clip what
			// the part draws past its box either (a card's shadow, an outward focus ring). The region's
			// own `overflow: auto` is for a framed tile, which has a fixed size on the canvas.
			if (region && region.style.overflow !== 'visible') region.style.overflow = 'visible';
			const content = region?.firstElementChild;
			report.current(!!content && content.childElementCount === 0);
		};
		check();
		const observer = new MutationObserver(check);
		observer.observe(node, { childList: true, subtree: true, attributeFilter: ['style'] });
		return () => observer.disconnect();
	}, []);
	return (
		<div
			ref={ref}
			data-flow-index={placement?.index}
			style={
				placement
					? { gridColumn: gridColumnOf(placement), gridRow: gridRowOf(placement), minWidth: 0 }
					: { display: 'none' }
			}
		>
			{children}
		</div>
	);
}

export const gridColumnOf = (placement: FlowPlacement) =>
	`${placement.column + 1} / span ${placement.span}`;
export const gridRowOf = (placement: FlowPlacement) =>
	placement.rowSpan
		? `${placement.row + 1} / span ${placement.rowSpan}`
		: String(placement.row + 1);
