import { useState } from 'react';
import type { CommandCenterState } from '@dndtools/core';
import type { SceneRuntime } from '../../runtime/SceneRuntime';
import { useI18n } from '../../i18n';

/**
 * RC-CAN-8.8 — which preset the current safe point was taken in front of. Keyed by the capture
 * time, so any later checkpoint (entering edit mode, applying a template) has a different
 * `capturedAt` and drops the stale "before you applied". Module scope because the Layouts panel
 * reads it and the board, which holds this hook, passes the panel only the commands.
 */
let capturedBefore: { at: string; name: string } | null = null;

/** What "Restore previous layout" would put back, or null when there is no safe point yet. */
export function safePointOf(commandCenter: CommandCenterState) {
	const autoSave = commandCenter.autoSave ?? null;
	if (!autoSave) return null;
	return {
		capturedAt: autoSave.capturedAt,
		tileCount: autoSave.widgets.length,
		beforeApplying: capturedBefore?.at === autoSave.capturedAt ? capturedBefore.name : null,
	};
}

/**
 * The board's saved layouts: naming and saving a preset, the CMD-008 auto-save safe point, applying
 * a preset and restoring the safe point.
 *
 * A pure move out of `Board.tsx` (RC-ENG-2.2 — that screen had grown past the RC-STB-2.7 file-size
 * limit). The commands, the guards and the status messages are exactly what lived inline; the
 * screen still owns the guarded `dispatch` wrapper and the live-region `status`, and passes them in.
 */
export function useBoardLayouts({
	runtime,
	actorId,
	dispatch,
	setStatus,
}: {
	runtime: SceneRuntime;
	actorId: string;
	dispatch: (command: Parameters<SceneRuntime['dispatch']>[0]) => Promise<boolean>;
	setStatus: (message: string | null) => void;
}) {
	const { t } = useI18n();
	const [presetName, setPresetName] = useState('');

	async function savePreset() {
		if (!presetName.trim()) return;
		const ok = await dispatch({
			type: 'command-center.save-preset',
			actorId,
			payload: { name: presetName.trim() },
		});
		if (ok) {
			setStatus(t('board.layoutSaved', { name: presetName.trim() }));
			setPresetName('');
		}
	}

	// Capture the current layout as the auto-save safe point (CMD-008). Best-effort and silent — it is
	// an automatic checkpoint, not a user action, so a rejection (e.g. before the home Scene exists)
	// must not surface as a status message. Taken when an edit session begins and before a preset is
	// applied, so "Restore previous layout" can always revert the last destructive change.
	async function snapshotSafePoint() {
		// `SceneRuntime.dispatchNow` RETHROWS on a persist failure, and this is awaited FIRST inside
		// `applyPreset` — so a failed checkpoint used to throw straight out of the function before
		// the user's own guarded dispatch ever ran: "Apply a saved layout" did nothing, said
		// nothing, and left an unhandled rejection. A best-effort checkpoint must never veto the
		// action it precedes.
		try {
			await runtime.dispatch({ type: 'command-center.snapshot-auto-save', actorId, payload: {} });
		} catch {
			/* silent by design — see above */
		}
	}

	async function applyPreset(presetId: string, name: string) {
		await snapshotSafePoint();
		const at = runtime.state.commandCenter.autoSave?.capturedAt;
		const ok = await dispatch({
			type: 'command-center.apply-preset',
			actorId,
			payload: { presetId },
		});
		if (!ok) return;
		if (at) capturedBefore = { at, name };
		setStatus(t('board.layoutApplied', { name }));
	}

	async function restoreSafePoint() {
		const ok = await dispatch({ type: 'command-center.restore-auto-save', actorId, payload: {} });
		if (ok) setStatus(t('board.layoutRestored'));
	}

	return {
		presetName,
		setPresetName,
		savePreset,
		snapshotSafePoint,
		applyPreset,
		restoreSafePoint,
	};
}
