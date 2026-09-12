import type { SVGProps } from 'react';
import { CANVAS, INK, WASH } from './frame';
import { RECORDS } from './records';
import { TABLE } from './table';
import { WORLD } from './world';

/**
 * RC-DSN-3.1 — the empty-state illustration set: warm line drawings in the theme accent, one per
 * empty surface. A surface shows one through `EmptyState`'s `illustration` prop; `Illustration` is
 * the bare drawing for the rare place that is not an `EmptyState`. The gallery at `#/__illustrations`
 * (DEV builds only) draws every key once.
 *
 * Keys are grouped by where the empty surface sits: `TABLE` (running a session), `RECORDS` (the
 * written record), `WORLD` (the world and its people). Gallery order follows this spread.
 */
export const ILLUSTRATIONS = { ...TABLE, ...RECORDS, ...WORLD };

export type IllustrationKey = keyof typeof ILLUSTRATIONS;

export const ILLUSTRATION_KEYS = Object.keys(ILLUSTRATIONS) as IllustrationKey[];

/** Narrow an untyped key, such as the one `EmptyState.jsx` receives, to a drawing that exists. */
export function isIllustrationKey(value: unknown): value is IllustrationKey {
	return typeof value === 'string' && Object.hasOwn(ILLUSTRATIONS, value);
}

type IllustrationProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
	name: IllustrationKey;
	/** Rendered edge in px. The set is drawn for 160. */
	size?: number;
};

/** One drawing, decorative (`aria-hidden`): the empty state's heading carries the meaning. */
export function Illustration({ name, size = CANVAS, style, ...rest }: IllustrationProps) {
	if (!isIllustrationKey(name)) return null;
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${CANVAS} ${CANVAS}`}
			aria-hidden="true"
			data-illustration={name}
			style={{ display: 'block', flexShrink: 0, ...style }}
			{...rest}
		>
			{/* The lamplight glow every drawing sits in: the accent wash, with no outline. */}
			<circle cx={CANVAS / 2} cy={CANVAS / 2} r={58} fill={WASH} stroke="none" />
			<g fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
				{ILLUSTRATIONS[name]}
			</g>
		</svg>
	);
}
