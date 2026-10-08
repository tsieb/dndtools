import { Toaster } from '../../../ds';
import { useI18n } from '../../../i18n';
import { StagePanel } from '../../../screens/session/ActiveMap';
import {
	usePlayers,
	useSessionDispatch,
	useSessionSeat,
	useStageView,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's stage and projection (RC-CAN-7.8, SCREENS_PARITY SE-19): the active map
 * (`session.set-active-map`), projecting it (`session.project-active-map`) and the per-player
 * projection row.
 */
export function SessionStageBody() {
	const { t } = useI18n();
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { maps, activeMapId } = useStageView();
	const players = usePlayers();
	return (
		<StagePanel
			maps={maps}
			activeMapId={activeMapId}
			isDm={isDm}
			// RC-SES-6.2 — projecting works in every workflow state, so the live gate is held open.
			isLive
			previewing={previewing}
			onSelect={(mapId) =>
				dispatch({ type: 'session.set-active-map', actorId, payload: { mapId } }, 'Active map set')
			}
			onProject={() => {
				if (players.length === 0) {
					Toaster.warning(t('projection.noPlayers'));
					return;
				}
				void dispatch(
					{
						type: 'session.project-active-map',
						actorId,
						payload: { playerActorIds: players.map((p) => p.id) },
					},
					t('projection.mapProjected'),
				);
			}}
		/>
	);
}
