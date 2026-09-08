/**
 * RC-AUD-3.3 — pure URL classification for the opt-in WEB EMBED sources (YouTube / SoundCloud). A
 * detected embed plays through a sandboxed `<iframe>` the provider serves, never through this
 * device's `<audio>` element — `audio-playback.ts` uses {@link detectAudioEmbedProvider} to skip its
 * own playback attempt for these URLs, and the Audio screen renders the actual player. The source is
 * still an ordinary `web-stream` `AudioSource` (AUDIO-009); this module only classifies its URL.
 *
 * No network call, no DOM. Any host that is not a recognized provider (including a direct audio file
 * URL) returns `null` and plays as an ordinary web stream, unaffected by this module.
 */

export type AudioEmbedProvider = 'youtube' | 'soundcloud';

function parseUrl(rawUrl: string): URL | null {
	try {
		return new URL(rawUrl);
	} catch {
		return null;
	}
}

/** Recognize a YouTube/SoundCloud page URL. Fails closed to `null` for anything else. */
export function detectAudioEmbedProvider(rawUrl: string): AudioEmbedProvider | null {
	const url = parseUrl(rawUrl);
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
	const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
	if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
	if (host === 'soundcloud.com' || host === 'on.soundcloud.com') return 'soundcloud';
	return null;
}

/**
 * Build the embed iframe `src` for a URL already classified as `provider`, or `null` when the URL
 * cannot be resolved to a playable embed (e.g. a YouTube URL with no video id) — never fabricates a
 * fallback. YouTube resolves through the no-cookie domain (no tracking cookie before playback);
 * SoundCloud's public player takes the original track/set URL verbatim as a query parameter.
 */
export function audioEmbedSrc(rawUrl: string, provider: AudioEmbedProvider): string | null {
	const url = parseUrl(rawUrl);
	if (!url) return null;
	if (provider === 'youtube') {
		const host = url.hostname.replace(/^www\./, '');
		const videoId = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
		if (!videoId) return null;
		return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1`;
	}
	return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=true&visual=false`;
}

/** Display name for a detected provider, for the add-source hint and the now-playing embed label. */
export const AUDIO_EMBED_PROVIDER_LABEL: Record<AudioEmbedProvider, string> = {
	youtube: 'YouTube',
	soundcloud: 'SoundCloud',
};
