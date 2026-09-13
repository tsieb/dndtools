import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../ds';

/**
 * RC-WID-4.4 — the two pieces of the widget accessibility contract the builtin bodies share.
 *
 * A tile on the board changes while nobody is touching it: the round ticks over, a track starts, a
 * player joins. A sighted DM sees the number move; a screen-reader user heard nothing, because every
 * body mutated its text in place. `LiveReadout` is the answer: the body's VALUE readout (the part that
 * moves on its own, not authored prose) is a polite live region, mounted for as long as the readout
 * is, so the change is announced. It is never inserted together with its text — a region that
 * arrives with its content is routinely dropped (the lesson `DiceBody` records).
 *
 * `aria-live`, not `role="status"`: the canvas's confirmation channel ("Undone: moved …") is THE
 * status of a board, and twenty tiles each claiming the role would make it one of twenty — for an
 * assistive technology that lists status regions, and for every lookup that finds it by that role.
 *
 * `StateMark` is the other half: the accent tone on a chip is the only thing that told "done" from
 * "not done" or "pinned" from "not pinned", which is colour carrying a state on its own (WCAG 1.4.1),
 * and forced-colors mode flattens both tones to the same system colour. The mark adds a shape and a
 * spoken word. It draws no text of its own, so a locator or snapshot reading the chip is unchanged.
 */

/** The flex row the bodies lead with (label over figure, side by side). */
export const STAT_ROW: CSSProperties = { display: 'flex', gap: 'var(--space-4)' };

export function LiveReadout({
	children,
	style,
	testId,
}: {
	children: ReactNode;
	style?: CSSProperties;
	testId?: string;
}) {
	return (
		<div aria-live="polite" aria-atomic="true" data-testid={testId} style={style}>
			{children}
		</div>
	);
}

/** The body's stat row, announced as one sentence when any figure in it changes. */
export function LiveStats({ children }: { children: ReactNode }) {
	return <LiveReadout style={STAT_ROW}>{children}</LiveReadout>;
}

/** A state shown by shape and name, for a chip whose tone would otherwise carry it alone. */
export function StateMark({ icon, label }: { icon: string; label: string }) {
	return <Icon name={icon} size={11} label={label} style={{ marginRight: 'var(--space-1)' }} />;
}
