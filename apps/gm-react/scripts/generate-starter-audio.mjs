#!/usr/bin/env node
/**
 * RC-AUD-1.3 — generate the bundled starter audio pack.
 *
 * The pack ships as CC0-1.0 because it is SYNTHESIZED HERE, from this script, rather than sourced
 * from a third party whose provenance nobody in this repo could verify. That is the point of keeping
 * the generator in the tree: the licence claim in `public/audio/starter/manifest.json` and in
 * `NOTICE.md` is auditable — re-run this script and you get the same bytes back.
 *
 *   node apps/gm-react/scripts/generate-starter-audio.mjs
 *
 * `manifest.json` is listed in `.prettierignore`: it is generated, and reformatting it would fight
 * this script's output on the next run.
 *
 * Output: three seamless ambience loops (WAV, 22050 Hz, 16-bit mono, 6 s) plus a manifest. WAV and
 * not Ogg/Opus because the repo carries no audio encoder; the format is in the core's native MIME
 * allowlist (`audio/wav`), so the install path needs no special case.
 *
 * Every generator is DETERMINISTIC: the noise source is a seeded xorshift, so a re-run reproduces the
 * bytes exactly and a diff on the committed files is meaningful.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'starter');
const SAMPLE_RATE = 22050;
const SECONDS = 6;
/** The loop is crossfaded onto itself over this tail so the seam is inaudible when the engine loops. */
const CROSSFADE_SECONDS = 0.35;

/** Seeded xorshift32 in [-1, 1). Deterministic across platforms (all math is 32-bit integer). */
function noise(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 0x80000000 - 1;
	};
}

/** One-pole low-pass. `cut` is the coefficient in (0,1]: smaller = darker. */
function lowpass(cut) {
	let z = 0;
	return (x) => (z += cut * (x - z));
}

/** One-pole high-pass built from the complement of a low-pass. */
function highpass(cut) {
	const lp = lowpass(cut);
	return (x) => x - lp(x);
}

/** Wind over stone: band-passed noise, breathed by two slow LFOs at loop-commensurate rates. */
function wind(t, rng, state) {
	const n = state.hp(state.lp(rng()));
	const breath =
		0.45 +
		0.35 * Math.sin((2 * Math.PI * 1 * t) / SECONDS) +
		0.2 * Math.sin((2 * Math.PI * 3 * t) / SECONDS + 1.1);
	return n * breath * 1.8;
}

/** Hearth: a brown-noise bed plus sparse decaying crackles. */
function hearth(t, rng, state) {
	state.brown = state.brown * 0.985 + rng() * 0.08;
	const bed = state.lp(state.brown) * 2.2;
	// Crackles are drawn from the same deterministic stream, then decay over ~60 ms.
	if (rng() > 0.985 && state.crackle < 0.05) state.crackle = 0.6 + 0.4 * Math.abs(rng());
	const spark = state.crackle * state.hp(rng());
	state.crackle *= 0.9975;
	return bed * 0.8 + spark * 0.5;
}

/** Cavern drone: a low fifth with slow beating, plus a wash of very dark noise and drip transients. */
function cavern(t, rng, state) {
	const base = 55; // A1
	const tone =
		0.5 * Math.sin(2 * Math.PI * base * t) +
		0.3 * Math.sin(2 * Math.PI * base * 1.5 * t + 0.6) +
		0.16 * Math.sin(2 * Math.PI * (base * 2 + 0.5) * t);
	const swell = 0.7 + 0.3 * Math.sin((2 * Math.PI * 2 * t) / SECONDS);
	const wash = state.lp(rng()) * 0.5;
	return tone * swell * 0.55 + wash;
}

