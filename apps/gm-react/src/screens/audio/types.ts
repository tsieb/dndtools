import {
	getSessionAudioView,
	listAudioAssociationsForActor,
	listScenesForActor,
} from '@dndtools/core';
import { ensureAudioPlayback } from '../../runtime/audio-playback';

/* Aliases for the shapes the Audio screen passes down, derived from the core queries and the
 * playback driver so they can never drift. Introduced by the RC-STB-2.6 split of Audio.tsx. */

export type SessionAudioView = ReturnType<typeof getSessionAudioView>;
export type AudioTrackView = NonNullable<SessionAudioView['track']>;
export type AudioAssociationView = ReturnType<typeof listAudioAssociationsForActor>[number];
export type SceneListRow = ReturnType<typeof listScenesForActor>[number];
export type AudioPlaybackDriver = ReturnType<typeof ensureAudioPlayback>;
export type AudioPlaybackSnapshot = ReturnType<AudioPlaybackDriver['getSnapshot']>;
/** `Object.entries(audioView.ambienceLayers)` — the mixer renders the [layerId, layer] pairs. */
export type AmbienceLayerEntry = [
	string,
	Extract<SessionAudioView, { role: 'dm' }>['ambienceLayers'][string],
];
