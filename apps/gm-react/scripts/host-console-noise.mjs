// Chromium's own console error when the host has no audio output device (GitHub's hosted runners
// have none). It describes the machine, not the app, so the verify gates do not count it — the same
// single exception `watchJourney` in tests/e2e/_helpers.ts makes.
const HOST_AUDIO_DEVICE_ERROR =
	'The AudioContext encountered an error from the audio device or the WebAudio renderer.';

/** True for a console message that is an app error rather than host noise. */
export const isAppConsoleError = (message) =>
	message.type() === 'error' && message.text() !== HOST_AUDIO_DEVICE_ERROR;
