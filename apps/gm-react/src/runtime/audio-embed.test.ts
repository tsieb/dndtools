import { describe, expect, it } from 'vitest';
import { audioEmbedSrc, detectAudioEmbedProvider } from './audio-embed';

/**
 * RC-AUD-3.3 — pure classification of the opt-in web-embed sources. No network, no DOM: every case
 * here is a plain string in, a plain result out.
 */
describe('detectAudioEmbedProvider', () => {
	it('recognizes youtube.com and youtu.be, with or without www.', () => {
		expect(detectAudioEmbedProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
		expect(detectAudioEmbedProvider('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
		expect(detectAudioEmbedProvider('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
		expect(detectAudioEmbedProvider('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
	});

	it('recognizes soundcloud.com and on.soundcloud.com', () => {
		expect(detectAudioEmbedProvider('https://soundcloud.com/artist/track')).toBe('soundcloud');
		expect(detectAudioEmbedProvider('https://on.soundcloud.com/abcd')).toBe('soundcloud');
	});

	it('returns null for a direct audio file URL (plays as an ordinary web stream)', () => {
		expect(detectAudioEmbedProvider('https://cdn.example.com/tavern-ambience.mp3')).toBeNull();
	});

	it('returns null for an unparsable or non-http(s) URL (fail closed)', () => {
		expect(detectAudioEmbedProvider('not a url')).toBeNull();
		expect(detectAudioEmbedProvider('javascript:alert(1)')).toBeNull();
		expect(detectAudioEmbedProvider('ftp://youtube.com/watch?v=x')).toBeNull();
	});
});

describe('audioEmbedSrc', () => {
	it('builds a youtube-nocookie embed src from a watch URL', () => {
		expect(audioEmbedSrc('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube')).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1',
		);
	});

	it('builds a youtube-nocookie embed src from a youtu.be short URL', () => {
		expect(audioEmbedSrc('https://youtu.be/dQw4w9WgXcQ', 'youtube')).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1',
		);
	});

	it('returns null for a youtube URL with no video id (never fabricates a fallback)', () => {
		expect(audioEmbedSrc('https://www.youtube.com/', 'youtube')).toBeNull();
	});

	it('builds a soundcloud player src carrying the original track URL', () => {
		const src = audioEmbedSrc('https://soundcloud.com/artist/track', 'soundcloud');
		expect(src).toBe(
			'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack&auto_play=true&visual=false',
		);
	});

	it('returns null for an unparsable URL', () => {
		expect(audioEmbedSrc('not a url', 'youtube')).toBeNull();
	});
});
