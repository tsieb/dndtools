import { RecapPanel } from '../../../screens/session/PrepRecap';
import {
	useArchives,
	useMapList,
	usePrepRecapDigest,
	useSessionDispatch,
	useSessionSeat,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's prep and recap (RC-CAN-7.8, SCREENS_PARITY SE-21): the continuity digest,
 * the session archives and, in Recap, recap authoring (`session.author-recap`). DM only.
 */
export function SessionPrepRecapBody() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const digest = usePrepRecapDigest();
	const { archives, recapArchiveId } = useArchives();
	const maps = useMapList();
	if (!isDm) return null;
	return (
		<RecapPanel
			digest={digest}
			archives={archives}
			maps={maps}
			defaultArchiveId={recapArchiveId}
			previewing={previewing}
			onAuthor={(archiveId, markdown) =>
				dispatch(
					{ type: 'session.author-recap', actorId, payload: { archiveId, markdown } },
					'Recap saved',
				)
			}
		/>
	);
}
