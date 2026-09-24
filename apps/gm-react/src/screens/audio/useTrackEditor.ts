import { useState, type FormEvent } from 'react';
import { type CoreCommand } from '@dndtools/core';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import { useRuntime } from '../../runtime/RuntimeContext';
import { AUDIO_IMPORT_ACCEPT, importAudioFile } from '../../runtime/audio-import';
import { pickBinaryFile } from '../../platform/filePick';
import { isNativeDesktopRuntime } from '../../platform/windowChrome';
import { isNetworkDestinationAllowed, usePlatformCapabilities } from '../../platform/capabilities';
import { detectAudioEmbedProvider } from '../../runtime/audio-embed';
import { type SourceKind } from './shared';

/** Local draft and import lifecycle; all durable changes still pass through the runtime. */
export function useTrackEditor(
	canEdit: boolean,
	failure: (command: CoreCommand) => Promise<string | null>,
) {
	const { t } = useI18n();
	const runtime = useRuntime();
	const dmId = runtime.defaultActorId;
	const nativeDesktop = isNativeDesktopRuntime();
	const capabilities = usePlatformCapabilities();
	const android = capabilities.runtimeKind === 'android';
	// Add-track form (audio.configure-source — the same declared-cache path the demo seed uses).
	const [trackName, setTrackName] = useState('');
	const [trackUrl, setTrackUrl] = useState('');
	const [trackKind, setTrackKind] = useState<SourceKind>(() =>
		isNativeDesktopRuntime() ? 'bundled-preset' : 'web-stream',
	);
	const [addBusy, setAddBusy] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [addedName, setAddedName] = useState<string | null>(null);

	// Local file import (audio.import-asset + the device asset-byte store).
	const [importBusy, setImportBusy] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);

	const importAudio = async () => {
		if (importBusy || !canEdit) return;
		setImportError(null);
		setImportBusy(true);
		try {
			const picked = await pickBinaryFile(AUDIO_IMPORT_ACCEPT);
			if (!picked) return;
			const outcome = await importAudioFile(runtime, dmId, {
				name: picked.name,
				mime: picked.mime,
				bytes: picked.bytes,
			});
			if (!outcome.ok) {
				setImportError(outcome.message);
				return;
			}
			Toaster.success(
				t(outcome.deduped ? 'audio.importDeduped' : 'audio.imported', {
					title: outcome.title,
				}),
			);
			if (outcome.needsLicenseReview) {
				Toaster.warning(t('audio.importNoLicense', { title: outcome.title }));
			}
		} catch (error) {
			// The picked file's BYTES are written to the device asset store BEFORE the dispatch, so an
			// unwinding throw orphans them. Without this the whole import looked like it had never
			// registered: no message, no new asset, and storage silently consumed.
			setImportError(error instanceof Error ? error.message : t('audio.importFailed'));
		} finally {
			setImportBusy(false);
		}
	};

	// ADD TRACK — configure a declared source, exactly as the demo seed does for the now-playing stream.
	const addTrack = async (e: FormEvent) => {
		e.preventDefault();
		if (!canEdit || addBusy || !trackName.trim()) return;
		if (nativeDesktop && trackKind === 'web-stream') {
			setAddError(t('audio.addError.desktopBlocksStreams'));
			return;
		}
		if (trackKind === 'web-stream' && !trackUrl.trim()) {
			setAddError(t('audio.addError.needsUrl'));
			return;
		}
		if (
			trackKind === 'web-stream' &&
			android &&
			!isNetworkDestinationAllowed(trackUrl.trim(), capabilities.runtimeKind)
		) {
			setAddError(t('audio.addError.androidHttps'));
			return;
		}
		setAddBusy(true);
		setAddError(null);
		// The green "'X' added" was cleared only in the FAILURE branch, so it stayed pinned beside the
		// submit button while the next track was being typed, and survived a tab switch and back.
		setAddedName(null);
		try {
			// RC-AUD-3.3 — a recognized YouTube/SoundCloud URL is declared `none` (never cached): the
			// provider serves it, and this device never stores a byte of it. Any other web-stream URL
			// keeps the existing `cache-required` behavior (a DM-pinned copy CAN be cached for offline).
			const isEmbed =
				trackKind === 'web-stream' && detectAudioEmbedProvider(trackUrl.trim()) !== null;
			const problem = await failure({
				type: 'audio.configure-source',
				actorId: dmId,
				payload: {
					type: trackKind,
					displayName: trackName.trim(),
					url: trackKind === 'web-stream' ? trackUrl.trim() : null,
					cacheBehavior:
						trackKind === 'web-stream' ? (isEmbed ? 'none' : 'cache-required') : 'local',
				},
			});
			if (!problem) {
				setAddedName(trackName.trim());
				setTrackName('');
				setTrackUrl('');
			} else {
				setAddedName(null);
				setAddError(problem);
			}
		} finally {
			setAddBusy(false);
		}
	};

	return {
		trackName,
		setTrackName,
		trackUrl,
		setTrackUrl,
		trackKind,
		setTrackKind,
		addBusy,
		addError,
		addedName,
		setAddedName,
		importBusy,
		importError,
		importAudio,
		addTrack,
	};
}
