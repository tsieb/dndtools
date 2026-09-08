import { useState } from 'react';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useI18n } from '../../../i18n';
import { OpChip, SR_ONLY } from '../../widget-body-kit';

/**
 * RC-WID-4.2 — "Next turn" on the initiative tile itself.
 *
 * The initiative tracker was the one operate-shaped widget with nothing to press: advancing the
 * order meant leaving the board for /session. Unlike the timer and dice tiles this cannot ride
 * `widget.dispatch-command` — the `initiative-tracker` definition declares no commands and
 * `commands/widget-command.ts` has no combat reducer — so it dispatches `combat.advance-turn`
 * straight through the runtime, exactly as `InitiativeTracker.tsx` already dispatches
 * `combat.apply-resource` from the same tile. The core still decides whether this actor may.
 *
 * The control is a real button, so Enter and Space operate it with no pointer equivalent to match.
 * It fails closed and honest: while no combat is running it soft-disables with the reason (the
 * pattern `OpChip` uses for session-only commands) rather than sending a command the core rejects,
 * and a rejection that does happen is announced verbatim instead of being swallowed.
 */
export function NextTurnControl({
	running,
	interactive,
}: {
	running: boolean;
	interactive: boolean;
}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const [announcement, setAnnouncement] = useState('');

	async function advance() {
		const result = await runtime.dispatch({
			type: 'combat.advance-turn',
			actorId: runtime.defaultActorId,
			payload: {},
		});
		setAnnouncement(result.status === 'accepted' ? '' : (result.rejection?.message ?? ''));
	}

	return (
		<>
			<OpChip
				icon="skip"
				label={t('widgetBody.initiative.nextTurn')}
				unavailableReason={running ? undefined : t('widgetBody.initiative.nextTurnUnavailable')}
				onPress={interactive ? () => void advance() : undefined}
			/>
			{/* Mounted permanently and empty: a live region inserted together with its text is
			    routinely dropped (the lesson `DiceBody` records). */}
			<span role="status" style={SR_ONLY}>
				{announcement}
			</span>
		</>
	);
}
