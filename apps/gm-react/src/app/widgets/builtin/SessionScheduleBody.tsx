import { SchedulePanel } from '../../../screens/session/Schedule';
import { useSessionSeat } from '../../../screens/session/useSessionView';

/**
 * The Session screen's "Schedule next session" (RC-CAN-7.8, SCREENS_PARITY SE-26): the host's
 * Google Calendar integration. DM only.
 */
export function SessionScheduleBody() {
	const { isDm } = useSessionSeat();
	return isDm ? <SchedulePanel /> : null;
}
