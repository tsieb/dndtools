import { PartyPanel } from '../../../screens/session/Roster';
import { useRoster } from '../../../screens/session/useSessionView';

/** The Session screen's party (RC-CAN-7.8, SCREENS_PARITY SE-24): each PC with its hit points. */
export function SessionPartyBody() {
	const { party } = useRoster();
	return <PartyPanel party={party} />;
}
