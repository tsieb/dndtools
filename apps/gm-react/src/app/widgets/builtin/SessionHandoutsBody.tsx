import { useState } from 'react';
import { Toaster } from '../../../ds';
import { useI18n } from '../../../i18n';
import { HandoutsPanel } from '../../../screens/session/Handouts';
import {
	useHandoutsView,
	usePlayers,
	useSessionDispatch,
	useSessionScenes,
	useSessionSeat,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's handouts (RC-CAN-7.8, SCREENS_PARITY SE-17): push one to the players
 * (`session.deliver-handout`), revoke it, and mark one read.
 */
export function SessionHandoutsBody() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { handouts, status } = useHandoutsView();
	const { startableScenes, activeSceneId, continueSceneId } = useSessionScenes();
	const players = usePlayers();
	const [title, setTitle] = useState('');
	const [body, setBody] = useState('');

	async function deliver(): Promise<void> {
		const heading = title.trim();
		if (!heading) return;
		// RC-SES-6.2 — a push works outside a session too, where no scene is active: it lands on the
		// scene a "Continue" start would resume, else the first scene the DM can see.
		const sceneId =
			activeSceneId ??
			startableScenes.find((scene) => scene.id === continueSceneId)?.id ??
			startableScenes[0]?.id ??
			null;
		if (!sceneId) {
			Toaster.warning(t('session.goLive.needsScene'));
			return;
		}
		if (players.length === 0) {
			Toaster.warning(t('projection.noPlayers'));
			return;
		}
		const ok = await dispatch(
			{
				type: 'session.deliver-handout',
				actorId,
				payload: {
					title: heading,
					sections: [{ heading, body: body.trim(), visibility: 'player-visible' as const }],
					sceneId,
					recipientActorIds: players.map((p) => p.id),
				},
			},
			t('projection.pushed', { title: heading, count: players.length }),
		);
		if (ok) {
			setTitle('');
			setBody('');
		}
	}

	return (
		<HandoutsPanel
			handouts={handouts}
			status={status}
			isDm={isDm}
			previewing={previewing}
			// Only DM-ness and preview gate the push: a missing scene or no players are said as toasts,
			// never a permanently greyed button nobody explains (RC-SES-6.2).
			canDeliver={isDm && !previewing}
			title={title}
			body={body}
			onTitle={setTitle}
			onBody={setBody}
			onDeliver={() => void deliver()}
			onRevoke={(id) =>
				dispatch(
					{ type: 'session.revoke-handout', actorId, payload: { handoutId: id } },
					'Handout revoked',
				)
			}
			onAcknowledge={(id) =>
				dispatch(
					{ type: 'session.acknowledge-handout', actorId, payload: { handoutId: id } },
					'Marked read',
				)
			}
		/>
	);
}
