import { useEffect, useRef, type ReactNode } from 'react';
import type { CommandResult } from '@dndtools/core';
import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import type { MessageKey } from '../../i18n';

/* ---- Shared across the Extensions panels -------------------------------------------------------- */

/** The three visibility words, as catalog keys — the panels render them through `t()`. */
export const VISIBILITY_WORD: Record<string, MessageKey> = {
	'dm-only': 'common.visibility.dmOnly',
	shared: 'common.visibility.shared',
	'player-visible': 'common.visibility.playerVisible',
};

/** Pull a string field off the first emitted event of a given kind (mirrors CharBuilder/demo-seed). */
export function eventField(result: CommandResult, kind: string, field: string): string | null {
	if (result.status !== 'accepted') return null;
	for (const event of result.events) {
		if ((event as { kind?: string }).kind === kind) {
			const value = (event as unknown as Record<string, unknown>)[field];
			if (typeof value === 'string') return value;
		}
	}
	return null;
}

/**
 * Why a panel's controls are disabled: a player (or the DM previewing as one) can look but not
 * change anything. A lock shape, not just muted text, so the reason reads without colour.
 */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
	return (
		<div
			role="note"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-1-5)',
				font: `var(--text-xs)/1.5 ${T.sans}`,
				color: T.sub,
			}}
		>
			<Icon name="lock" size={14} aria-hidden="true" />
			<span>{children}</span>
		</div>
	);
}

/**
 * An inline confirm replaces the button that raised it, which drops keyboard focus to <body>: the
 * user had to Tab back in from the top of the page to answer a destructive prompt. `autoFocus` on
 * the confirm did not survive that swap, so focus moves to the first enabled button inside the
 * returned ref once `revealed` turns true.
 */
export function useFocusOnReveal<T extends HTMLElement>(revealed: boolean) {
	const ref = useRef<T>(null);
	useEffect(() => {
		if (revealed) ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
	}, [revealed]);
	return ref;
}
