import type { AdvancementState, EligibilityResult } from '@dndtools/core';
import { CharacterLevelUpWizard } from '../../app/character/LevelUp';
import type { Dispatch } from './shared';

/**
 * RC-CHR-2.1 — the Player screen's Level up tab.
 *
 * The flat CHAR-009 checklist that used to live here is now the guided wizard in
 * `app/character/LevelUp.tsx`, shared with any other surface that needs to level a character. This
 * file stays as the tab's entry point so the screen keeps one import per tab; it holds no level-up
 * logic of its own.
 */
export function PlayerLevelUp({
	charId,
	actorId,
	advancement,
	xpEligible,
	milestoneEligible,
	dispatch,
}: {
	charId: string;
	actorId: string;
	advancement: AdvancementState | null;
	xpEligible: EligibilityResult | null;
	milestoneEligible: EligibilityResult | null;
	dispatch: Dispatch;
}) {
	return (
		<CharacterLevelUpWizard
			characterId={charId}
			actorId={actorId}
			advancement={advancement}
			xpEligible={xpEligible}
			milestoneEligible={milestoneEligible}
			dispatch={dispatch}
		/>
	);
}
