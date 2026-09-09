import { useState } from 'react';
import { Toaster } from '../../ds';
import { useI18n } from '../../i18n';
import type { AudioImportRuntime } from '../../runtime/audio-import';
import { installStarterPack, loadStarterPackManifest } from '../../runtime/audio-starter-pack';

/**
 * RC-AUD-1.3 — the Audio screen's binding for the bundled starter pack.
 *
 * Install-on-demand, never on first run: an empty library is an honest empty library until the DM
 * asks for the pack. The hook holds only the button's busy/error state — the pack itself, its
 * licence gate and the import sequence live in `runtime/audio-starter-pack.ts`, so this stays a
 * few lines of screen state rather than another copy of the flow.
 *
 * Reporting is honest per track: a partly-installed pack says how many landed AND how many did not,
 * with the first real reason, instead of one green toast.
 */
export function useStarterPack(runtime: AudioImportRuntime, dmId: string, canEdit: boolean) {
	const { t } = useI18n();
	const [starterBusy, setStarterBusy] = useState(false);
	const [starterError, setStarterError] = useState<string | null>(null);

	const installStarter = async (): Promise<void> => {
		if (starterBusy || !canEdit) return;
		setStarterError(null);
		setStarterBusy(true);
		try {
			const manifest = await loadStarterPackManifest();
			if (!manifest.ok) {
				setStarterError(manifest.message);
				return;
			}
			const report = await installStarterPack(runtime, dmId, manifest.manifest);
			if (report.installed.length > 0) {
				Toaster.success(t('audio.starter.installed', { count: report.installed.length }));
			} else if (report.failed.length === 0) {
				Toaster.info(t('audio.starter.alreadyPresent'));
			}
			if (report.failed.length > 0) {
				const first = report.failed[0];
				setStarterError(
					t('audio.starter.partial', {
						count: report.failed.length,
						reason: first && !first.ok ? first.message : '',
					}),
				);
			}
		} catch (error) {
			setStarterError(error instanceof Error ? error.message : t('audio.starter.failed'));
		} finally {
			setStarterBusy(false);
		}
	};

	return { starterBusy, starterError, installStarter };
}
