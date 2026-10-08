import { AudioPanel } from '../../../screens/session/NowPlaying';
import {
	useNowPlayingView,
	useSessionDispatch,
	useSessionSeat,
} from '../../../screens/session/useSessionView';

/**
 * The Session screen's now playing (RC-CAN-7.8, SCREENS_PARITY SE-18): the track, pause, resume,
 * stop and volume over `session.audio.*`.
 */
export function SessionNowPlayingBody() {
	const { actorId, isDm, previewing } = useSessionSeat();
	const dispatch = useSessionDispatch();
	const { audio, label } = useNowPlayingView();
	return (
		<AudioPanel
			audio={audio}
			trackLabel={label}
			isDm={isDm}
			previewing={previewing}
			onPause={() => dispatch({ type: 'session.audio.pause', actorId, payload: {} })}
			onResume={() => dispatch({ type: 'session.audio.resume', actorId, payload: {} })}
			onStop={() => dispatch({ type: 'session.audio.stop', actorId, payload: {} }, 'Audio stopped')}
			onVolume={(volume) =>
				dispatch({ type: 'session.audio.set-volume', actorId, payload: { volume } })
			}
		/>
	);
}
