import { useSession } from '../../../net/SessionContext';
import { RosterPanel } from '../../../screens/session/Roster';
import { usePresence } from '../../../screens/session/useSessionView';

/**
 * The Session screen's table roster (RC-CAN-7.8, SCREENS_PARITY SE-23): the live P2P peers and the
 * core presence, projected for this viewer.
 */
export function SessionRosterBody() {
	const session = useSession();
	const presence = usePresence();
	return (
		<RosterPanel hosting={session.role === 'host'} peers={session.peers} presence={presence} />
	);
}
