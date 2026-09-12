import type { ReactNode } from 'react';

/**
 * Shared vocabulary for the empty-state illustrations (RC-DSN-3.1).
 *
 * Every drawing is authored on a 160 × 160 canvas and inherits the stroke set on the root group in
 * `Illustration`: the theme accent at 2px, round caps and joins, no fill. The only fill a drawing may
 * carry is the accent wash, applied through `Wash`. `illustrations.test.tsx` rejects any other fill
 * or stroke value, so a new drawing cannot drift into flat colour or a raw hex.
 */

/** Canvas edge in user units. The default rendered size matches it one to one. */
export const CANVAS = 160;

/** Line colour: the theme accent, so every drawing follows the active theme. */
export const INK = 'var(--color-accent)';

/** The one permitted fill: the accent's tinted surface, the same wash the app puts behind selection. */
export const WASH = 'var(--color-accent-subtle)';

/** Paint the enclosed shapes with the accent wash. They keep the inherited accent outline. */
export function Wash({ children }: { children: ReactNode }) {
	return <g fill={WASH}>{children}</g>;
}

/**
 * The "nothing here yet" line: dashed and lighter, for the slot, page or path the empty surface is
 * waiting on. Every drawing uses it for the thing that is missing, which is what makes the set read
 * as one family.
 */
export function Hint({ children }: { children: ReactNode }) {
	return (
		<g strokeDasharray="4 6" strokeOpacity={0.6}>
			{children}
		</g>
	);
}
