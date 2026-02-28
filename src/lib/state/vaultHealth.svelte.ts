import {
	getDesktopIntegrityReport,
	type DesktopIntegrityReport,
} from '$lib/platform/desktop/bridge.js';

export type VaultHealthSeverity = 'none' | 'info' | 'warning' | 'critical';

class VaultHealthState {
	report = $state<DesktopIntegrityReport | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);

	/** Highest severity of unrepaired issues. Drives the TopBar badge color. */
	severity = $derived.by((): VaultHealthSeverity => {
		const r = this.report;
		if (!r) return 'none';

		// Metadata file corruption is critical — vault may be inconsistent.
		const hasMetadataCritical = r.issues.some(
			(i) =>
				!i.repaired &&
				(i.status === 'missing' || i.status === 'invalid_json' || i.status === 'invalid_shape'),
		);
		if (hasMetadataCritical) return 'critical';

		// Checksum mismatch or orphaned index entries need human attention.
		const hasNoteCritical = r.noteIssues.some(
			(i) => !i.repaired && (i.status === 'checksum_mismatch' || i.status === 'orphan_entry'),
		);
		if (hasNoteCritical) return 'warning';

		// Missing / invalid marker — lower severity, auto-repaired on next write.
		const hasNoteInfo = r.noteIssues.some(
			(i) => !i.repaired && (i.status === 'missing_marker' || i.status === 'invalid_marker'),
		);
		if (hasNoteInfo) return 'info';

		return 'none';
	});

	/** Total count of unrepaired issues (metadata + notes). */
	issueCount = $derived.by(() => {
		const r = this.report;
		if (!r) return 0;
		const metaUnrepaired = r.issues.filter((i) => !i.repaired && i.status !== 'ok').length;
		const noteUnrepaired = r.noteIssues.filter((i) => !i.repaired).length;
		return metaUnrepaired + noteUnrepaired;
	});

	async refresh(): Promise<void> {
		if (!window.dndtoolsDesktop) return;
		this.loading = true;
		this.error = null;
		try {
			this.report = await getDesktopIntegrityReport();
		} catch (err) {
			this.error = String(err);
		} finally {
			this.loading = false;
		}
	}
}

export const vaultHealthState = new VaultHealthState();
