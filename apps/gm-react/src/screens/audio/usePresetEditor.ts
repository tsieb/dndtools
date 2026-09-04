import { useMemo, useState, type FormEvent } from 'react';
import {
	listUserAudioPresets,
	type AudioPreset,
	type AudioPresetCategory,
	type CoreCommand,
} from '@dndtools/core';
import { Toaster } from '../../ds';
import { type AmbienceLayerEntry, type AudioTrackView } from './types';

/**
 * AUDIO-014 — the scene-package editor: the user preset list, the save form's local state and the
 * three preset dispatches. Extracted from Audio.tsx unchanged (RC-STB-2.6); only the `failure`
 * choke point and the reads it needs arrive as arguments instead of closing over the component.
 */
export function usePresetEditor({
	audioState,
	dmId,
	canEdit,
	track,
	ambienceLayers,
	failure,
}: {
	audioState: Parameters<typeof listUserAudioPresets>[0];
	dmId: string;
	canEdit: boolean;
	track: AudioTrackView | null;
	ambienceLayers: AmbienceLayerEntry[];
	failure: (command: CoreCommand) => Promise<string | null>;
}) {
	// catalog of atmosphere recipes. Applying drives the real session track + ambience through the core
	// gates — a preset whose layers aren't bound to a ready source reports honestly, never a guessed track.
	const userPresets = useMemo(() => listUserAudioPresets(audioState), [audioState]);
	const [presetName, setPresetName] = useState('');
	const [presetCategory, setPresetCategory] = useState<AudioPresetCategory>('dungeon');
	const [presetBusy, setPresetBusy] = useState(false);
	const [presetError, setPresetError] = useState<string | null>(null);
	const canSavePreset = canEdit && (!!track || ambienceLayers.length > 0);

	const applyPreset = async (preset: AudioPreset) => {
		if (!canEdit) return;
		const problem = await failure({
			type: 'session.audio.apply-preset',
			actorId: dmId,
			payload: {
				presetId: preset.id,
				online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
			},
		});
		if (problem) Toaster.error(problem);
		else Toaster.success(`Applied “${preset.name}”.`);
	};

	const saveCurrentPreset = async (e: FormEvent) => {
		e.preventDefault();
		if (presetBusy || !presetName.trim() || !canSavePreset) return;
		setPresetBusy(true);
		setPresetError(null);
		try {
			const problem = await failure({
				type: 'audio.save-preset',
				actorId: dmId,
				payload: { name: presetName.trim(), category: presetCategory },
			});
			if (problem) {
				setPresetError(problem);
			} else {
				Toaster.success(`Saved “${presetName.trim()}” as a scene package.`);
				setPresetName('');
			}
		} finally {
			setPresetBusy(false);
		}
	};

	const deletePreset = async (preset: AudioPreset) => {
		const problem = await failure({
			type: 'audio.delete-preset',
			actorId: dmId,
			payload: { presetId: preset.id },
		});
		if (problem) Toaster.error(problem);
		else Toaster.success(`Deleted “${preset.name}”.`);
	};

	return {
		userPresets,
		presetName,
		setPresetName,
		presetCategory,
		setPresetCategory,
		presetBusy,
		presetError,
		canSavePreset,
		applyPreset,
		saveCurrentPreset,
		deletePreset,
	};
}
