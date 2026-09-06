import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type AudioAutomationAction, type AudioAutomationTriggerKind } from '@dndtools/core';
import { Slider } from '../../ds';
import { hasAssetBytes } from '../../platform/storage/assetStore';

/* The Audio screen's option tables, its two device-facing hooks (asset-byte presence and the
 * output-device list) and the commit-on-release slider. Extracted from Audio.tsx unchanged
 * (RC-STB-2.6). */

export const SOURCE_KIND_OPTIONS = [
	{ value: 'web-stream', label: 'Web stream (URL)' },
	{ value: 'bundled-preset', label: 'Bundled preset' },
	{ value: 'local-file', label: 'Local file library' },
] as const;
export type SourceKind = (typeof SOURCE_KIND_OPTIONS)[number]['value'];

export const TRIGGER_LABELS: Record<AudioAutomationTriggerKind, string> = {
	'combat-start': 'Combat starts',
	'map-reveal': 'Map reveal',
	'scene-activation': 'Scene activation',
	'handout-delivery': 'Handout delivery',
};
export const ACTION_LABELS: Record<AudioAutomationAction, string> = {
	play: 'Play',
	crossfade: 'Crossfade',
	stop: 'Stop',
};

/** Whether this browser can switch `<audio>` output devices at all (Firefox can't, e.g.). */
export const SUPPORTS_SINK_SELECTION =
	typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Byte-presence of one library asset in THIS device's asset-byte store. `unknown` until the async
 *  check settles — callers must render a NEUTRAL state for it (never the missing-bytes copy, never
 *  a blocked flag), because "we haven't looked yet" is not "it isn't there". */
export type BytesPresence = 'unknown' | 'present' | 'missing';

/** Live tri-state map of which library assets actually have BYTES in the device asset-byte store
 *  (honest, async). An id absent from the map is `unknown` (still resolving); recomputed whenever
 *  the asset id set changes (an import adds both metadata and bytes). */
export function useAssetBytesPresence(assetIds: string[]): Record<string, BytesPresence> {
	const [presence, setPresence] = useState<Record<string, BytesPresence>>({});
	const key = [...assetIds].sort().join('\n');
	useEffect(() => {
		const ids = key ? key.split('\n') : [];
		if (ids.length === 0) {
			setPresence({});
			return;
		}
		let cancelled = false;
		void Promise.all(
			ids.map(
				async (id) =>
					[id, (await hasAssetBytes(id).catch(() => false)) ? 'present' : 'missing'] as const,
			),
		).then((pairs) => {
			if (!cancelled) setPresence(Object.fromEntries(pairs));
		});
		return () => {
			cancelled = true;
		};
	}, [key]);
	return presence;
}

export interface OutputDeviceOption {
	deviceId: string;
	label: string;
}

/** Enumerate the device's audio OUTPUTS (feature-detected; refreshed on devicechange). */
export function useAudioOutputDevices(enabled: boolean): {
	outputs: OutputDeviceOption[];
	note: string | null;
} {
	const [outputs, setOutputs] = useState<OutputDeviceOption[]>([]);
	const [note, setNote] = useState<string | null>(null);
	useEffect(() => {
		if (!enabled) return;
		const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
		if (!media?.enumerateDevices) {
			setNote('This browser does not expose audio output devices.');
			return;
		}
		let cancelled = false;
		const refresh = () => {
			media.enumerateDevices().then(
				(devices) => {
					if (cancelled) return;
					// Pre-permission, browsers report outputs with an EMPTY deviceId — several of them,
					// indistinguishable from (and unroutable except as) the platform default. Drop them
					// and dedupe by id so the picker never offers colliding options.
					const outs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== '');
					const seen = new Set<string>();
					const unique = outs.filter((d) =>
						seen.has(d.deviceId) ? false : (seen.add(d.deviceId), true),
					);
					setOutputs(
						unique.map((d, i) => ({
							deviceId: d.deviceId,
							label: d.label || `Output device ${i + 1}`,
						})),
					);
					setNote(
						unique.length === 0 || unique.some((d) => !d.label)
							? 'Device names appear once the browser has granted media permission; unnamed outputs still work.'
							: null,
					);
				},
				() => {
					if (!cancelled) setNote('Output devices could not be enumerated on this browser.');
				},
			);
		};
		refresh();
		media.addEventListener?.('devicechange', refresh);
		return () => {
			cancelled = true;
			media.removeEventListener?.('devicechange', refresh);
		};
	}, [enabled]);
	return { outputs, note };
}

/**
 * CommitSlider — a Slider whose command goes out on RELEASE, not on every tick.
 *
 * The DS Slider fires `onChange` for every `input` event, and both volume faders dispatched
 * straight from it. Dragging master volume 0→100 therefore emitted ~100 durable commands, each one
 * a full-state IndexedDB write plus an op-log entry replicated to every connected player. The draft
 * tracks the pointer so the thumb still moves live; the command is sent once, on pointer-up / key-up
 * / blur. The wrapper (not the Slider) owns those handlers so the ± stepper buttons commit too.
 *
 * Two things the first version got wrong, both of which made the ± steppers look dead:
 *  - `pointerup` and `keyup` both fire BEFORE a button's synthesized `click`, so a stepper press
 *    always committed with `draft === null` and the value it had just produced only went out on the
 *    NEXT press (or on blur). `onClick` is therefore also a commit trigger — and `commit` has to
 *    read the draft from a REF, because the stepper's own `onChange` and the wrapper's `onClick`
 *    land in the same React batch and the handler's closure would still see the pre-press `null`.
 *  - `valueLabel` was computed by the caller from the DURABLE value while the thumb followed the
 *    draft, and `Slider` maps `valueLabel` to `aria-valuetext` (which overrides `aria-valuenow`).
 *    So the on-screen readout froze for the whole drag and five Arrow presses announced the same
 *    percentage. Callers now pass `format`, which is applied to the SHOWN value.
 */
export function CommitSlider({
	value,
	onCommit,
	format,
	style,
	...rest
}: {
	value: number;
	onCommit: (v: number) => void;
	format: (v: number) => string;
	style?: CSSProperties;
	disabled?: boolean;
	steppers?: boolean;
	'aria-label': string;
}) {
	// `null` means "follow the durable value", so an external change still moves the thumb.
	const [draft, setDraft] = useState<number | null>(null);
	const draftRef = useRef<number | null>(null);
	const shown = draft ?? value;
	const take = (v: number) => {
		draftRef.current = v;
		setDraft(v);
	};
	const commit = () => {
		const next = draftRef.current;
		if (next === null) return;
		draftRef.current = null;
		setDraft(null);
		if (next !== value) onCommit(next);
	};
	return (
		<div onPointerUp={commit} onKeyUp={commit} onBlur={commit} onClick={commit} style={style}>
			<Slider {...rest} value={shown} valueLabel={format(shown)} onChange={take} />
		</div>
	);
}
