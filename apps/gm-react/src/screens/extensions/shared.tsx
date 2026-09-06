import type { CommandResult } from '@dndtools/core';

/* ---- Shared across the Extensions panels -------------------------------------------------------- */

export const VISIBILITY_WORD: Record<string, string> = {
	'dm-only': 'DM only',
	shared: 'Shared',
	'player-visible': 'Player visible',
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
