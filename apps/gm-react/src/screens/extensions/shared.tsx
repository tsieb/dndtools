import type { CommandResult } from '@dndtools/core';
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