const TRACKS = [
	{
		id: 'starter-wind-over-stone',
		file: 'wind-over-stone.wav',
		title: 'Wind over stone',
		tags: ['ambience', 'outdoors', 'wind', 'starter'],
		seed: 0x5ee11,
		make: () => ({ lp: lowpass(0.22), hp: highpass(0.5) }),
		render: wind,
		gain: 0.55,
	},
	{
		id: 'starter-hearth-and-embers',
		file: 'hearth-and-embers.wav',
		title: 'Hearth and embers',
		tags: ['ambience', 'tavern', 'fire', 'starter'],
		seed: 0x1f19e,
		make: () => ({ lp: lowpass(0.09), hp: highpass(0.72), brown: 0, crackle: 0 }),
		render: hearth,
		gain: 0.6,
	},
	{
		id: 'starter-cavern-drone',
		file: 'cavern-drone.wav',
		title: 'Cavern drone',
		tags: ['ambience', 'dungeon', 'drone', 'starter'],
		seed: 0xcafe1,
		make: () => ({ lp: lowpass(0.05) }),
		render: cavern,
		gain: 0.5,
	},
];

/** Render one track to mono float samples, crossfading the tail over the head for a seamless loop. */
function renderTrack(track) {
	const total = SAMPLE_RATE * SECONDS;
	const tail = Math.floor(SAMPLE_RATE * CROSSFADE_SECONDS);
	const rng = noise(track.seed);
	const state = track.make();
	const raw = new Float64Array(total + tail);
	for (let i = 0; i < raw.length; i++)
		raw[i] = track.render(i / SAMPLE_RATE, rng, state) * track.gain;

	const out = new Float64Array(total);
	out.set(raw.subarray(0, total));
	for (let i = 0; i < tail; i++) {
		// equal-power crossfade of the overrun back onto the head
		const x = (i + 1) / (tail + 1);
		const a = Math.cos((x * Math.PI) / 2);
		const b = Math.sin((x * Math.PI) / 2);
		out[i] = out[i] * b + raw[total + i] * a;
	}
	// Normalise to -3 dBFS so the three tracks sit at a comparable level.
	let peak = 0;
	for (const v of out) peak = Math.max(peak, Math.abs(v));
	const scale = peak > 0 ? 0.708 / peak : 1;
	for (let i = 0; i < out.length; i++) out[i] *= scale;
	return out;
}

/** Wrap mono float samples as a 16-bit PCM WAV file. */
function toWav(samples) {
	const bytes = Buffer.alloc(44 + samples.length * 2);
	bytes.write('RIFF', 0, 'ascii');
	bytes.writeUInt32LE(36 + samples.length * 2, 4);
	bytes.write('WAVE', 8, 'ascii');
	bytes.write('fmt ', 12, 'ascii');
	bytes.writeUInt32LE(16, 16);
	bytes.writeUInt16LE(1, 20); // PCM
	bytes.writeUInt16LE(1, 22); // mono
	bytes.writeUInt32LE(SAMPLE_RATE, 24);
	bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
	bytes.writeUInt16LE(2, 32);
	bytes.writeUInt16LE(16, 34);
	bytes.write('data', 36, 'ascii');
	bytes.writeUInt32LE(samples.length * 2, 40);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		bytes.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
	}
	return bytes;
}

mkdirSync(OUT_DIR, { recursive: true });
const entries = TRACKS.map((track) => {
	const wav = toWav(renderTrack(track));
	writeFileSync(join(OUT_DIR, track.file), wav);
	return {
		id: track.id,
		file: track.file,
		title: track.title,
		mimeType: 'audio/wav',
		byteLength: wav.byteLength,
		sha256: createHash('sha256').update(wav).digest('hex'),
		durationSeconds: SECONDS,
		tags: track.tags,
		license: {
			kind: 'cc0',
			licenseNote:
				'CC0 1.0 Universal — synthesised for this project by scripts/generate-starter-audio.mjs',
			attribution: '',
		},
	};
});

const manifest = {
	schemaVersion: 1,
	name: 'Lamplight starter pack',
	description: 'Three seamless ambience loops to play with before you import your own audio.',
	generator: 'apps/gm-react/scripts/generate-starter-audio.mjs',
	tracks: entries,
};
writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);
console.log(`wrote ${entries.length} tracks + manifest.json to ${OUT_DIR}`);
