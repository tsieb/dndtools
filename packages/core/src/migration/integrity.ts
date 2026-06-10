import { DURABLE_STATE_DOCUMENT_IDS, type DurableStateDocumentId } from './schema-versions';

/**
 * A minimal structural snapshot of a durable document used to verify integrity. The
 * verifier never trusts the live runtime objects; it works from the persisted record's
 * declared schema version and a content fingerprint so the same check runs at restart.
 */
export interface DocumentIntegrityRecord {
	documentId: DurableStateDocumentId;
	present: boolean;
	schemaVersion: number | null;
	/** A deterministic content fingerprint of the persisted payload. */
	fingerprint: string | null;
}

export type IntegrityProblemKind =
	| 'missing-document'
	| 'missing-schema-version'
	| 'missing-fingerprint';

export interface IntegrityProblem {
	documentId: DurableStateDocumentId;
	kind: IntegrityProblemKind;
	message: string;
}

export interface IntegrityReport {
	consistent: boolean;
	checkedDocuments: number;
	problems: IntegrityProblem[];
}

/**
 * Verify that every durable document is present and structurally readable. This is the
 * integrity gate run before trusting persisted state and again after recovery to confirm
 * a consistent result (PLAT-008). A fresh vault (no documents at all) is consistent.
 */
export function verifyIntegrity(records: readonly DocumentIntegrityRecord[]): IntegrityReport {
	const byId = new Map(records.map((record) => [record.documentId, record]));
	const anyPresent = records.some((record) => record.present);
	const problems: IntegrityProblem[] = [];

	for (const documentId of DURABLE_STATE_DOCUMENT_IDS) {
		const record = byId.get(documentId);
		if (!record || !record.present) {
			// A fully fresh vault is consistent; a partially written vault (some present,
			// some missing) is not — that is the mid-write corruption state.
			if (anyPresent) {
				problems.push({
					documentId,
					kind: 'missing-document',
					message: `${documentId} document is missing from a non-empty vault.`,
				});
			}
			continue;
		}
		if (record.schemaVersion === null) {
			problems.push({
				documentId,
				kind: 'missing-schema-version',
				message: `${documentId} document has no schema version.`,
			});
		}
		if (record.fingerprint === null) {
			problems.push({
				documentId,
				kind: 'missing-fingerprint',
				message: `${documentId} document payload is unreadable.`,
			});
		}
	}

	return {
		consistent: problems.length === 0,
		checkedDocuments: records.filter((record) => record.present).length,
		problems,
	};
}
