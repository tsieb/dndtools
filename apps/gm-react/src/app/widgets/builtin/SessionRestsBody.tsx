import { RestTimelinePanel } from '../../../screens/session/Lifecycle';
import { useRestLog } from '../../../screens/session/useSessionView';

/**
 * The Session screen's rest timeline (RC-CAN-7.8, SCREENS_PARITY SE-25). It draws nothing while no
 * rest has been taken, and the screen leaves it out of the layout until one is.
 */
export function SessionRestsBody() {
	return <RestTimelinePanel entries={useRestLog()} />;
}
