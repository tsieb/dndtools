import { CampaignDatePanel } from '../../../screens/session/CampaignDate';
import {
	useCampaignDateView,
	useSessionDispatch,
	useSessionSeat,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's campaign date (RC-CAN-7.8, SCREENS_PARITY SE-20): `session.set-campaign-date`
 * over the calendar continuity the Campaign timeline reads. DM only.
 */
export function SessionCampaignDateBody() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { calendar, current } = useCampaignDateView();
	if (!isDm) return null;
	return (
		<CampaignDatePanel
			calendar={calendar}
			current={current}
			previewing={previewing}
			onSet={(date, ok) =>
				void dispatch({ type: 'session.set-campaign-date', actorId, payload: { date } }, ok)
			}
		/>
	);
}
