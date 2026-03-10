import { MATURITY_THRESHOLDS } from '$lib/domain/maturity-thresholds.js';
import {
	deriveVaultDisclosureState,
	type VaultDisclosureState,
	type VaultMaturitySignals,
} from '$lib/domain/vault-maturity.js';
import { noteToVaultObject } from '$lib/domain/object-notes.js';
import { linksState } from '$lib/state/links.svelte.js';
import { notesState } from '$lib/state/notes.svelte.js';
import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
import { vaultState } from '$lib/state/vault.svelte.js';

class VaultMaturityState {
	signals = $derived.by<VaultMaturitySignals>(() => {
		const activeNotes = notesState.activeNotes;
		let linkCount = 0;
		let mapCount = 0;
		let objectNoteCount = 0;

		for (const note of activeNotes) {
			linkCount += linksState.getForwardLinkCount(note.id);
			const object = noteToVaultObject(note);
			if (!object) continue;
			objectNoteCount += 1;
			if (object.type === 'map') {
				mapCount += 1;
			}
		}

		return {
			noteCount: activeNotes.length,
			linkCount,
			tagCount: vaultState.tagCounts.length,
			sessionCount: sessionBoardsState.boards.length,
			mapCount,
			objectNoteCount,
		};
	});

	disclosure = $derived.by<VaultDisclosureState>(() =>
		deriveVaultDisclosureState(this.signals, MATURITY_THRESHOLDS),
	);
}

export const vaultMaturityState = new VaultMaturityState();
