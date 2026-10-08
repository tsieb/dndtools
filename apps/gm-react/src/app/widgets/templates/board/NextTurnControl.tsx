import { useState } from 'react';
import { useI18n } from '../../../../i18n';
import { OpChip, SR_ONLY } from '../../../widget-body-kit';
import type { WidgetCommandOutcome } from './boardData';

/**
 * RC-WID-4.2 — "Next turn" on the initiative tile itself.
 *
 * The initiative tracker was the one operate-shaped widget with nothing to press: advancing the
 * order meant leaving the board for /session. RC-WID-5.7 made `combat.advance-turn` a command the
 * core runs for a widget by name, so the tile now runs its DECLARED command through
 * `widget.dispatch-command` (`onAdvance`); the core still decides whether this actor may. Without a
 * declared command the chip is the inert picture an editing board draws.
 *
 * The control is a real button, so Enter and Space operate it with no pointer equivalent to match.
 * It fails closed and honest: while no combat is running it soft-disables with the reason (the
 * pattern `OpChip` uses for any unavailable command) rather than sending a command the core rejects,
 * and a rejection that does happen is announced verbatim instead of being swallowed.
 */
export function NextTurnControl({
	running,
	onAdvance,
	dense = false,
}: {
	running: boolean;
	/** Runs the declared `combat.advance-turn`; absent while editing or when none is declared. */
	onAdvance?: () => Promise<WidgetCommandOutcome>;
	/** Inside a compact tile's own body, where the board-scale touch target does not fit. */
	dense?: boolean;
}) {
	const { t } = useI18n();
	const [announcement, setAnnouncement] = useState('');

	async function advance(run: () => Promise<WidgetCommandOutcome>) {
		const outcome = await run();
		setAnnouncement(outcome.ok ? '' : outcome.message);
	}

	return (
		<>
			<OpChip
				dense={dense}
				icon="skip"
				label={t('widgetBody.initiative.nextTurn')}
				unavailableReason={running ? undefined : t('widgetBody.initiative.nextTurnUnavailable')}
				onPress={onAdvance ? () => void advance(onAdvance) : undefined}
			/>
			{/* Mounted permanently and empty: a live region inserted together with its text is
			    routinely dropped (the lesson `DiceBody` records). */}
			<span role="status" style={SR_ONLY}>
				{announcement}
			</span>
		</>
	);
}
